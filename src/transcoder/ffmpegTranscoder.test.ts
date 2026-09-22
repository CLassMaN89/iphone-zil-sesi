import { describe, expect, it } from "vitest";
import { FfmpegTranscoder, type FfmpegPort } from "./ffmpegTranscoder";
import type { ConversionRequest } from "./types";

class FakeFfmpegPort implements FfmpegPort {
  commands: string[][] = [];
  deleted: string[] = [];
  written: string[] = [];
  terminated = false;
  failAac = false;
  progressListener?: (ratio: number) => void;

  async writeFile(path: string): Promise<void> {
    this.written.push(path);
  }

  async exec(args: string[]): Promise<void> {
    this.commands.push(args);
    this.progressListener?.(0.5);
    if (this.failAac && args.at(-1)?.endsWith(".m4a")) {
      throw new Error("AAC encoder unavailable");
    }
  }

  async readFile(): Promise<Uint8Array> {
    return new Uint8Array([82, 73, 70, 70]);
  }

  async deleteFile(path: string): Promise<void> {
    this.deleted.push(path);
  }

  onProgress(listener: (ratio: number) => void): () => void {
    this.progressListener = listener;
    return () => {
      this.progressListener = undefined;
    };
  }

  terminate(): void {
    this.terminated = true;
  }
}

function request(overrides: Partial<ConversionRequest> = {}): ConversionRequest {
  return {
    file: new File([new Uint8Array([1, 2, 3])], "kaynak.mp4", { type: "video/mp4" }),
    selection: { start: 12, length: 20, end: 32 },
    volume: 1.25,
    fadeIn: 0.4,
    fadeOut: 0.4,
    outputName: "kaynak-zil-sesi.m4a",
    ...overrides,
  };
}

describe("FfmpegTranscoder", () => {
  it("encodes the selected section as AAC with the requested audio treatment", async () => {
    const port = new FakeFfmpegPort();
    const transcoder = new FfmpegTranscoder(port);
    const progress: number[] = [];

    const result = await transcoder.convert(request(), (ratio) => progress.push(ratio));

    expect(port.commands).toHaveLength(1);
    expect(port.commands[0]).toEqual(
      expect.arrayContaining(["-ss", "12", "-t", "20", "-c:a", "aac", "-b:a", "192k"]),
    );
    expect(port.commands[0]).toEqual(
      expect.arrayContaining([
        "-af",
        "volume=1.25,afade=t=in:st=0:d=0.4,afade=t=out:st=19.6:d=0.4",
      ]),
    );
    expect(result.format).toBe("m4a");
    expect(result.fileName).toBe("kaynak-zil-sesi.m4a");
    expect(result.blob.type).toBe("audio/mp4");
    expect(progress).toContain(0.5);
    expect(port.deleted.some((path) => /^input-/.test(path))).toBe(true);
    expect(port.deleted.some((path) => /output-.*\.m4a$/.test(path))).toBe(true);
  });

  it("falls back to WAV without losing progress when AAC encoding fails", async () => {
    const port = new FakeFfmpegPort();
    port.failAac = true;
    const transcoder = new FfmpegTranscoder(port);
    const progress: number[] = [];

    const result = await transcoder.convert(request(), (ratio) => progress.push(ratio));

    expect(port.commands).toHaveLength(2);
    expect(port.commands[1]).toEqual(
      expect.arrayContaining(["-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2"]),
    );
    expect(result.format).toBe("wav");
    expect(result.fileName).toBe("kaynak-zil-sesi.wav");
    expect(result.blob.type).toBe("audio/wav");
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(port.deleted.some((path) => /output-.*\.m4a$/.test(path))).toBe(true);
    expect(port.deleted.some((path) => /output-.*\.wav$/.test(path))).toBe(true);
  });

  it("removes its progress listener after conversion and terminates on dispose", async () => {
    const port = new FakeFfmpegPort();
    const transcoder = new FfmpegTranscoder(port);

    await transcoder.convert(request(), () => undefined);
    expect(port.progressListener).toBeUndefined();

    transcoder.dispose();
    expect(port.terminated).toBe(true);
  });
});
