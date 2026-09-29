import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PKG_VERSION = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version as string;

// Launches dist/awardwallet-mcp.mjs exactly as an MCP client would.
describe("bundled server over stdio", () => {
  let client: Client;
  let stderr = "";

  beforeAll(async () => {
    execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "ignore" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/awardwallet-mcp.mjs"],
      env: { ...(process.env as Record<string, string>), AW_MOCK_MODE: "true" },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    client = new Client({ name: "e2e", version: "1.0.0" });
    await client.connect(transport);
  }, 60_000);

  afterAll(async () => {
    await client?.close();
  });

  it("initializes with instructions and the expected tools", async () => {
    expect(client.getServerVersion()).toMatchObject({ name: "awardwallet", version: PKG_VERSION });
    expect(client.getInstructions()).toContain("list_loyalty_accounts");
    const { tools } = await client.listTools();
    expect(tools.length).toBe(12);
  });

  it("answers a balance question end to end", async () => {
    const result = (await client.callTool({ name: "list_loyalty_accounts", arguments: { program: "marriott" } })) as CallToolResult;
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.accounts).toEqual([expect.objectContaining({ program: "Marriott Bonvoy", balance: "212,450", eliteStatus: "Platinum Elite" })]);
  });

  it("logs to stderr only", () => {
    expect(stderr).toContain("ready on stdio (demo mode)");
  });
});

describe("command line", () => {
  it("prints help and version", () => {
    const help = execFileSync(process.execPath, ["dist/awardwallet-mcp.mjs", "--help"], { encoding: "utf8" });
    expect(help).toContain("awardwallet-mcp login");
    const version = execFileSync(process.execPath, ["dist/awardwallet-mcp.mjs", "--version"], { encoding: "utf8" });
    expect(version.trim()).toBe(PKG_VERSION);
  });
});

// Claude Desktop runs the MCPB's single file without node_modules and passes user_config as env.
describe("MCPB-style launch", () => {
  const dir = mkdtempSync(join(tmpdir(), "awmcp-mcpb-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  async function launch(env: Record<string, string>) {
    copyFileSync("dist/awardwallet-mcp.mjs", join(dir, "awardwallet-mcp.mjs"));
    const client = new Client({ name: "mcpb", version: "1.0.0" });
    // PLUGIN_DATA keeps the settings file in the temp folder, away from this machine's real one.
    const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", PLUGIN_DATA: dir };
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(dir, "awardwallet-mcp.mjs")], env: { ...base, ...env }, cwd: dir, stderr: "ignore" }));
    return client;
  }

  it("works in demo mode with unexpanded optional settings", async () => {
    const client = await launch({ AW_MOCK_MODE: "true", AW_API_KEY: "${user_config.api_key}", AW_READ_ONLY: "false", AW_EMAIL_API_REGION: "${user_config.email_region}" });
    const result = (await client.callTool({ name: "get_status", arguments: {} })) as CallToolResult;
    expect(JSON.parse((result.content[0] as { text: string }).text).mode).toMatch(/^demo/);
    await client.close();
  });

  it("starts without an API key or keyring module and explains the setup", async () => {
    const client = await launch({ AW_MOCK_MODE: "false", AW_API_KEY: "" });
    const result = (await client.callTool({ name: "get_status", arguments: {} })) as CallToolResult;
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data.mode).toBe("live");
    expect(data.apis[0].configured).toBe(false);
    // A key saved by `login` can't be read here, so the setup page is the way in.
    expect(data.credentialStore).toMatch(/^unavailable/);
    expect(data.setupHelp).toMatch(/connect_awardwallet/);
    await client.close();
  });
});

describe("shutdown", () => {
  // Shutdown lets the event loop drain rather than calling process.exit() right away (that crashed
  // libuv on Windows after a real AwardWallet request with the keyring module loaded, which these
  // offline tests can't reproduce). Check that draining still ends the process promptly by itself.
  it("exits on its own, cleanly, when the client disconnects after tool calls", async () => {
    let stderr = "";
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/awardwallet-mcp.mjs"],
      env: { ...(process.env as Record<string, string>), AW_MOCK_MODE: "true" },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    const client = new Client({ name: "shutdown", version: "1.0.0" });
    await client.connect(transport);
    const pid = transport.pid!;
    await client.callTool({ name: "get_status", arguments: {} });
    await client.callTool({ name: "list_loyalty_accounts", arguments: {} });
    const started = Date.now();
    await client.close();
    // close() waits up to 2 s for the process to exit on its own before signalling it.
    expect(Date.now() - started).toBeLessThan(1_500);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(stderr).not.toContain("Assertion failed");
    expect(() => process.kill(pid, 0)).toThrow();
  });
});

// The ChatGPT / Codex plugin starts the server through scripts/awardwallet-mcp(.cmd), which looks for
// ChatGPT's bundled Node.js and falls back to one on PATH (the case exercised here).
describe("plugin launcher", () => {
  it("starts the server and answers over stdio", async () => {
    const launcher = join("plugin", "scripts", process.platform === "win32" ? "awardwallet-mcp.cmd" : "awardwallet-mcp");
    const client = new Client({ name: "launcher", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: launcher,
        args: [join(process.cwd(), "dist", "awardwallet-mcp.mjs")],
        env: { ...(process.env as Record<string, string>), AW_MOCK_MODE: "true" },
        stderr: "ignore",
      }),
    );
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("connect_awardwallet");
    await client.close();
  });
});
