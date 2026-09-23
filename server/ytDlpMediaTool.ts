import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ServerError } from "./errors.js";
import type {
  DownloadFormat,
  MediaTool,
  PreparedDownload,
  VideoInfo,
} from "./mediaTool.js";

const MAX_OUTPUT_BYTES = 200 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 1024 * 1024;

const FORMAT_ARGS: Record<DownloadFormat, readonly string[]> = {
  mp3: ["-x", "--audio-format", "mp3", "--audio-quality", "192K"],
  mp4: [
    "-f",
    "bv*[height<=720][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=720][vcodec^=avc1][acodec^=mp4a]",
    "--merge-output-format",
    "mp4",
  ],
  "ringtone-source": ["-x", "--audio-format", "m4a"],
};

const OUTPUT_DETAILS: Record<
  DownloadFormat,
  { extension: string; mimeType: string }
> = {
  mp3: { extension: "mp3", mimeType: "audio/mpeg" },
  mp4: { extension: "mp4", mimeType: "video/mp4" },
  "ringtone-source": { extension: "m4a", mimeType: "audio/mp4" },
};

export interface RunOptions {
  cwd?: string;
  signal: AbortSignal;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

export type ProcessRunner = (
  command: string,
  args: readonly string[],
  options: RunOptions,
) => Promise<RunResult>;

export interface FileAdapters {
  mkdtemp(prefix: string): Promise<string>;
  readdir(directory: string): Promise<string[]>;
  stat(filePath: string): Promise<{ size: number }>;
  rm(directory: string): Promise<void>;
}

export interface YtDlpMediaTool extends MediaTool {
  argumentsFor(format: DownloadFormat, outputBase: string, url: string): string[];
  safeName(title: string, format: DownloadFormat): string;
}

interface ActiveWork {
  controller: AbortController;
  promise: Promise<RunResult>;
  cleanup?: () => Promise<void>;
}

interface YtDlpMetadata {
  id?: unknown;
  title?: unknown;
  duration?: unknown;
  thumbnail?: unknown;
  is_live?: unknown;
  live_status?: unknown;
  availability?: unknown;
  entries?: unknown;
}

const defaultFiles: FileAdapters = {
  mkdtemp,
  readdir: async (directory) => readdir(directory),
  stat,
  rm: async (directory) => rm(directory, { recursive: true, force: true }),
};

function createDefaultRunner(): ProcessRunner {
  return (command, args, options) =>
    new Promise<RunResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        signal: options.signal,
      });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout) > MAX_CAPTURE_BYTES) {
          child.kill();
          fail(new Error("yt-dlp stdout sınırı aşıldı"));
        }
      });
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
        if (Buffer.byteLength(stderr) > MAX_CAPTURE_BYTES) {
          child.kill();
          fail(new Error("yt-dlp stderr sınırı aşıldı"));
        }
      });
      child.on("error", fail);
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        const error = Object.assign(new Error("yt-dlp işlemi tamamlanamadı"), {
          exitCode: code,
          stderr,
        });
        reject(error);
      });
    });
}

function argumentsFor(
  format: DownloadFormat,
  outputBase: string,
  url: string,
): string[] {
  return [
    "--no-playlist",
    "--js-runtimes",
    "node",
    "--max-filesize",
    "200M",
    ...FORMAT_ARGS[format],
    "-o",
    `${outputBase}.%(ext)s`,
    url,
  ];
}

function transliterateTurkish(value: string): string {
  return value
    .replaceAll("ı", "i")
    .replaceAll("İ", "I")
    .replaceAll("ş", "s")
    .replaceAll("Ş", "S")
    .replaceAll("ğ", "g")
    .replaceAll("Ğ", "G")
    .replaceAll("ç", "c")
    .replaceAll("Ç", "C")
    .replaceAll("ö", "o")
    .replaceAll("Ö", "O")
    .replaceAll("ü", "u")
    .replaceAll("Ü", "U");
}

function safeName(title: string, format: DownloadFormat): string {
  const { extension } = OUTPUT_DETAILS[format];
  const stem =
    transliterateTurkish(title)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "youtube-medya";
  return `${stem}.${extension}`;
}

function toolError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof ServerError) return error;
  const record = error as { code?: unknown; stderr?: unknown };
  if (record?.code === "ENOENT") {
    return new ServerError(
      503,
      "TOOL_UPDATE_REQUIRED",
      "Medya aracı bulunamadı. Codespace'i yeniden oluşturun.",
    );
  }
  if (
    typeof record?.stderr === "string" &&
    /unable to extract|unsupported url|signature/i.test(record.stderr)
  ) {
    return new ServerError(
      503,
      "TOOL_UPDATE_REQUIRED",
      "YouTube aracı güncellenmeli. Codespace'i yeniden oluşturun.",
    );
  }
  return new ServerError(422, fallbackCode, fallbackMessage);
}

