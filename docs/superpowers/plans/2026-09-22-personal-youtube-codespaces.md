# Personal YouTube Codespaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing GitHub Pages ringtone studio to a token-protected personal Codespaces backend that can inspect one authorized YouTube video and return MP3, 720p MP4, or an M4A ringtone source.

**Architecture:** The React application remains on GitHub Pages and stores one Codespaces API URL plus an ephemeral bearer token in the current browser. A Node.js/Express service in Codespaces validates YouTube-only URLs, invokes `yt-dlp` and FFmpeg without a shell, streams one generated file, and removes its temporary directory on every exit path.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Vitest 5, Express 5, Node.js 24, `yt-dlp`, FFmpeg, GitHub Codespaces Dev Containers, Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-22-personal-youtube-codespaces-design.md`

## Global Constraints

- The user starts every workflow at `https://classman89.github.io/iphone-zil-sesi/`.
- The personal backend works only while its Codespace and public forwarded port are running.
- Accept one HTTPS `youtube.com/watch`, `youtube.com/shorts`, or `youtu.be` video; never accept arbitrary remote URLs, playlists, live streams, cookies, or account credentials.
- Reject durations outside 1–1200 seconds and outputs above 200 MB.
- Produce MP3 at 192 kbps, MP4 at no more than 720p with H.264/AAC compatibility, and ringtone source as M4A.
- Run one media job at a time and return `PERSONAL_SERVER_BUSY` for a concurrent job.
- Generate a new 32-byte random bearer token whenever the backend starts; never write it to the repository, a file, a URL, or application logs beyond the one intentional terminal pairing line.
- Permit CORS only from `https://classman89.github.io` plus explicit localhost development origins.
- Keep the existing local upload, direct media URL, 30-second editor, fade, volume, M4A/WAV fallback, and GarageBand guide working when the backend is offline.
- Never call real YouTube, `yt-dlp`, or FFmpeg from automated tests.
- Do not claim that a web page can assign an iPhone ringtone directly.

## Review Focus

- A backend URL with whitespace, a trailing slash, a path, an HTTP scheme, or embedded credentials must normalize safely or be rejected before a token is stored; Task 1 tests each case.
- A stale token after a Codespace restart must change the UI to `Kişisel sunucu kapalı` without deleting the user's existing local media state; Task 4 covers the transition.
- A second download submitted while one job is running must receive `429 PERSONAL_SERVER_BUSY`, while the first job completes and cleans up; Task 3 covers both responses.
- Closing the HTTP connection during a download must invoke temporary-file cleanup exactly once; Task 3 drives the response close path.
- A malicious or Unicode-heavy video title must never become a header-injection or path-traversal filename; Task 2 asserts the literal safe filename.

---

### Task 1: Personal server settings and typed browser client

**Files:**
- Create: `src/personal/types.ts`
- Create: `src/personal/personalServerStorage.ts`
- Create: `src/personal/personalServerStorage.test.ts`
- Create: `src/personal/personalMediaClient.ts`
- Create: `src/personal/personalMediaClient.test.ts`

**Interfaces:**
- Consumes: browser `localStorage`, standard `fetch`, `File`, and `Blob`.
- Produces: `PersonalServerConfig`, `YouTubeVideo`, `DownloadFormat`, `PersonalApiError`, `loadPersonalServer()`, `savePersonalServer()`, `clearPersonalServer()`, `createPersonalMediaClient()`.

- [ ] **Step 1: Write failing storage tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPersonalServer,
  loadPersonalServer,
  savePersonalServer,
} from "./personalServerStorage";

