// Assembles build/mcpb (manifest + bundled server) and packs dist/awardwallet-mcp.mcpb.
// The bundle has no node_modules: in Claude Desktop, credentials come from user_config
// (stored by Claude Desktop in the OS keychain), so the optional native keyring isn't needed.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("mcpb/manifest.json", "utf8"));
if (manifest.version !== pkg.version) throw new Error(`mcpb/manifest.json version ${manifest.version} != package.json ${pkg.version}`);

const stage = "build/mcpb";
rmSync(stage, { recursive: true, force: true });
mkdirSync(`${stage}/server`, { recursive: true });
writeFileSync(`${stage}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync("dist/awardwallet-mcp.mjs", `${stage}/server/awardwallet-mcp.mjs`);

const mcpb = (...args) => execFileSync(process.execPath, ["node_modules/@anthropic-ai/mcpb/dist/cli/cli.js", ...args], { stdio: "inherit" });
mcpb("validate", `${stage}/manifest.json`);
mcpb("pack", stage, "dist/awardwallet-mcp.mcpb");
