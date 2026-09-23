import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { createPersonalServerApp } from "./app.js";
import type { MediaTool } from "./mediaTool.js";
import { createYtDlpMediaTool } from "./ytDlpMediaTool.js";

type SignalName = "SIGINT" | "SIGTERM";

interface ClosableServer {
  close(callback?: (error?: Error) => void): unknown;
}

export interface ShutdownOptions {
  server: ClosableServer;
  mediaTool: MediaTool;
  once?: (signal: SignalName, handler: () => void) => unknown;
  exit?: (code: number) => unknown;
}

export function installShutdownHandlers(options: ShutdownOptions): void {
  const once = options.once ?? ((signal, handler) => process.once(signal, handler));
  const exit = options.exit ?? ((code) => process.exit(code));
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const closed = new Promise<void>((resolve, reject) => {
      options.server.close((error) => (error ? reject(error) : resolve()));
    });
    await options.mediaTool.shutdown();
    await closed;
    exit(0);
  };

  once("SIGINT", () => void shutdown());
  once("SIGTERM", () => void shutdown());
}

function codespacesUrl(environment: NodeJS.ProcessEnv): string {
  const name = environment.CODESPACE_NAME;
  const domain = environment.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  return name && domain
    ? `https://${name}-8787.${domain}`
    : "http://localhost:8787";
}

export async function startPersonalServer(): Promise<Server> {
  const token = randomBytes(32).toString("base64url");
  const mediaTool = createYtDlpMediaTool();
  const app = createPersonalServerApp({ token, mediaTool });
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(8787, "0.0.0.0", () => resolve(listening));
  });

  console.log("Kişisel sunucu hazır");
  console.log(`Adres: ${codespacesUrl(process.env)}`);
  console.log(`Eşleştirme kodu: ${token}`);
  installShutdownHandlers({ server, mediaTool });
  return server;
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  void startPersonalServer();
}