describe("personalServerStorage", () => {
  beforeEach(() => localStorage.clear());

  it("normalizes and stores an HTTPS Codespaces endpoint", () => {
    savePersonalServer({
      baseUrl: " https://quiet-space-8787.app.github.dev/ ",
      token: "  secret-token  ",
    });
    expect(loadPersonalServer()).toEqual({
      baseUrl: "https://quiet-space-8787.app.github.dev",
      token: "secret-token",
    });
  });

  it.each([
    "http://quiet-space-8787.app.github.dev",
    "https://example.com",
    "https://user:pass@quiet-space-8787.app.github.dev",
    "https://quiet-space-8787.app.github.dev/api",
  ])("rejects an unsafe backend URL: %s", (baseUrl) => {
    expect(() => savePersonalServer({ baseUrl, token: "secret-token" })).toThrow(
      "Geçerli HTTPS Codespaces sunucu adresini girin.",
    );
  });

  it("does not store an empty pairing token", () => {
    expect(() =>
      savePersonalServer({
        baseUrl: "https://quiet-space-8787.app.github.dev",
        token: "   ",
      }),
    ).toThrow("Eşleştirme kodunu girin.");
  });

  it("removes the stored pairing", () => {
    savePersonalServer({
      baseUrl: "https://quiet-space-8787.app.github.dev",
      token: "secret-token",
    });
    clearPersonalServer();
    expect(loadPersonalServer()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the storage test and verify RED**

Run: `npm run test:run -- src/personal/personalServerStorage.test.ts`

Expected: FAIL because `personalServerStorage` does not exist.

- [ ] **Step 3: Implement types and storage normalization**

```ts
// src/personal/types.ts
export interface PersonalServerConfig { baseUrl: string; token: string }
export interface YouTubeVideo {
  id: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
}
export type DownloadFormat = "mp3" | "mp4" | "ringtone-source";
export type PersonalApiErrorCode =
  | "UNAUTHORIZED" | "ORIGIN_NOT_ALLOWED" | "INVALID_YOUTUBE_URL"
  | "VIDEO_UNAVAILABLE" | "VIDEO_TOO_LONG" | "OUTPUT_TOO_LARGE"
  | "PERSONAL_SERVER_BUSY" | "TOOL_UPDATE_REQUIRED" | "CONVERSION_FAILED";
export class PersonalApiError extends Error {
  constructor(public readonly code: PersonalApiErrorCode, message: string) {
    super(message);
  }
}

// src/personal/personalServerStorage.ts
import type { PersonalServerConfig } from "./types";
const STORAGE_KEY = "iphone-ringtone-personal-server-v1";

function normalizeConfig(config: PersonalServerConfig): PersonalServerConfig {
  const token = config.token.trim();
  if (!token) throw new Error("Eşleştirme kodunu girin.");
  let url: URL;
  try { url = new URL(config.baseUrl.trim()); }
  catch { throw new Error("Geçerli HTTPS Codespaces sunucu adresini girin."); }
  const isCodespacesHost = /^[a-z0-9-]+-8787\.app\.github\.dev$/i.test(url.hostname);
  if (url.protocol !== "https:" || !isCodespacesHost || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Geçerli HTTPS Codespaces sunucu adresini girin.");
  }
  return { baseUrl: url.origin, token };
}

export function savePersonalServer(config: PersonalServerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeConfig(config)));
}
export function loadPersonalServer(): PersonalServerConfig | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  try { return normalizeConfig(JSON.parse(raw) as PersonalServerConfig); }
  catch { localStorage.removeItem(STORAGE_KEY); return undefined; }
}
export function clearPersonalServer(): void { localStorage.removeItem(STORAGE_KEY); }
```

- [ ] **Step 4: Run the storage tests and verify GREEN**

Run: `npm run test:run -- src/personal/personalServerStorage.test.ts`

Expected: 7 tests PASS.

- [ ] **Step 5: Write failing HTTP client tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createPersonalMediaClient } from "./personalMediaClient";
import { PersonalApiError } from "./types";

const config = { baseUrl: "https://quiet-space-8787.app.github.dev", token: "secret" };

describe("personalMediaClient", () => {
  it("authenticates health and inspect requests", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, service: "iphone-ringtone-personal", version: 1 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "abc", title: "Kısa video", durationSeconds: 90, thumbnailUrl: "https://i.ytimg.com/x.jpg" })));
    const client = createPersonalMediaClient(config, fetcher);
    await expect(client.health()).resolves.toBe(true);
    await expect(client.inspect("https://youtu.be/abc")).resolves.toMatchObject({ id: "abc", durationSeconds: 90 });
    expect(fetcher).toHaveBeenNthCalledWith(1, `${config.baseUrl}/api/health`, expect.objectContaining({ headers: { Authorization: "Bearer secret" } }));
  });

  it("turns an API error envelope into PersonalApiError", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: "VIDEO_TOO_LONG", message: "Video 20 dakikadan uzun." } }), { status: 422 }));
    const client = createPersonalMediaClient(config, fetcher);
    await expect(client.inspect("https://youtu.be/abc")).rejects.toEqual(
      new PersonalApiError("VIDEO_TOO_LONG", "Video 20 dakikadan uzun."),
    );
  });

  it("returns a named File for every download format", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2]), {
      headers: { "content-type": "audio/mp4", "content-disposition": "attachment; filename=melodi.m4a" },
    }));
    const file = await createPersonalMediaClient(config, fetcher).download("https://youtu.be/abc", "ringtone-source");
    expect(file).toEqual(expect.objectContaining({ name: "melodi.m4a", type: "audio/mp4", size: 2 }));
  });
});
```

- [ ] **Step 6: Run the client test and verify RED**

Run: `npm run test:run -- src/personal/personalMediaClient.test.ts`

Expected: FAIL because `createPersonalMediaClient` does not exist.

- [ ] **Step 7: Implement the typed client**

```ts
// src/personal/personalMediaClient.ts
import { PersonalApiError, type DownloadFormat, type PersonalServerConfig, type YouTubeVideo } from "./types";

type Fetcher = typeof fetch;
export interface PersonalMediaClient {
  health(): Promise<boolean>;
  inspect(url: string): Promise<YouTubeVideo>;
  download(url: string, format: DownloadFormat): Promise<File>;
}