function parseMetadata(stdout: string): VideoInfo {
  let metadata: YtDlpMetadata;
  try {
    metadata = JSON.parse(stdout) as YtDlpMetadata;
  } catch {
    throw new ServerError(422, "VIDEO_UNAVAILABLE", "Video bilgileri alınamadı.");
  }

  if (
    metadata.is_live === true ||
    metadata.live_status === "is_live" ||
    Array.isArray(metadata.entries) ||
    ["private", "premium_only", "subscriber_only", "needs_auth"].includes(
      String(metadata.availability),
    )
  ) {
    throw new ServerError(
      422,
      "VIDEO_UNAVAILABLE",
      "Video herkese açık değil veya canlı yayın.",
    );
  }

  const duration = Number(metadata.duration);
  if (!Number.isFinite(duration) || duration < 1 || duration > 1200) {
    throw new ServerError(
      422,
      "VIDEO_TOO_LONG",
      "Video süresi 1 saniye ile 20 dakika arasında olmalı.",
    );
  }
  if (typeof metadata.id !== "string" || typeof metadata.title !== "string") {
    throw new ServerError(422, "VIDEO_UNAVAILABLE", "Video bilgileri eksik.");
  }

  return {
    id: metadata.id,
    title: metadata.title,
    durationSeconds: duration,
    thumbnailUrl:
      typeof metadata.thumbnail === "string" ? metadata.thumbnail : "",
  };
}

export function createYtDlpMediaTool(options: {
  run?: ProcessRunner;
  files?: FileAdapters;
} = {}): YtDlpMediaTool {
  const run = options.run ?? createDefaultRunner();
  const files = options.files ?? defaultFiles;
  const active = new Set<ActiveWork>();

  function linkedController(signal?: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    return {
      controller,
      detach: () => signal?.removeEventListener("abort", abort),
    };
  }

  async function inspect(url: string, signal?: AbortSignal): Promise<VideoInfo> {
    const { controller, detach } = linkedController(signal);
    const promise = run(
      "yt-dlp",
      [
        "--dump-single-json",
        "--skip-download",
        "--no-playlist",
        "--js-runtimes",
        "node",
        url,
      ],
      { signal: controller.signal },
    );
    const work: ActiveWork = { controller, promise };
    active.add(work);
    try {
      return parseMetadata((await promise).stdout);
    } catch (error) {
      throw toolError(
        error,
        "VIDEO_UNAVAILABLE",
        "Video bulunamadı veya oturum gerektiriyor.",
      );
    } finally {
      detach();
      active.delete(work);
    }
  }

  async function prepare(
    url: string,
    format: DownloadFormat,
    signal?: AbortSignal,
  ): Promise<PreparedDownload> {
    const video = await inspect(url, signal);
    const directory = await files.mkdtemp(
      path.join(tmpdir(), "iphone-ringtone-"),
    );
    let cleaned = false;
    let work: ActiveWork | undefined;
    const { controller, detach } = linkedController(signal);
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      detach();
      if (work) active.delete(work);
      await files.rm(directory);
    };
    const outputBase = `${directory.replace(/[\\/]+$/, "")}/output`;
    const promise = run("yt-dlp", argumentsFor(format, outputBase, url), {
      cwd: directory,
      signal: controller.signal,
    });
    work = { controller, promise, cleanup };
    active.add(work);

    try {
      await promise;
      const names = await files.readdir(directory);
      if (names.length !== 1) {
        throw new ServerError(
          422,
          "CONVERSION_FAILED",
          "Tek bir medya çıktısı oluşturulamadı.",
        );
      }
      const filePath = `${directory.replace(/[\\/]+$/, "")}/${names[0]}`;
      const fileStat = await files.stat(filePath);
      if (fileStat.size > MAX_OUTPUT_BYTES) {
        throw new ServerError(
          413,
          "OUTPUT_TOO_LARGE",
          "Hazırlanan dosya 200 MB sınırını aşıyor.",
        );
      }
      return {
        path: filePath,
        fileName: safeName(video.title, format),
        mimeType: OUTPUT_DETAILS[format].mimeType,
        size: fileStat.size,
        cleanup,
      };
    } catch (error) {
      await cleanup();
      throw toolError(
        error,
        "CONVERSION_FAILED",
        "Dosya hazırlanamadı.",
      );
    }
  }

  async function shutdown(): Promise<void> {
    const jobs = [...active];
    for (const job of jobs) job.controller.abort();
    await Promise.allSettled(jobs.map((job) => job.promise));
    await Promise.all(jobs.map((job) => job.cleanup?.() ?? Promise.resolve()));
  }

  return { inspect, prepare, shutdown, argumentsFor, safeName };
}
