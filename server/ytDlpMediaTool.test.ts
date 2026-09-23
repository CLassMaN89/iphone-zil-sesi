// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createYtDlpMediaTool } from "./ytDlpMediaTool.js";

const metadata = JSON.stringify({
  id: "abc123",
  title: "Kısa Şarkı",
  duration: 90,
  thumbnail: "https://i.ytimg.com/x.jpg",
  is_live: false,
});

function fakeFiles(size = 2) {
  return {
    mkdtemp: vi.fn(async () => "/tmp/job"),
    readdir: vi.fn(async () => ["output.mp3"]),
    stat: vi.fn(async () => ({ size })),
    rm: vi.fn(async () => undefined),
  };
}

describe("ytDlpMediaTool", () => {
  it("inspects without downloading and enforces one video", async () => {
    const run = vi.fn(async () => ({ stdout: metadata, stderr: "" }));
    const tool = createYtDlpMediaTool({ run });

    await expect(
      tool.inspect("https://www.youtube.com/watch?v=abc123"),
    ).resolves.toMatchObject({ id: "abc123", durationSeconds: 90 });
    expect(run).toHaveBeenCalledWith(
      "yt-dlp",
      expect.arrayContaining([
        "--dump-single-json",
        "--skip-download",
        "--no-playlist",
      ]),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects live and over-twenty-minute videos", async () => {
    const live = createYtDlpMediaTool({
      run: vi.fn(async () => ({
        stdout: JSON.stringify({
          id: "abc123",
          title: "Canlı",
          duration: 10,
          is_live: true,
        }),
        stderr: "",
      })),
    });
    await expect(live.inspect("https://youtu.be/abc123")).rejects.toMatchObject({
      code: "VIDEO_UNAVAILABLE",
    });

    const long = createYtDlpMediaTool({
      run: vi.fn(async () => ({
        stdout: JSON.stringify({
          id: "abc123",
          title: "Uzun",
          duration: 1201,
          is_live: false,
        }),
        stderr: "",
      })),
    });
    await expect(long.inspect("https://youtu.be/abc123")).rejects.toMatchObject({
      code: "VIDEO_TOO_LONG",
    });
  });

  it("uses literal MP3, MP4, and ringtone arguments", () => {
    const tool = createYtDlpMediaTool({ run: vi.fn() });

    expect(
      tool.argumentsFor(
        "mp3",
        "/tmp/job/output",
        "https://www.youtube.com/watch?v=abc123",
      ),
    ).toEqual([
      "--no-playlist",
      "--max-filesize",
      "200M",
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "192K",
      "-o",
      "/tmp/job/output.%(ext)s",
      "https://www.youtube.com/watch?v=abc123",
    ]);
    expect(
      tool.argumentsFor(
        "mp4",
        "/tmp/job/output",
        "https://www.youtube.com/watch?v=abc123",
      ),
    ).toContain(
      "bv*[height<=720][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=720][vcodec^=avc1][acodec^=mp4a]",
    );
    expect(
      tool.argumentsFor(
        "ringtone-source",
        "/tmp/job/output",
        "https://www.youtube.com/watch?v=abc123",
      ),
    ).toContain("m4a");
  });

  it("sanitizes a hostile title into a safe attachment name", () => {
    const tool = createYtDlpMediaTool({ run: vi.fn() });
    expect(tool.safeName("../../Şarkı\r\nX-Evil: yes", "mp3")).toBe(
      "sarki-x-evil-yes.mp3",
    );
  });

  it("prepares a named file and removes its job directory once", async () => {
    const files = fakeFiles();
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: metadata, stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const tool = createYtDlpMediaTool({ run, files });

    const prepared = await tool.prepare("https://youtu.be/abc123", "mp3");
    expect(prepared).toMatchObject({
      path: "/tmp/job/output.mp3",
      fileName: "kisa-sarki.mp3",
      mimeType: "audio/mpeg",
      size: 2,
    });

    await prepared.cleanup();
    await prepared.cleanup();
    expect(files.rm).toHaveBeenCalledTimes(1);
  });

  it("removes oversized and failed jobs before returning an error", async () => {
    const oversizedFiles = fakeFiles(200 * 1024 * 1024 + 1);
    const oversizedRun = vi
      .fn()
      .mockResolvedValueOnce({ stdout: metadata, stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });
    const oversized = createYtDlpMediaTool({
      run: oversizedRun,
      files: oversizedFiles,
    });
    await expect(
      oversized.prepare("https://youtu.be/abc123", "mp3"),
    ).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
    expect(oversizedFiles.rm).toHaveBeenCalledTimes(1);

    const failedFiles = fakeFiles();
    const failedRun = vi
      .fn()
      .mockResolvedValueOnce({ stdout: metadata, stderr: "" })
      .mockRejectedValueOnce(new Error("yt-dlp exited 1"));
    const failed = createYtDlpMediaTool({ run: failedRun, files: failedFiles });
    await expect(
      failed.prepare("https://youtu.be/abc123", "mp3"),
    ).rejects.toMatchObject({ code: "CONVERSION_FAILED" });
    expect(failedFiles.rm).toHaveBeenCalledTimes(1);
  });

  it("aborts active work and cleans its directory during shutdown", async () => {
    const files = fakeFiles();
    let downloadStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      downloadStarted = resolve;
    });
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: metadata, stderr: "" })
      .mockImplementationOnce(
        async (
          _command: string,
          _args: readonly string[],
          options: { signal: AbortSignal },
        ) => {
          downloadStarted();
          await new Promise<void>((_resolve, reject) => {
            options.signal.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          });
          return { stdout: "", stderr: "" };
        },
      );
    const tool = createYtDlpMediaTool({ run, files });

    const preparation = tool.prepare("https://youtu.be/abc123", "mp3");
    await started;
    await tool.shutdown();

    await expect(preparation).rejects.toMatchObject({ code: "CONVERSION_FAILED" });
    expect(files.rm).toHaveBeenCalledTimes(1);
  });
});