export function createPersonalMediaClient(config: PersonalServerConfig, fetcher: Fetcher = fetch): PersonalMediaClient {
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetcher(`${config.baseUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) {
      const body = await response.json() as { error: { code: ConstructorParameters<typeof PersonalApiError>[0]; message: string } };
      throw new PersonalApiError(body.error.code, body.error.message);
    }
    return response;
  };
  return {
    async health() { const body = await (await request("/api/health")).json() as { ok: boolean }; return body.ok; },
    async inspect(url) { return (await request("/api/youtube/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })).json() as Promise<YouTubeVideo>; },
    async download(url, format) {
      const response = await request("/api/youtube/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, format }) });
      const disposition = response.headers.get("content-disposition") ?? "attachment; filename=medya.bin";
      const name = /filename=([^;]+)/i.exec(disposition)?.[1]?.replace(/^"|"$/g, "") ?? "medya.bin";
      return new File([await response.blob()], name, { type: response.headers.get("content-type") ?? "application/octet-stream" });
    },
  };
}
```

- [ ] **Step 8: Run all Task 1 tests and commit**

Run: `npm run test:run -- src/personal/personalServerStorage.test.ts src/personal/personalMediaClient.test.ts`

Expected: all Task 1 tests PASS.

```bash
git add src/personal
git commit -m "feat: add personal media client and pairing storage"
```

### Task 2: Safe YouTube validation and `yt-dlp` media tool

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Create: `tsconfig.server.json`
- Create: `server/errors.ts`
- Create: `server/youtubeUrl.ts`
- Create: `server/youtubeUrl.test.ts`
- Create: `server/mediaTool.ts`
- Create: `server/ytDlpMediaTool.ts`
- Create: `server/ytDlpMediaTool.test.ts`

**Interfaces:**
- Consumes: `yt-dlp` executable, Node `spawn`, `mkdtemp`, `stat`, and recursive `rm`.
- Produces: `parseYouTubeUrl()`, `MediaTool`, `VideoInfo`, `PreparedDownload`, `createYtDlpMediaTool()`.

- [ ] **Step 1: Install backend development dependencies and add the Node test environment**

Run:

```bash
npm install express@5
npm install --save-dev @types/express@5 supertest @types/supertest tsx
```

Modify `vite.config.ts` test include to:

```ts
include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
```

Create `tsconfig.server.json` with Node types, `moduleResolution: "NodeNext"`, `module: "NodeNext"`, `noEmit: true`, and includes `server/**/*.ts`.

- [ ] **Step 2: Write failing YouTube URL tests**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "./youtubeUrl";

describe("parseYouTubeUrl", () => {
  function expectInvalid(url: string) {
    try {
      parseYouTubeUrl(url);
      throw new Error("Expected parseYouTubeUrl to reject the input");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_YOUTUBE_URL", status: 400 });
    }
  }

  it.each([
    ["https://www.youtube.com/watch?v=cm_tiqyoJ9k", "cm_tiqyoJ9k"],
    ["https://youtu.be/cm_tiqyoJ9k", "cm_tiqyoJ9k"],
    ["https://www.youtube.com/shorts/cm_tiqyoJ9k", "cm_tiqyoJ9k"],
  ])("accepts one HTTPS video URL", (url, id) => expect(parseYouTubeUrl(url)).toEqual({ canonicalUrl: `https://www.youtube.com/watch?v=${id}`, id }));

  it.each(["http://youtu.be/abc", "https://example.com/watch?v=abc", "https://www.youtube.com/playlist?list=abc", "https://www.youtube.com/watch?v=abc&list=playlist"])(
    "rejects unsupported input %s",
    expectInvalid,
  );
});
```

- [ ] **Step 3: Run URL tests and verify RED**

Run: `npm run test:run -- server/youtubeUrl.test.ts`

Expected: FAIL because `parseYouTubeUrl` does not exist.

- [ ] **Step 4: Implement explicit URL parsing and server error codes**

```ts
// server/errors.ts
export class ServerError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

// server/youtubeUrl.ts
import { ServerError } from "./errors.js";
const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
export function parseYouTubeUrl(raw: string): { canonicalUrl: string; id: string } {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new ServerError(400, "INVALID_YOUTUBE_URL", "Geçerli bir YouTube video bağlantısı girin."); }
  if (url.protocol !== "https:" || url.searchParams.has("list")) throw new ServerError(400, "INVALID_YOUTUBE_URL", "Yalnızca tek bir HTTPS YouTube videosu kullanabilirsiniz.");
  const host = url.hostname.toLowerCase();
  const id = host === "youtu.be" ? url.pathname.slice(1) : url.pathname === "/watch" ? url.searchParams.get("v") ?? "" : url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] ?? "" : "";
  if (!(host === "youtu.be" || host === "youtube.com" || host === "www.youtube.com") || !VIDEO_ID.test(id)) throw new ServerError(400, "INVALID_YOUTUBE_URL", "Geçerli bir YouTube video bağlantısı girin.");
  return { id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
}
```

- [ ] **Step 5: Run URL tests and verify GREEN**

Run: `npm run test:run -- server/youtubeUrl.test.ts`

Expected: all URL cases PASS.

- [ ] **Step 6: Write failing media-tool tests**

```ts
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createYtDlpMediaTool } from "./ytDlpMediaTool";

