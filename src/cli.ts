/** `awardwallet-mcp login | logout | status`: manage credentials in the OS credential store. */
import { createInterface } from "node:readline";
import { API_NAMES, AwardWalletApiError } from "./awardwallet/client.js";
import type { ApiId } from "./catalog/types.js";
import { loadConfig } from "./config.js";
import { CREDENTIAL_NAMES, credentialStoreName, deleteStoredCredential, loadKeyring, storeCredential } from "./credentials.js";
import { verifyCredential } from "./setup.js";

const API_IDS = Object.keys(CREDENTIAL_NAMES) as ApiId[];

const out = (line = "") => process.stderr.write(`${line}\n`);

function parseApi(args: string[]): ApiId {
  const i = args.indexOf("--api");
  if (i === -1) return "accountAccess";
  const value = args[i + 1];
  if (!value || !API_IDS.includes(value as ApiId)) throw new Error(`--api must be one of: ${API_IDS.join(", ")}`);
  return value as ApiId;
}

let lineReader: ReturnType<typeof createInterface> | undefined;
const queued: string[] = [];
const waiting: ((line: string) => void)[] = [];
let inputEnded = false;

/** Non-terminal input (pipes, some IDE consoles): one shared reader, one line per prompt, as lines arrive. */
function nextLine(question: string, hidden: boolean): Promise<string> {
  process.stderr.write(hidden ? `${question}(input will be visible) ` : question);
  if (!lineReader) {
    lineReader = createInterface({ input: process.stdin, crlfDelay: Infinity });
    lineReader.on("line", (line) => {
      const resolve = waiting.shift();
      if (resolve) resolve(line.trim());
      else queued.push(line.trim());
    });
    lineReader.on("close", () => {
      inputEnded = true;
      for (const resolve of waiting.splice(0)) resolve("");
    });
  }
  if (queued.length) return Promise.resolve(queued.shift()!);
  if (inputEnded) return Promise.resolve("");
  return new Promise((resolve) => waiting.push(resolve));
}

function closeInput(): void {
  lineReader?.close();
  lineReader = undefined;
}

/** Reads a line; hidden input is masked with '*' in a terminal. */
function prompt(question: string, hidden: boolean): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) return nextLine(question, hidden);
  if (!hidden) {
    const rl = createInterface({ input: stdin, output: process.stderr });
    return new Promise((resolve) => rl.question(question, (answer) => (rl.close(), resolve(answer.trim()))));
  }
  process.stderr.write(question);
  return new Promise((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stderr.write("\n");
      if (error) reject(error);
      else resolve(value.trim());
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return done();
        if (char === "\u0003") return done(new Error("Cancelled."));
        if (char === "\u007f" || char === "\b") {
          if (value.length) {
            value = value.slice(0, -1);
            process.stderr.write("\b \b");
          }
        } else if (char >= " ") {
          value += char;
          process.stderr.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

export async function login(args: string[]): Promise<void> {
  const api = parseApi(args);
  const name = CREDENTIAL_NAMES[api];
  if (!(await loadKeyring())) throw new Error("The OS credential store isn't available (the optional @napi-rs/keyring module is missing). Set the environment variable instead.");

  out(`AwardWallet MCP: sign in to the ${API_NAMES[api]}`);
  let credential: string;
  try {
    if (api === "accountAccess") {
      out("Find the key in your AwardWallet Business account's API settings (https://business.awardwallet.com).");
      credential = await prompt("API key: ", true);
    } else {
      out("Use the API username and password AwardWallet issued for this API.");
      const user = await prompt("API username: ", false);
      const password = await prompt("API password: ", true);
      credential = user && password ? `${user}:${password}` : "";
    }
  } finally {
    closeInput();
  }
  if (!credential) throw new Error("Nothing entered; no changes made.");

  if (!args.includes("--no-verify")) {
    out("Checking with AwardWallet…");
    try {
      out(`OK: ${await verifyCredential(api, credential, await loadConfig())}.`);
    } catch (error) {
      if (error instanceof AwardWalletApiError && error.status === 401) throw new Error("AwardWallet rejected these credentials; nothing was saved.");
      throw new Error(`Could not verify with AwardWallet (${error instanceof Error ? error.message : error}). Re-run with --no-verify to save anyway.`);
    }
  }
  await storeCredential(name, credential);
  out(`Saved to ${credentialStoreName()} (service "awardwallet-mcp", account "${name}").`);
  if (process.env[name]) out(`Note: the ${name} environment variable is set and takes precedence over the stored value.`);
}

export async function logout(args: string[]): Promise<void> {
  const apis = args.includes("--all") ? API_IDS : [parseApi(args)];
  for (const api of apis) {
    const removed = await deleteStoredCredential(CREDENTIAL_NAMES[api]);
    out(`${API_NAMES[api]}: ${removed ? "removed from" : "nothing stored in"} ${credentialStoreName()}.`);
  }
}

export async function status(): Promise<void> {
  const config = await loadConfig();
  out(`AwardWallet MCP (${config.mockMode ? "demo mode" : "live"}${config.readOnly ? ", read-only" : ""})`);
  const keyring = await loadKeyring();
  out(`Credential store: ${keyring ? credentialStoreName() : "unavailable (optional module not installed)"}`);
  out(`Settings file: ${config.settingsFile}`);
  for (const api of API_IDS) {
    const source = config.credentialSources[api];
    out(`  ${API_NAMES[api].padEnd(28)} ${source ? `configured (${source})` : "not configured"}`);
  }
  if (config.credentials.accountAccess && !config.mockMode) {
    try {
      out(`Account Access check: ${await verifyCredential("accountAccess", config.credentials.accountAccess, config)}.`);
    } catch (error) {
      out(`Account Access check failed: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    }
  }
}

export const HELP = `awardwallet-mcp: AwardWallet tools for Claude Desktop, Claude Code, OpenClaw and other MCP clients.

Usage:
  awardwallet-mcp                 Run the MCP server on stdio (what MCP clients launch)
  awardwallet-mcp login           Save your Account Access API key in the OS credential store
  awardwallet-mcp login --api <id>  Save credentials for a paid API (${API_IDS.filter((a) => a !== "accountAccess").join(", ")})
  awardwallet-mcp logout [--api <id> | --all]
  awardwallet-mcp status          Show which credentials are configured and test the API key
  awardwallet-mcp --version

Environment (overrides the credential store): AW_API_KEY, ${API_IDS.filter((a) => a !== "accountAccess").map((a) => CREDENTIAL_NAMES[a]).join(", ")}
(each also accepts <NAME>_FILE), AW_MOCK_MODE, AW_READ_ONLY, AW_CONNECT_LINKS, AW_CONNECT_REDIRECT_URL,
AW_EMAIL_API_REGION (us|eu), AW_SECURE_INPUT_PORT, AW_SECURE_INPUT_URL.`;
