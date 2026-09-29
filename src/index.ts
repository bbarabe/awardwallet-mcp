import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { HELP, login, logout, status } from "./cli.js";
import { loadConfig } from "./config.js";
import { createAwardWalletServer, VERSION } from "./server.js";

async function serve(): Promise<void> {
  const config = await loadConfig();
  const { server, secureInput } = createAwardWalletServer(config);
  const transport = new StdioServerTransport();
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await secureInput?.close();
    await server.close();
    // Let the event loop drain instead of calling process.exit() now: exiting while network handles
    // are still closing crashes libuv on Windows ("Assertion failed ... async.c") when the native
    // keyring module is loaded. The timer only matters if something keeps the loop busy.
    process.stdin.destroy();
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  // The client closing stdin ends the session.
  process.stdin.on("end", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await server.connect(transport);
  // stdout carries the protocol; diagnostics go to stderr.
  const configured = Object.keys(config.credentials).length;
  console.error(`[awardwallet-mcp] v${VERSION} ready on stdio (${config.mockMode ? "demo mode" : `${configured} API credential(s)`}${config.readOnly ? ", read-only" : ""})`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case undefined:
    case "serve":
      return serve();
    case "login":
      return login(args);
    case "logout":
      return logout(args);
    case "status":
      return status();
    case "--version":
    case "-v":
      process.stdout.write(`${VERSION}\n`);
      return;
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(`${HELP}\n`);
      return;
    default:
      process.stderr.write(`Unknown command '${command}'.\n\n${HELP}\n`);
      process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