describe("ytDlpMediaTool", () => {
  it("inspects without downloading and enforces one video", async () => {
    const run = vi.fn(async () => ({ stdout: JSON.stringify({ id: "abc123", title: "Test", duration: 90, thumbnail: "https://i.ytimg.com/x.jpg" }), stderr: "" }));
    const tool = createYtDlpMediaTool({ run });
    await expect(tool.inspect("https://www.youtube.com/watch?v=abc123")).resolves.toMatchObject({ id: "abc123", durationSeconds: 90 });
    expect(run).toHaveBeenCalledWith("yt-dlp", expect.arrayContaining(["--dump-single-json", "--skip-download", "--no-playlist"]), expect.any(Object));
  });

  it("uses literal MP3, MP4, and ringtone arguments", () => {
    const tool = createYtDlpMediaTool({ run: vi.fn() });
    expect(tool.argumentsFor("mp3", "/tmp/job/output", "https://www.youtube.com/watch?v=abc123")).toEqual([
      "--no-playlist", "--max-filesize", "200M", "-x", "--audio-format", "mp3", "--audio-quality", "192K", "-o", "/tmp/job/output.%(ext)s", "https://www.youtube.com/watch?v=abc123",
    ]);
    expect(tool.argumentsFor("mp4", "/tmp/job/output", "https://www.youtube.com/watch?v=abc123")).toContain("bv*[height<=720][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=720][vcodec^=avc1][acodec^=mp4a]");
    expect(tool.argumentsFor("ringtone-source", "/tmp/job/output", "https://www.youtube.com/watch?v=abc123")).toContain("m4a");
  });

  it("sanitizes a hostile title into a safe attachment name", () => {
    const tool = createYtDlpMediaTool({ run: vi.fn() });
    expect(tool.safeName("../../Şarkı\r\nX-Evil: yes", "mp3")).toBe("sarki-x-evil-yes.mp3");
  });
});
```

- [ ] **Step 7: Run media-tool tests and verify RED**

Run: `npm run test:run -- server/ytDlpMediaTool.test.ts`

Expected: FAIL because `createYtDlpMediaTool` does not exist.

- [ ] **Step 8: Implement the injected process runner and media tool**

Define in `server/mediaTool.ts`:

```ts
export interface VideoInfo { id: string; title: string; durationSeconds: number; thumbnailUrl: string }
export type DownloadFormat = "mp3" | "mp4" | "ringtone-source";
export interface PreparedDownload { path: string; fileName: string; mimeType: string; size: number; cleanup(): Promise<void> }
export interface MediaTool {
  inspect(url: string): Promise<VideoInfo>;
  prepare(url: string, format: DownloadFormat): Promise<PreparedDownload>;
  shutdown(): Promise<void>;
}
```

Implement `createYtDlpMediaTool({ run })` in `server/ytDlpMediaTool.ts`. The default runner must call `spawn(command, args, { cwd, shell: false, windowsHide: true, signal })`, collect at most 1 MB each of stdout/stderr, reject non-zero exit codes, and never interpolate user input. `inspect()` must reject duration outside 1–1200. `prepare()` must perform its own metadata inspection before downloading so callers cannot bypass duration/live/playlist checks, register an `AbortController` and `mkdtemp(path.join(tmpdir(), "iphone-ringtone-"))` before launching the child, find exactly one output file, reject size above `200 * 1024 * 1024`, return literal MIME/extension mappings, and expose idempotent recursive cleanup. `shutdown()` must abort all active child processes, await their settlement, and recursively remove every registered job directory.

Use literal argument builders and filename rules rather than a shell command string:

```ts
const FORMAT_ARGS = {
  mp3: ["-x", "--audio-format", "mp3", "--audio-quality", "192K"],
  mp4: ["-f", "bv*[height<=720][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=720][vcodec^=avc1][acodec^=mp4a]", "--merge-output-format", "mp4"],
  "ringtone-source": ["-x", "--audio-format", "m4a"],
} as const;

function argumentsFor(format: DownloadFormat, outputBase: string, url: string): string[] {
  return ["--no-playlist", "--max-filesize", "200M", ...FORMAT_ARGS[format], "-o", `${outputBase}.%(ext)s`, url];
}

