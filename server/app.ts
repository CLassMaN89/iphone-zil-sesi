import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
  type Response,
} from "express";
import { ServerError } from "./errors.js";
import type {
  DownloadFormat,
  MediaTool,
  PreparedDownload,
} from "./mediaTool.js";
import { parseYouTubeUrl } from "./youtubeUrl.js";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://classman89.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
] as const;
const DOWNLOAD_FORMATS = new Set<DownloadFormat>([
  "mp3",
  "mp4",
  "ringtone-source",
]);

export interface PersonalServerOptions {
  token: string;
  mediaTool: MediaTool;
  allowedOrigins?: readonly string[];
  sendFile?: (res: Response, download: PreparedDownload) => Promise<void>;
}

function tokensMatch(expected: string, authorization: string | undefined): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function safeAttachmentName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 128) || "medya.bin";
}

async function defaultSendFile(
  res: Response,
  download: PreparedDownload,
): Promise<void> {
  res.setHeader("Content-Type", download.mimeType);
  res.setHeader("Content-Length", String(download.size));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeAttachmentName(download.fileName)}"`,
  );
  await pipeline(createReadStream(download.path), res);
}

function requireStringUrl(body: unknown): string {
  if (
    typeof body !== "object" ||
    body === null ||
    !("url" in body) ||
    typeof body.url !== "string"
  ) {
    throw new ServerError(
      400,
      "INVALID_YOUTUBE_URL",
      "Geçerli bir YouTube video bağlantısı girin.",
    );
  }
  return body.url;
}

export function createPersonalServerApp(options: PersonalServerOptions) {
  const app = express();
  const allowedOrigins = new Set(
    options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
  );
  const sendFile = options.sendFile ?? defaultSendFile;
  let downloadActive = false;

  const cors: RequestHandler = (req, res, next) => {
    const origin = req.get("Origin");
    if (!origin || !allowedOrigins.has(origin)) {
      next(
        new ServerError(
          403,
          "ORIGIN_NOT_ALLOWED",
          "Bu origin kişisel sunucuyu kullanamaz.",
        ),
      );
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition, Content-Type, Content-Length",
    );
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };

  const authorize: RequestHandler = (req, _res, next) => {
    if (!tokensMatch(options.token, req.get("Authorization"))) {
      next(new ServerError(401, "UNAUTHORIZED", "Eşleştirme kodu geçersiz."));
      return;
    }
    next();
  };

  app.use("/api", cors, authorize, express.json({ limit: "8kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "iphone-ringtone-personal", version: 1 });
  });

  app.post("/api/youtube/inspect", async (req, res, next) => {
    try {
      const { canonicalUrl } = parseYouTubeUrl(requireStringUrl(req.body));
      res.json(await options.mediaTool.inspect(canonicalUrl));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/youtube/download", async (req, res, next) => {
    if (downloadActive) {
      next(
        new ServerError(
          429,
          "PERSONAL_SERVER_BUSY",
          "Kişisel sunucu başka bir dosya hazırlıyor.",
        ),
      );
      return;
    }
    downloadActive = true;

    let download: PreparedDownload | undefined;
    let cleanupPromise: Promise<void> | undefined;
    let thrown: unknown;
    const cleanupOnce = () => {
      cleanupPromise ??= download?.cleanup() ?? Promise.resolve();
      return cleanupPromise;
    };

    try {
      const url = requireStringUrl(req.body);
      const format =
        typeof req.body === "object" && req.body !== null && "format" in req.body
          ? req.body.format
          : undefined;
      if (typeof format !== "string" || !DOWNLOAD_FORMATS.has(format as DownloadFormat)) {
        throw new ServerError(400, "CONVERSION_FAILED", "Geçersiz indirme biçimi.");
      }
      const { canonicalUrl } = parseYouTubeUrl(url);
      download = await options.mediaTool.prepare(
        canonicalUrl,
        format as DownloadFormat,
      );
      res.once("close", () => {
        void cleanupOnce();
      });
      await sendFile(res, download);
    } catch (error) {
      thrown = error;
    } finally {
      await cleanupOnce();
      downloadActive = false;
    }

    if (thrown && !res.headersSent && !res.writableEnded) {
      next(thrown);
    }
  });

  const errors: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof ServerError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    res.status(500).json({
      error: { code: "CONVERSION_FAILED", message: "İşlem tamamlanamadı." },
    });
  };
  app.use(errors);

  return app;
}
