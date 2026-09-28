import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { resolveCredential } from "../../src/credentials.js";
import { VERSION } from "../../src/server.js";

const dir = mkdtempSync(join(tmpdir(), "awmcp-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("credentials", () => {
  it("prefers the environment variable over a file", async () => {
    const file = join(dir, "key");
    writeFileSync(file, "from-file\n");
    expect(await resolveCredential("AW_API_KEY", { AW_API_KEY: " from-env ", AW_API_KEY_FILE: file })).toEqual({ value: "from-env", source: "environment" });
    expect(await resolveCredential("AW_API_KEY", { AW_API_KEY_FILE: file })).toEqual({ value: "from-file", source: "file" });
  });

  it("reports an unreadable secret file clearly", async () => {
    await expect(resolveCredential("AW_API_KEY", { AW_API_KEY_FILE: join(dir, "missing") })).rejects.toThrow(/AW_API_KEY_FILE points to/);
  });
});

describe("config", () => {
  it("parses flags and options", async () => {
    const config = await loadConfig({
      AW_API_KEY: "k",
      AW_WEB_PARSING_CREDENTIALS: "user:pass",
      AW_READ_ONLY: "yes",
      AW_CONNECT_LINKS: "1",
      AW_EMAIL_API_REGION: "EU",
      AW_SECURE_INPUT_PORT: "8765",
      AW_SECURE_INPUT_URL: "https://box.example.ts.net/",
    });
    expect(config).toMatchObject({
      mockMode: false,
      readOnly: true,
      connectLinks: true,
      emailRegion: "eu",
      secureInput: { port: 8765, publicUrl: "https://box.example.ts.net" },
    });
    expect(config.credentials).toMatchObject({ accountAccess: "k", webParsing: "user:pass" });
    expect(config.credentialSources).toMatchObject({ accountAccess: "environment", webParsing: "environment" });
  });

  it("treats blank values and unexpanded MCPB placeholders as unset", async () => {
    const config = await loadConfig({
      AW_API_KEY: "${user_config.api_key}",
      AW_WEB_PARSING_CREDENTIALS: "   ",
      AW_READ_ONLY: "${user_config.read_only}",
      AW_EMAIL_API_REGION: "${user_config.email_region}",
    });
    expect(config.credentialSources.accountAccess).not.toBe("environment");
    expect(config.credentialSources.webParsing).not.toBe("environment");
    expect(config.readOnly).toBe(false);
    expect(config.emailRegion).toBe("us");
  });

  it("demo mode configures every API without credentials", async () => {
    const config = await loadConfig({ AW_MOCK_MODE: "true" });
    expect(Object.keys(config.credentials)).toHaveLength(6);
    expect(new Set(Object.values(config.credentialSources))).toEqual(new Set(["demo"]));
  });

  it("keeps the server version in sync with package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});