function safeName(title: string, format: DownloadFormat): string {
  const extension = format === "ringtone-source" ? "m4a" : format;
  const stem = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 80) || "youtube-medya";
  return `${stem}.${extension}`;
}
```

Map unavailable/private/live/age-restricted metadata to `VIDEO_UNAVAILABLE`, an out-of-range duration to `VIDEO_TOO_LONG`, a size violation to `OUTPUT_TOO_LARGE`, a missing/incompatible executable to `TOOL_UPDATE_REQUIRED`, and every remaining non-zero conversion exit to `CONVERSION_FAILED`.

Add runner-driven tests for an oversized result, a non-zero process exit, and a never-resolving child aborted by `shutdown()`. Inject `mkdtemp`, `stat`, `readdir`, and `rm` adapters in those tests; assert the directory is removed once for each failure and shutdown path without starting a real process.

- [ ] **Step 9: Run Task 2 tests, type-check the server, and commit**

Run:

```bash
npm run test:run -- server/youtubeUrl.test.ts server/ytDlpMediaTool.test.ts
npx tsc -p tsconfig.server.json
```

Expected: tests PASS and TypeScript exits 0.

```bash
git add package.json package-lock.json vite.config.ts tsconfig.server.json server
git commit -m "feat: add safe personal media tool"
```

### Task 3: Authenticated, CORS-limited Express API and cleanup lifecycle

**Files:**
- Create: `server/app.ts`
- Create: `server/app.test.ts`
- Create: `server/index.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MediaTool`, bearer token, exact allowed origins.
- Produces: `createPersonalServerApp(options)` and `npm run personal-server` on port 8787.

- [ ] **Step 1: Write failing API tests with a complete fake MediaTool**

```ts
// @vitest-environment node
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createPersonalServerApp } from "./app";

const origin = "https://classman89.github.io";
const auth = { Authorization: "Bearer test-token", Origin: origin };
function fakeTool() {
  return {
    inspect: vi.fn(async () => ({ id: "abc123", title: "Test", durationSeconds: 90, thumbnailUrl: "https://i.ytimg.com/x.jpg" })),
    prepare: vi.fn(async () => ({ path: "C:/tmp/test.mp3", fileName: "test.mp3", mimeType: "audio/mpeg", size: 2, cleanup: vi.fn(async () => undefined) })),
    shutdown: vi.fn(async () => undefined),
  };
}

