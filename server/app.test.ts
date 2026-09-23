// @vitest-environment node
import type { Response } from "express";
import { request as makeHttpRequest } from "node:http";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createPersonalServerApp } from "./app.js";
import { installShutdownHandlers, resolvePublicUrl } from "./index.js";

const origin = "https://classman89.github.io";
const auth = { Authorization: "Bearer test-token", Origin: origin };

function fakeTool() {
  return {
    inspect: vi.fn(async () => ({
      id: "abc123",
      title: "Test",
      durationSeconds: 90,
      thumbnailUrl: "https://i.ytimg.com/x.jpg",
    })),
    prepare: vi.fn(async (
      _url: string,
      _format: string,
      _signal?: AbortSignal,
    ) => ({
      path: "C:/tmp/test.mp3",
      fileName: "test.mp3",
      mimeType: "audio/mpeg",
      size: 2,
      cleanup: vi.fn(async () => undefined),
    })),
    shutdown: vi.fn(async () => undefined),
  };
}

describe("personal server API", () => {
  it("rejects missing auth and disallowed origins", async () => {
    const app = createPersonalServerApp({
      token: "test-token",
      mediaTool: fakeTool(),
      sendFile: vi.fn(),
    });

    expect((await request(app).get("/api/health").set("Origin", origin)).status).toBe(
      401,
    );
    expect(
      (
        await request(app).get("/api/health").set({
          Authorization: "Bearer test-token",
          Origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
  });

  it("answers allowed CORS preflights before authorization", async () => {
    const app = createPersonalServerApp({
      token: "test-token",
      mediaTool: fakeTool(),
      sendFile: vi.fn(),
    });

    const response = await request(app)
      .options("/api/youtube/inspect")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("returns video metadata to an authenticated Pages origin", async () => {
    const tool = fakeTool();
    const app = createPersonalServerApp({
      token: "test-token",
      mediaTool: tool,
      sendFile: vi.fn(),
    });

    const response = await request(app)
      .post("/api/youtube/inspect")
      .set(auth)
      .send({ url: "https://youtu.be/abc123" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: "abc123", durationSeconds: 90 });
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-expose-headers"]).toContain(
      "Content-Disposition",
    );
    expect(tool.inspect).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc123",
    );
  });

  it("rejects an unsupported download format", async () => {
    const app = createPersonalServerApp({
      token: "test-token",
      mediaTool: fakeTool(),
      sendFile: vi.fn(),
    });
    const response = await request(app)
      .post("/api/youtube/download")
      .set(auth)
      .send({ url: "https://youtu.be/abc123", format: "exe" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CONVERSION_FAILED");
  });

  it("returns 429 for a second active job and still cleans the first", async () => {
    let release!: () => void;
    const cleanup = vi.fn(async () => undefined);
    const tool = fakeTool();
    tool.prepare = vi.fn(async () => ({
      path: "C:/tmp/test.mp3",
      fileName: "test.mp3",
      mimeType: "audio/mpeg",
      size: 2,
      cleanup,
    }));
    const sendFile = vi.fn(
      (res: Response) =>
        new Promise<void>((resolve) => {
          release = () => {
            res.status(200).end("ok");
            resolve();
          };
        }),
    );
    const app = createPersonalServerApp({
      token: "test-token",
      mediaTool: tool,
      sendFile,
    });

    const first = request(app)
      .post("/api/youtube/download")
      .set(auth)
      .send({ url: "https://youtu.be/abc123", format: "mp3" })
      .then((response) => response);
    await vi.waitFor(() => expect(sendFile).toHaveBeenCalled());
    const second = await request(app)
      .post("/api/youtube/download")
      .set(auth)
      .send({ url: "https://youtu.be/abc123", format: "mp3" });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("PERSONAL_SERVER_BUSY");

    release();
    await first;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("cleans once and releases the job lock after a connection closes", async () => {
    const cleanup = vi.fn(async () => undefined);
    const tool = fakeTool();
    tool.prepare = vi.fn(async () => ({
      path: "C:/tmp/test.mp3",
      fileName: "test.mp3",
      mimeType: "audio/mpeg",
      size: 2,
      cleanup,
    }));
    const sendFile = vi
      .fn()
      .mockImplementationOnce(async (res: Response) => {
        res.emit("close");
        res.status(499).end();
        throw new Error("connection closed");
      })
      .mockImplementationOnce(async (res: Response) => {
        res.status(200).end("ok");
      });
    const app = createPersonalServerApp({
      token: "test-token",
      mediaTool: tool,
      sendFile,
    });

    await request(app)
      .post("/api/youtube/download")
      .set(auth)
      .send({ url: "https://youtu.be/abc123", format: "mp3" });
    const next = await request(app)
      .post("/api/youtube/download")
      .set(auth)
      .send({ url: "https://youtu.be/abc123", format: "mp3" });

    expect(next.status).toBe(200);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("cancels media preparation when the client disconnects early", async () => {
    let preparationSignal: AbortSignal | undefined;
    let rejectPreparation!: (error: Error) => void;
    let preparationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      preparationStarted = resolve;
    });
    const tool = fakeTool();
    tool.prepare = vi.fn(
      async (_url: string, _format: string, signal?: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          preparationSignal = signal;
          rejectPreparation = reject;
          signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
          preparationStarted();
        }),
    );
    const app = createPersonalServerApp({
      token: "test-token",
      mediaTool: tool,
      sendFile: vi.fn(),
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("port unavailable");
    const body = JSON.stringify({ url: "https://youtu.be/abc123", format: "mp3" });
    const clientRequest = makeHttpRequest({
      host: "127.0.0.1",
      port: address.port,
      path: "/api/youtube/download",
      method: "POST",
      headers: {
        ...auth,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    });
    clientRequest.on("error", () => undefined);
    clientRequest.end(body);
    await started;

    clientRequest.destroy();
    try {
      await vi.waitFor(() => {
        expect(preparationSignal).toBeInstanceOf(AbortSignal);
        expect(preparationSignal?.aborted).toBe(true);
      });
    } finally {
      rejectPreparation(new Error("test cleanup"));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("personal server lifecycle", () => {
  it("uses an unambiguous IPv4 URL outside Codespaces", () => {
    expect(resolvePublicUrl({})).toBe("http://127.0.0.1:8787");
    expect(
      resolvePublicUrl({
        CODESPACE_NAME: "quiet-space",
        GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
      }),
    ).toBe("https://quiet-space-8787.app.github.dev");
  });

  it("awaits media shutdown before exiting on a process signal", async () => {
    const order: string[] = [];
    let releaseShutdown!: () => void;
    const mediaTool = fakeTool();
    mediaTool.shutdown = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          releaseShutdown = () => {
            order.push("media-stopped");
            resolve(undefined);
          };
        }),
    );
    const handlers = new Map<string, () => void>();
    installShutdownHandlers({
      server: {
        close(callback) {
          order.push("server-closing");
          callback?.();
          return this;
        },
      },
      mediaTool,
      once: (signal, handler) => handlers.set(signal, handler),
      exit: () => order.push("exit"),
    });

    handlers.get("SIGTERM")?.();
    await vi.waitFor(() => expect(mediaTool.shutdown).toHaveBeenCalled());
    expect(order).toEqual(["server-closing"]);
    releaseShutdown();
    await vi.waitFor(() => expect(order).toEqual([
      "server-closing",
      "media-stopped",
      "exit",
    ]));
  });
});
