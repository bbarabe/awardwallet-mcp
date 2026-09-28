/** Minimal server-rendered pages for the local secure-input form. Everything interpolated is escaped. */

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export class Raw {
  constructor(readonly html: string) {}
  toString() {
    return this.html;
  }
}

/** Tagged template that escapes interpolations unless they are `Raw` fragments (from nested `html`). */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0] ?? "";
  values.forEach((value, i) => {
    if (Array.isArray(value)) out += value.map((v) => (v instanceof Raw ? v.html : esc(v))).join("");
    else if (value instanceof Raw) out += value.html;
    else if (value !== undefined && value !== null && value !== false) out += esc(value);
    out += strings[i + 1] ?? "";
  });
  return new Raw(out);
}

/** No scripts at all; forms may only post back to this page's own origin. */
export const PAGE_CSP = "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

export function renderDocument(title: string, body: Raw): string {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="same-origin">
<title>${title}</title>
<link rel="stylesheet" href="/assets/app.css">
</head>
<body>
<main class="card">
<header class="brand"><span class="logo" aria-hidden="true">✈︎</span><span>AwardWallet MCP · secure input</span></header>
${body}
</main>
</body>
</html>`.html;
}

export const APP_CSS = `
:root { color-scheme: light dark; --bg:#f4f5f7; --card:#fff; --text:#1c1e21; --muted:#5f6670; --border:#dfe3e8; --accent:#1464d8; --accent-text:#fff; --warn-bg:#fff4e5; --warn:#8a5300; --ok:#0f7b3f; --danger:#b42318; }
@media (prefers-color-scheme: dark) { :root { --bg:#111418; --card:#1b1f24; --text:#e8eaed; --muted:#a2a9b3; --border:#2e343c; --accent:#4c8dff; --accent-text:#0b1020; --warn-bg:#3a2a10; --warn:#f3c26b; --ok:#5fd394; --danger:#ff8a80; } }
* { box-sizing: border-box; }
body { margin:0; min-height:100vh; display:flex; align-items:flex-start; justify-content:center; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding:32px 16px; }
.card { width:100%; max-width:560px; background:var(--card); border:1px solid var(--border); border-radius:14px; padding:28px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
.brand { display:flex; gap:8px; align-items:center; font-weight:600; color:var(--muted); margin-bottom:12px; }
h1 { font-size:22px; line-height:1.3; margin:4px 0 12px; }
p { margin:8px 0; }
.muted { color:var(--muted); }
.small { font-size:13px; }
pre { background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px; overflow:auto; max-height:220px; font-size:12px; }
.warn { background:var(--warn-bg); color:var(--warn); border-radius:10px; padding:10px 14px; margin:12px 0; }
.ok { color:var(--ok); }
.error { color:var(--danger); }
.field { margin:14px 0; }
.field label { display:block; font-weight:600; margin-bottom:4px; }
.facts { border:1px solid var(--border); border-radius:10px; margin:8px 0 14px; width:100%; border-collapse:collapse; font-size:14px; }
.facts th { text-align:left; font-weight:600; padding:5px 10px; white-space:nowrap; vertical-align:top; }
.facts td { padding:5px 10px 5px 0; }
.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size:13px; word-break:break-all; }
.hint { font-size:13px; color:var(--muted); margin-top:4px; }
input[type=text], input[type=password] { width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:transparent; color:var(--text); font:inherit; }
.actions { display:flex; gap:10px; margin-top:18px; flex-wrap:wrap; }
button { appearance:none; border:1px solid var(--border); background:transparent; color:var(--text); border-radius:10px; padding:11px 16px; font:inherit; font-weight:600; cursor:pointer; }
button.primary { background:var(--accent); border-color:var(--accent); color:var(--accent-text); }
`;
