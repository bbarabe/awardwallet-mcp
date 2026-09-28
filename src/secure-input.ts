/**
 * Local one-time form for secrets (loyalty or mailbox passwords, OAuth tokens) that an AwardWallet
 * operation needs. The tool call returns a link; the user types the secret into this page; the
 * server sends the request to AwardWallet directly. Secrets never reach the conversation, logs or
 * disk. The page listens on 127.0.0.1 only, each link is an unguessable single-use token that
 * expires after 15 minutes, and the page runs no scripts.
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { API_NAMES, AwardWalletApiError, type AwardWalletClient } from "./awardwallet/client.js";
import { executeCall, type PreparedCall } from "./catalog/index.js";
import type { SecretField } from "./catalog/types.js";
import type { AppConfig } from "./config.js";
import { APP_CSS, html, PAGE_CSP, renderDocument } from "./ui/html.js";

const LINK_TTL_MS = 15 * 60_000;
const KEEP_RESULT_MS = 60 * 60_000;
const MAX_FORM_BYTES = 64 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export type SubmissionStatus = "waiting" | "sending" | "completed" | "failed" | "cancelled" | "expired";

export interface Submission {
  id: string;
  call: PreparedCall;
  fields: SecretField[];
  status: SubmissionStatus;
  createdAt: number;
  expiresAt: number;
  finishedAt?: number;
  response?: unknown;
  error?: string;
}

export class SecureInputServer {
  private server?: Server;
  private port?: number;
  private starting?: Promise<void>;
  private readonly submissions = new Map<string, Submission>();

  constructor(
    private readonly client: AwardWalletClient,
    private readonly options: AppConfig["secureInput"],
  ) {}

  /** Registers a pending request and returns the link the user opens to complete it. */
  async create(call: PreparedCall, fields: SecretField[]): Promise<{ submissionId: string; url: string; expiresAt: string }> {
    await this.ensureStarted();
    this.sweep();
    const id = randomBytes(24).toString("base64url");
    const now = Date.now();
    this.submissions.set(id, { id, call, fields, status: "waiting", createdAt: now, expiresAt: now + LINK_TTL_MS });
    return { submissionId: id, url: `${this.baseUrl()}/secure/${id}`, expiresAt: new Date(now + LINK_TTL_MS).toISOString() };
  }

  get(id: string): Submission | undefined {
    this.sweep();
    return this.submissions.get(id);
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.starting = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  baseUrl(): string {
    return this.options.publicUrl ?? `http://127.0.0.1:${this.port}`;
  }

  private ensureStarted(): Promise<void> {
    if (this.server) return Promise.resolve();
    this.starting ??= new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        this.handle(req, res).catch((error: unknown) => {
          console.error("[awardwallet-mcp] secure input page error:", error instanceof Error ? error.message : error);
          if (!res.headersSent) this.send(res, 500, page("Something went wrong", html`<h1 class="error">Something went wrong</h1><p>Try again from your AI assistant.</p>`));
        });
      });
      server.on("error", (error) => {
        // Let a later call retry (e.g. once a fixed port is free again).
        this.starting = undefined;
        reject(new Error(`The secure input page could not start on 127.0.0.1:${this.options.port}: ${error.message}`));
      });
      server.listen(this.options.port, "127.0.0.1", () => {
        this.port = (server.address() as AddressInfo).port;
        // Never keep the MCP server process alive on our account.
        server.unref();
        this.server = server;
        resolve();
      });
    });
    return this.starting;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, sub] of this.submissions) {
      if (sub.status === "waiting" && now > sub.expiresAt) {
        sub.status = "expired";
        sub.finishedAt = now;
      }
      if (sub.finishedAt && now - sub.finishedAt > KEEP_RESULT_MS) this.submissions.delete(id);
    }
  }

  private allowedHosts(): Set<string> {
    const hosts = new Set([`127.0.0.1:${this.port}`, `localhost:${this.port}`]);
    if (this.options.publicUrl) hosts.add(new URL(this.options.publicUrl).host);
    return hosts;
  }

  private send(res: ServerResponse, status: number, body: string, type = "text/html; charset=utf-8"): void {
    res.writeHead(status, {
      "Content-Type": type,
      "Content-Security-Policy": PAGE_CSP,
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Cache-Control": "no-store",
    });
    res.end(body);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // DNS-rebinding protection: only answer requests addressed to this listener.
    if (!this.allowedHosts().has((req.headers.host ?? "").toLowerCase())) {
      this.send(res, 421, "Misdirected request", "text/plain; charset=utf-8");
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/assets/app.css") {
      this.send(res, 200, APP_CSS, "text/css; charset=utf-8");
      return;
    }
    const match = url.pathname.match(/^\/secure\/([^/]+)$/);
    const sub = match && ID_PATTERN.test(match[1]!) ? this.get(match[1]!) : undefined;
    if (!sub) {
      this.send(res, 404, page("Link not found", html`<h1>Link not found</h1><p>This secure-input link is invalid or has expired. Ask your AI assistant to start the request again.</p>`));
      return;
    }
    if (req.method === "GET") {
      this.send(res, 200, sub.status === "waiting" ? formPage(sub) : statusPage(sub));
      return;
    }
    if (req.method !== "POST") {
      this.send(res, 405, "Method not allowed", "text/plain; charset=utf-8");
      return;
    }

    if (!this.sameOrigin(req)) {
      this.send(res, 403, page("Refused", html`<h1 class="error">Refused</h1><p>This form can only be submitted from its own page.</p>`));
      return;
    }
    if (sub.status !== "waiting") {
      this.send(res, 409, statusPage(sub));
      return;
    }

    const form = await readForm(req);
    if (!form) {
      this.send(res, 413, page("Too large", html`<h1 class="error">Form too large</h1>`));
      return;
    }
    // Re-check after the await: another request may have claimed this submission meanwhile.
    if (sub.status !== "waiting") {
      this.send(res, 409, statusPage(sub));
      return;
    }
    if (form.get("action") === "cancel") {
      sub.status = "cancelled";
      sub.finishedAt = Date.now();
      this.send(res, 200, statusPage(sub));
      return;
    }

    const secrets: Record<string, string> = {};
    const missing: string[] = [];
    sub.fields.forEach((field, index) => {
      const value = form.get(`field${index}`) ?? "";
      if (value) secrets[field.path] = value;
      else if (field.required) missing.push(field.label);
    });
    if (missing.length) {
      this.send(res, 400, formPage(sub, `Please fill in: ${missing.join(", ")}.`));
      return;
    }
    if (insecureTransport(sub) && form.get("confirmInsecure") !== "yes") {
      this.send(res, 400, formPage(sub, "Confirm that the password may be sent without encryption, or cancel."));
      return;
    }

    // Claimed synchronously (no await since the status check), so the request goes out at most once.
    sub.status = "sending";
    const values = Object.values(secrets);
    try {
      sub.response = redactValues(await executeCall(this.client, sub.call, secrets), values);
      sub.status = "completed";
    } catch (error) {
      const message = error instanceof AwardWalletApiError || error instanceof Error ? error.message : String(error);
      sub.error = redactValues(message, values);
      sub.status = "failed";
    } finally {
      sub.finishedAt = Date.now();
    }
    this.send(res, 200, statusPage(sub));
  }

  /**
   * Same-origin check for form posts. Pages are served with Referrer-Policy: same-origin, so a
   * browser's own submission carries our Origin; "null" (sandboxed or no-referrer pages) and
   * cross-site fetch metadata are refused. Non-browser clients without either header still need
   * the unguessable link.
   */
  private sameOrigin(req: IncomingMessage): boolean {
    const site = req.headers["sec-fetch-site"];
    if (site && site !== "same-origin" && site !== "none") return false;
    const origin = req.headers.origin;
    if (origin === undefined) return true;
    return this.allowedHosts().has(safeHost(origin));
  }
}