describe("personal server API", () => {
  it("rejects missing auth and disallowed origins", async () => {
    const app = createPersonalServerApp({ token: "test-token", mediaTool: fakeTool(), sendFile: vi.fn() });
    expect((await request(app).get("/api/health").set("Origin", origin)).status).toBe(401);
    expect((await request(app).get("/api/health").set({ Authorization: "Bearer test-token", Origin: "https://evil.example" })).status).toBe(403);
  });

  it("returns video metadata to an authenticated Pages origin", async () => {
    const app = createPersonalServerApp({ token: "test-token", mediaTool: fakeTool(), sendFile: vi.fn() });
    const response = await request(app).post("/api/youtube/inspect").set(auth).send({ url: "https://youtu.be/abc123" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: "abc123", durationSeconds: 90 });
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("returns 429 for a second active job and still cleans the first", async () => {
    let release!: () => void;
    const cleanup = vi.fn(async () => undefined);
    const tool = fakeTool();
    tool.prepare = vi.fn(async () => ({ path: "C:/tmp/test.mp3", fileName: "test.mp3", mimeType: "audio/mpeg", size: 2, cleanup }));
    const sendFile = vi.fn((res: import("express").Response) => new Promise<void>((resolve) => {
      release = () => { res.status(200).end("ok"); resolve(); };
    }));
    const app = createPersonalServerApp({ token: "test-token", mediaTool: tool, sendFile });
    const first = request(app).post("/api/youtube/download").set(auth).send({ url: "https://youtu.be/abc123", format: "mp3" });
    await vi.waitFor(() => expect(sendFile).toHaveBeenCalled());
    const second = await request(app).post("/api/youtube/download").set(auth).send({ url: "https://youtu.be/abc123", format: "mp3" });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("PERSONAL_SERVER_BUSY");
    release();
    await first;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run API tests and verify RED**

Run: `npm run test:run -- server/app.test.ts`

Expected: FAIL because `createPersonalServerApp` does not exist.

- [ ] **Step 3: Implement middleware, routes, error envelope, and job lock**

`createPersonalServerApp()` must:

```ts
export interface PersonalServerOptions {
  token: string;
  mediaTool: MediaTool;
  allowedOrigins?: readonly string[];
  sendFile?: (res: express.Response, download: PreparedDownload) => Promise<void>;
}
```

Use `express.json({ limit: "8kb" })`. Process CORS before authorization, respond to `OPTIONS` with 204, require exact origins (`https://classman89.github.io`, `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, and `http://127.0.0.1:4173`), compare bearer tokens with `timingSafeEqual` after equal-length checks, validate `format` against a literal set, and translate every `ServerError` into `{ error: { code, message } }`. Both YouTube routes must call `parseYouTubeUrl()` and pass only its canonical URL to `MediaTool`. The download route must set the job lock before `prepare()`, clear it in `finally`, and call `download.cleanup()` exactly once after success, error, or response close.

The default `sendFile` must set `Content-Type`, `Content-Length`, and a quoted, sanitized `Content-Disposition`, then await `pipeline(createReadStream(download.path), res)`. Wrap cleanup with an internal once-guard and register the same guarded function on `res.once("close", ...)` and in the route `finally`; this makes client disconnects and normal completion converge without double deletion.

- [ ] **Step 4: Add connection-close cleanup test**

Add a test whose injected `sendFile` dispatches `res.emit("close")` and rejects. Assert `cleanup` is called once and the next download request is no longer rejected as busy.

- [ ] **Step 5: Implement startup token and Codespaces URL output**

`server/index.ts` must generate `randomBytes(32).toString("base64url")`, create the real media tool, listen on `0.0.0.0:8787`, derive `publicUrl` from `CODESPACE_NAME` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`, and print only:

```ts
console.log("Kişisel sunucu hazır");
console.log(`Adres: ${publicUrl}`);
console.log(`Eşleştirme kodu: ${token}`);
```

When Codespaces environment variables are absent, print `Adres: http://localhost:8787`.

Register `SIGINT` and `SIGTERM` handlers that stop accepting requests, await `mediaTool.shutdown()`, close the HTTP server, and exit. Add a server lifecycle unit test with an injected signal callback and fake tool; assert `shutdown()` is awaited before the exit callback.

Add scripts:

```json
"personal-server": "tsx server/index.ts",
"typecheck:server": "tsc -p tsconfig.server.json"
```

- [ ] **Step 6: Run API tests and server type-check, then commit**

Run:

```bash
npm run test:run -- server/app.test.ts
npm run typecheck:server
```

Expected: all API lifecycle tests PASS and type-check exits 0.

```bash
git add package.json package-lock.json server
git commit -m "feat: expose protected personal media API"
```

### Task 4: Pairing and YouTube actions in the glass interface

**Files:**
- Create: `src/components/PersonalServerSettings.tsx`
- Create: `src/components/PersonalServerSettings.test.tsx`
- Create: `src/components/YouTubeImportPanel.tsx`
- Create: `src/components/YouTubeImportPanel.test.tsx`
- Modify: `src/components/FilePicker.tsx`
- Modify: `src/components/FilePicker.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Task 1 storage/client, existing `chooseFile(File)`, existing glass visual language.
- Produces: pairing UI, connected/offline status, direct-link/YouTube submode, MP3/MP4 browser downloads, and `ringtone-source` transfer into the current editor.

- [ ] **Step 1: Write failing pairing component tests**

Test that entering a valid URL/token calls `onSave`, `Bağlantıyı kaldır` calls `onClear`, a successful health response renders `Kişisel sunucu bağlı`, and `UNAUTHORIZED` after a restart renders `Kişisel sunucu kapalı` without throwing.

Use literal form interactions:

```ts
await user.type(screen.getByLabelText("Codespaces sunucu adresi"), "https://quiet-space-8787.app.github.dev");
await user.type(screen.getByLabelText("Eşleştirme kodu"), "secret");
await user.click(screen.getByRole("button", { name: "Sunucuya bağlan" }));
expect(onSave).toHaveBeenCalledWith({ baseUrl: "https://quiet-space-8787.app.github.dev", token: "secret" });
```

- [ ] **Step 2: Run pairing tests and verify RED**

Run: `npm run test:run -- src/components/PersonalServerSettings.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `PersonalServerSettings`**

The component receives:

```ts
interface PersonalServerSettingsProps {
  config?: PersonalServerConfig;
  status: "checking" | "connected" | "offline";
  onSave(config: PersonalServerConfig): void;
  onClear(): void;
}
```

Render the exact status strings from the spec, keep the token input `type="password"`, never render its value outside the input, and preserve the current glass card style.

- [ ] **Step 4: Write failing YouTube panel tests**

Cover inspect, three actions, busy error, and ringtone transfer:

```ts
await user.type(screen.getByLabelText("YouTube video bağlantısı"), "https://youtu.be/abc123");
await user.click(screen.getByRole("button", { name: "Videoyu bul" }));
expect(await screen.findByText("Kısa video")).toBeVisible();
await user.click(screen.getByRole("button", { name: "Zil sesi hazırla" }));
expect(onRingtoneSource).toHaveBeenCalledWith(expect.objectContaining({ name: "kisa-video.m4a" }));
```

Assert MP3 and MP4 actions expose download links with `.mp3` and `.mp4` names, and `PERSONAL_SERVER_BUSY` renders `Kişisel sunucu başka bir dosya hazırlıyor. İlk işlem bitince tekrar deneyin.`

Create one exhaustive user-message map and table-test every API code so raw stderr or server implementation text can never reach the interface:

```ts
const PERSONAL_ERROR_MESSAGES: Record<PersonalApiErrorCode, string> = {
  UNAUTHORIZED: "Eşleştirme kodu geçersiz. Codespace terminalindeki yeni kodla tekrar bağlanın.",
  ORIGIN_NOT_ALLOWED: "Bu kişisel sunucu yalnızca uygulamanın resmi adresinden kullanılabilir.",
  INVALID_YOUTUBE_URL: "Tek bir geçerli YouTube video bağlantısı girin.",
  VIDEO_UNAVAILABLE: "Video herkese açık değil veya oturum gerektiriyor.",
  VIDEO_TOO_LONG: "Video 20 dakikadan uzun. Daha kısa bir video seçin.",
  OUTPUT_TOO_LARGE: "Hazırlanan dosya 200 MB sınırını aşıyor.",
  PERSONAL_SERVER_BUSY: "Kişisel sunucu başka bir dosya hazırlıyor. İlk işlem bitince tekrar deneyin.",
  TOOL_UPDATE_REQUIRED: "YouTube aracı güncel değil. Codespace'i yeniden oluşturun.",
  CONVERSION_FAILED: "Dosya hazırlanamadı. Başka bir video veya biçim deneyin.",
};
```

- [ ] **Step 5: Run YouTube panel tests and verify RED**

Run: `npm run test:run -- src/components/YouTubeImportPanel.test.tsx`

Expected: FAIL because the panel does not exist.

- [ ] **Step 6: Implement `YouTubeImportPanel` and object URL cleanup**

Use this boundary:

```ts
interface YouTubeImportPanelProps {
  client: PersonalMediaClient;
  onRingtoneSource(file: File): void;
}
```

Keep one local state union for `idle`, `inspecting`, `ready`, `downloading`, and `error`. Use `useObjectUrl` for completed MP3/MP4 files so replacements and unmounts revoke old URLs. The ringtone action calls `onRingtoneSource(file)` immediately instead of showing a duplicate download link.

- [ ] **Step 7: Integrate link submodes and App state**

Change the top tab label from `Doğrudan bağlantı` to `Bağlantı`. Inside it add two segment buttons: `YouTube` and `Doğrudan dosya`. When YouTube is selected, render settings or the YouTube panel; when direct file is selected, keep the existing URL form unchanged.

Extend `FilePicker` with explicit personal-server props instead of reading storage inside the picker:

```ts
interface FilePickerProps {
  onFile(file: File): void;
  onDirectUrl(url: string): Promise<void>;
  personalConfig?: PersonalServerConfig;
  personalStatus: "checking" | "connected" | "offline";
  personalClient?: PersonalMediaClient;
  onSavePersonal(config: PersonalServerConfig): void;
  onClearPersonal(): void;
}
```

In `App`, load saved config once, create a client only when config exists, health-check on save/start, and pass `chooseFile` as `onRingtoneSource`. A failed health check only changes personal server status; it must not call `setState({ name: "empty" })` or discard an existing editor selection.

- [ ] **Step 8: Run component and App tests, then commit**

Run:

```bash
npm run test:run -- src/components/PersonalServerSettings.test.tsx src/components/YouTubeImportPanel.test.tsx src/components/FilePicker.test.tsx src/App.test.tsx
```

Expected: all pairing, download, stale-token, direct-link, and existing editor tests PASS.

```bash
git add src/components src/personal src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: connect glass studio to personal media server"
```

### Task 5: Reproducible Codespaces environment and operating guide

**Files:**
- Create: `.devcontainer/Dockerfile`
- Create: `.devcontainer/devcontainer.json`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 3 `npm run personal-server`.
- Produces: a Codespace with Node 24, Python `yt-dlp`, FFmpeg, dependencies, and a documented 8787 port pairing flow.

- [ ] **Step 1: Add the exact Dev Container image and install commands**

```dockerfile
FROM mcr.microsoft.com/devcontainers/javascript-node:1-24-bookworm
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
  && python3 -m pip install --break-system-packages --no-cache-dir yt-dlp \
  && rm -rf /var/lib/apt/lists/*
```

```json
{
  "name": "iPhone Zil Sesi Personal",
  "build": { "dockerfile": "Dockerfile" },
  "postCreateCommand": "npm ci",
  "forwardPorts": [8787],
  "portsAttributes": {
    "8787": {
      "label": "Kişisel medya sunucusu",
      "onAutoForward": "notify"
    }
  }
}
```

- [ ] **Step 2: Document the complete personal workflow**

Add a README section with these literal commands and UI actions:

```text
1. GitHub → Code → Codespaces → Create codespace on main.
2. Terminal: npm run personal-server
3. Ports → 8787 → Port Visibility → Public
4. Copy the printed Adres and Eşleştirme kodu.
5. Open https://classman89.github.io/iphone-zil-sesi/
6. Bağlantı → YouTube → values → Sunucuya bağlan.
7. When finished: Codespaces → Stop codespace; do not leave port 8787 public.
```

State that the workflow is only for media the user may download, that the port is unauthenticated by GitHub once public but protected by the ephemeral app token, and that deleting/restarting the Codespace requires pairing again.

- [ ] **Step 3: Add an environment smoke command and ignore temp output**

Add to `package.json`:

```json
"check:personal-tools": "yt-dlp --version && ffmpeg -version"
```

Add `.personal-media/` to `.gitignore`, even though production uses OS temp storage, to prevent accidental commits during manual diagnosis.

- [ ] **Step 4: Validate JSON, Docker build inputs, docs, and commit**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('.devcontainer/devcontainer.json','utf8')); console.log('devcontainer json ok')"
npm run typecheck:server
git diff --check
```

Expected: JSON message prints, TypeScript exits 0, and diff check has no errors.

```bash
git add .devcontainer .gitignore README.md package.json package-lock.json
git commit -m "chore: add personal Codespaces runtime"
```

### Task 6: Browser integration, CI coverage, and end-to-end verification

**Files:**
- Modify: `e2e/ringtone-flow.spec.ts`
- Modify: `.github/workflows/pages.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: complete Tasks 1–5 implementation.
- Produces: automated pairing-to-editor browser coverage, server tests in CI, and final deployment evidence.

- [ ] **Step 1: Write the failing Playwright personal-flow test**

Route the fake Codespaces origin and exercise the real UI:

```ts
test("pairs a personal server and imports a ringtone source", async ({ page }) => {
  await page.route("https://quiet-space-8787.app.github.dev/api/**", async (route) => {
    const url = route.request().url();
    const cors = {
      "access-control-allow-origin": "http://127.0.0.1:4173",
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.endsWith("/api/health")) return route.fulfill({ headers: cors, json: { ok: true, service: "iphone-ringtone-personal", version: 1 } });
    if (url.endsWith("/api/youtube/inspect")) return route.fulfill({ headers: cors, json: { id: "abc123", title: "Kısa video", durationSeconds: 2, thumbnailUrl: "https://i.ytimg.com/x.jpg" } });
    return route.fulfill({ status: 200, contentType: "audio/wav", headers: { ...cors, "content-disposition": "attachment; filename=kisa-video.wav" }, body: await readFile(tonePath) });
  });
  await page.goto("/iphone-zil-sesi/");
  await page.getByRole("tab", { name: "Bağlantı" }).click();
  await page.getByRole("button", { name: "YouTube" }).click();
  await page.getByLabel("Codespaces sunucu adresi").fill("https://quiet-space-8787.app.github.dev");
  await page.getByLabel("Eşleştirme kodu").fill("secret");
  await page.getByRole("button", { name: "Sunucuya bağlan" }).click();
  await page.getByLabel("YouTube video bağlantısı").fill("https://youtu.be/abc123");
  await page.getByRole("button", { name: "Videoyu bul" }).click();
  await page.getByRole("button", { name: "Zil sesi hazırla" }).click();
  await expect(page.getByText("Seçilen medya:")).toContainText("kisa-video.wav");
  await expect(page.getByRole("button", { name: "Zil sesini hazırla" })).toBeEnabled();
});
```

- [ ] **Step 2: Run Playwright and verify RED, then GREEN after integration corrections**

Run: `npx playwright test`

Expected first run: the new test fails because pairing and the YouTube panel are not yet wired through the browser flow. Finish the `FilePicker`/`App` wiring defined in Task 4, rerun, and require all existing plus new tests to PASS.

- [ ] **Step 3: Make CI run browser and server suites without YouTube access**

Update `.github/workflows/pages.yml` so the build job runs:

```yaml
- name: Run unit, component, and server tests
  run: npm run test:run
- name: Type-check personal server
  run: npm run typecheck:server
- name: Build static site
  run: npm run build
```

Do not install or invoke `yt-dlp` in Pages CI.

- [ ] **Step 4: Run the complete fresh verification sequence**

Run:

```bash
npm run test:run
npm run typecheck:server
npm run build
npx playwright test
git diff --check
```

Expected: every Vitest file passes, server type-check exits 0, Vite builds, all Playwright scenarios pass, and diff check is clean.

- [ ] **Step 5: Perform manual local API smoke without YouTube**

Start `npm run personal-server`, copy the local token, then request health without placing the token in shell history:

```bash
read -rsp "Eşleştirme kodu: " PAIRING_TOKEN
curl -H "Authorization: Bearer ${PAIRING_TOKEN}" -H "Origin: http://localhost:4173" http://localhost:8787/api/health
unset PAIRING_TOKEN
```

Expected JSON: `{"ok":true,"service":"iphone-ringtone-personal","version":1}`. Stop the server after the response. This smoke test does not submit a YouTube URL.

- [ ] **Step 6: Commit, push, and verify GitHub Pages**

```bash
git add e2e/ringtone-flow.spec.ts .github/workflows/pages.yml README.md
git commit -m "test: verify personal Codespaces workflow"
git push origin HEAD:main
gh run watch --exit-status
```

Expected: GitHub Actions build and Pages deploy succeed. Open `https://classman89.github.io/iphone-zil-sesi/`, confirm local upload still works, and confirm the YouTube panel shows `Kişisel sunucu kapalı` until paired.
