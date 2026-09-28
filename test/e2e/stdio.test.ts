import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
    expect(client.getServerVersion()).toMatchObject({ name: "awardwallet", version: "0.1.0" });
    expect(client.getInstructions()).toContain("list_loyalty_accounts");
    const { tools } = await client.listTools();
    expect(tools.length).toBe(11);
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
    expect(version.trim()).toBe("0.1.0");
  });
});

// Claude Desktop runs the MCPB's single file without node_modules and passes user_config as env.
describe("MCPB-style launch", () => {
  const dir = mkdtempSync(join(tmpdir(), "awmcp-mcpb-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  async function launch(env: Record<string, string>) {
    copyFileSync("dist/awardwallet-mcp.mjs", join(dir, "awardwallet-mcp.mjs"));
    const client = new Client({ name: "mcpb", version: "1.0.0" });
    const base = { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "" };
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
    // A key saved by `login` can't be read here, so point to the extension's settings instead.
    expect(data.credentialStore).toMatch(/^unavailable/);
    expect(data.setupHelp).toMatch(/Settings → Extensions → AwardWallet/);
    await client.close();
  });
});