/** Replaces every submitted secret (4+ chars) found in a value with "[redacted]". */
export function redactValues<T>(value: T, secrets: string[]): T {
  const needles = secrets.filter((s) => s.length >= 4);
  if (!needles.length) return value;
  const scrub = (v: unknown): unknown => {
    if (typeof v === "string") return needles.reduce((s, n) => s.split(n).join("[redacted]"), v);
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]));
    return v;
  };
  return scrub(value) as T;
}

/** An IMAP connection (or update) with TLS explicitly turned off. */
function insecureTransport(sub: Submission): boolean {
  return sub.call.body?.["secure"] === false;
}

const DESTINATION_KEYS = /^(host|server|port|secure|login|login2|login3|email|provider|destination|accountId|mailboxId|userId)$/i;

/** The non-secret facts that say where the secret will be used, shown prominently on the form. */
function destinationFacts(sub: Submission): [string, string][] {
  const facts: [string, string][] = [["Request", `${sub.call.op.method} ${sub.call.path}`]];
  const visit = (obj: Record<string, unknown> | undefined, prefix: string) => {
    for (const [key, value] of Object.entries(obj ?? {})) {
      if (value && typeof value === "object" && !Array.isArray(value)) visit(value as Record<string, unknown>, `${prefix}${key}.`);
      else if (DESTINATION_KEYS.test(key) && value !== undefined && value !== null && value !== "") facts.push([`${prefix}${key}`, String(value)]);
    }
  };
  visit(sub.call.body, "");
  return facts;
}

