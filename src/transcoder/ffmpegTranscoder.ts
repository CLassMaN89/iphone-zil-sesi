import type {
  ConversionRequest,
  ConversionResult,
  Transcoder,
} from "./types";

export interface FfmpegPort {
  writeFile(path: string, data: Uint8Array): Promise<unknown>;
  exec(args: string[]): Promise<unknown>;
  readFile(path: string): Promise<Uint8Array | string>;
  deleteFile(path: string): Promise<unknown>;
  onProgress(listener: (ratio: number) => void): () => void;
  terminate(): void;
}

let conversionSequence = 0;

function numeric(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function audioFilter(request: ConversionRequest): string {
  const filters = [`volume=${numeric(request.volume)}`];

  if (request.fadeIn > 0) {
    filters.push(`afade=t=in:st=0:d=${numeric(request.fadeIn)}`);
  }

  if (request.fadeOut > 0) {
    const fadeStart = Math.max(0, request.selection.length - request.fadeOut);
    filters.push(
      `afade=t=out:st=${numeric(fadeStart)}:d=${numeric(request.fadeOut)}`,
    );
  }

  return filters.join(",");
}

function outputBlob(data: Uint8Array | string, type: string): Blob {
  if (typeof data === "string") {
    return new Blob([data], { type });
  }

  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy.buffer], { type });
}

async function ignoreMissingFile(
  port: FfmpegPort,
  path: string,
): Promise<void> {
  try {
    await port.deleteFile(path);
  } catch {
    // A failed encoder may not create its output. Cleanup remains best effort.
  }
}

export class FfmpegTranscoder implements Transcoder {
  constructor(private readonly port: FfmpegPort) {}

  async convert(
    request: ConversionRequest,
    onProgress: (ratio: number) => void,
  ): Promise<ConversionResult> {
    const id = `${Date.now()}-${conversionSequence++}`;
    const inputExtension = request.file.name.split(".").pop()?.toLowerCase() || "media";
    const inputPath = `input-${id}.${inputExtension}`;
    const m4aPath = `output-${id}.m4a`;
    const wavPath = `output-${id}.wav`;
    const removeProgressListener = this.port.onProgress((ratio) => {
      onProgress(Math.min(1, Math.max(0, ratio)));
    });

    try {
      await this.port.writeFile(
        inputPath,
        new Uint8Array(await request.file.arrayBuffer()),
      );

      const commonArgs = [
        "-ss",
        numeric(request.selection.start),
        "-t",
        numeric(request.selection.length),
        "-i",
        inputPath,
        "-vn",
        "-af",
        audioFilter(request),
      ];

      try {
        await this.port.exec([
          ...commonArgs,
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          m4aPath,
        ]);
        const data = await this.port.readFile(m4aPath);
        return {
          blob: outputBlob(data, "audio/mp4"),
          fileName: request.outputName.replace(/\.[^.]+$/, ".m4a"),
          format: "m4a",
        };
      } catch {
        await this.port.exec([
          ...commonArgs,
          "-c:a",
          "pcm_s16le",
          "-ar",
          "44100",
          "-ac",
          "2",
          wavPath,
        ]);
        const data = await this.port.readFile(wavPath);
        return {
          blob: outputBlob(data, "audio/wav"),
          fileName: request.outputName.replace(/\.[^.]+$/, ".wav"),
          format: "wav",
        };
      }
    } finally {
      removeProgressListener();
      await Promise.all([
        ignoreMissingFile(this.port, inputPath),
        ignoreMissingFile(this.port, m4aPath),
        ignoreMissingFile(this.port, wavPath),
      ]);
    }
  }

  dispose(): void {
    this.port.terminate();
  }
}

export async function createBrowserTranscoder(): Promise<Transcoder> {
  const [{ FFmpeg }] = await Promise.all([import("@ffmpeg/ffmpeg")]);
  const ffmpeg = new FFmpeg();
  const coreBase = new URL(
    `${import.meta.env.BASE_URL}ffmpeg/`,
    window.location.origin,
  );

  try {
    await ffmpeg.load({
      coreURL: new URL("ffmpeg-core.js", coreBase).href,
      wasmURL: new URL("ffmpeg-core.wasm", coreBase).href,
    });
  } catch (error) {
    ffmpeg.terminate();
    throw error;
  }

  const port: FfmpegPort = {
    writeFile: (path, data) => ffmpeg.writeFile(path, data),
    exec: async (args) => {
      const exitCode = await ffmpeg.exec(args);
      if (exitCode !== 0) {
        throw new Error(`FFmpeg işlemi ${exitCode} koduyla durdu.`);
      }
    },
    readFile: (path) => ffmpeg.readFile(path),
    deleteFile: (path) => ffmpeg.deleteFile(path),
    onProgress: (listener) => {
      const callback = ({ progress }: { progress: number }) => listener(progress);
      ffmpeg.on("progress", callback);
      return () => ffmpeg.off("progress", callback);
    },
    terminate: () => ffmpeg.terminate(),
  };

  return new FfmpegTranscoder(port);
}