function safeHost(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return "";
  }
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_FORM_BYTES) return undefined;
    chunks.push(chunk as Buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function page(title: string, body: ReturnType<typeof html>): string {
  return renderDocument(title, body);
}

function requestPreview(sub: Submission): string {
  const preview = { request: `${sub.call.op.method} ${sub.call.path}`, query: sub.call.query, body: sub.call.body };
  const text = JSON.stringify(preview, null, 2);
  return text.length > 3000 ? `${text.slice(0, 3000)}\n…` : text;
}

function formPage(sub: Submission, error?: string): string {
  const expires = new Date(sub.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return page(
    sub.call.op.title,
    html`<h1>${sub.call.op.title}</h1>
<p class="muted">${API_NAMES[sub.call.op.api]}</p>
<p>Your AI assistant prepared this AwardWallet request. What you type below goes from this page straight to AwardWallet. It is not shown to the assistant and is not saved.</p>
<p><strong>Check where it will be used before you continue:</strong></p>
<table class="facts">${destinationFacts(sub).map(([k, v]) => html`<tr><th>${k}</th><td class="mono">${v}</td></tr>`)}</table>
${
  insecureTransport(sub)
    ? html`<div class="warn"><strong>Encryption is off for this connection (secure: false).</strong> AwardWallet would send the password to ${String(sub.call.body?.["host"] ?? "the server")} unencrypted.</div>`
    : ""
}
<details><summary class="small">Full request (without secrets)</summary><pre>${requestPreview(sub)}</pre></details>
${error ? html`<p class="error">${error}</p>` : ""}
<form method="post">
${sub.fields.map(
  (field, index) => html`<div class="field">
  <label for="field${index}">${field.label}${field.required ? "" : html` <span class="muted small">(optional)</span>`}</label>
  <input id="field${index}" name="field${index}" type="${field.sensitive ? "password" : "text"}" autocomplete="off" ${field.required ? html`required` : ""}>
  ${field.help ? html`<div class="hint">${field.help}</div>` : ""}
</div>`,
)}
${
  insecureTransport(sub)
    ? html`<div class="field"><label><input type="checkbox" name="confirmInsecure" value="yes"> I understand the password may be sent without encryption</label></div>`
    : ""
}
<div class="actions">
  <button type="submit" name="action" value="send" class="primary">Send to AwardWallet</button>
  <button type="submit" name="action" value="cancel" formnovalidate>Cancel</button>
</div>
</form>
<p class="small muted">Single-use link, valid until ${expires}.</p>`,
  );
}

function statusPage(sub: Submission): string {
  switch (sub.status) {
    case "completed":
      return page("Sent", html`<h1 class="ok">Sent to AwardWallet</h1><p>AwardWallet accepted the request. Go back to your AI assistant and ask it to check the result.</p>`);
    case "failed":
      return page("Request failed", html`<h1 class="error">AwardWallet returned an error</h1><p>${sub.error ?? "Unknown error"}</p><p>Go back to your AI assistant to try again.</p>`);
    case "cancelled":
      return page("Cancelled", html`<h1>Cancelled</h1><p>Nothing was sent. You can close this page.</p>`);
    case "expired":
      return page("Link expired", html`<h1>Link expired</h1><p>Ask your AI assistant to start the request again.</p>`);
    case "sending":
      return page("Sending", html`<h1>Sending…</h1><p>The request is on its way to AwardWallet. Refresh in a moment.</p>`);
    default:
      return formPage(sub);
  }
}
