import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type {
  ConversionRequest,
  ConversionResult,
  Transcoder,
} from "./transcoder/types";

class RecordingTranscoder implements Transcoder {
  requests: ConversionRequest[] = [];
  shouldFail = false;
  disposed = false;

  async convert(
    request: ConversionRequest,
    onProgress: (ratio: number) => void,
  ): Promise<ConversionResult> {
    this.requests.push(request);
    onProgress(0.42);
    if (this.shouldFail) {
      throw new Error("encoder stopped");
    }
    return {
      blob: new Blob([`ringtone-${this.requests.length}`], { type: "audio/mp4" }),
      fileName: request.outputName,
      format: "m4a",
    };
  }

  dispose(): void {
    this.disposed = true;
  }
}

let nextObjectUrl = 1;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  nextObjectUrl = 1;
  createObjectURL = vi.fn(() => `blob:test-${nextObjectUrl++}`);
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function validFile() {
  return new File([new Uint8Array([1, 2, 3])], "melodi.mp4", { type: "video/mp4" });
}

function loadMetadata(duration: number) {
  const preview = screen.getByTestId("media-preview");
  Object.defineProperty(preview, "duration", { configurable: true, value: duration });
  fireEvent.loadedMetadata(preview);
}

async function loadEditor(user: ReturnType<typeof userEvent.setup>, duration = 45) {
  await user.upload(screen.getByLabelText("Video veya ses dosyası seç"), validFile());
  loadMetadata(duration);
}

describe("App", () => {
  it("starts with one clear page heading", () => {
    render(<App createTranscoder={async () => new RecordingTranscoder()} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("creates a downloadable ringtone from the selected range", async () => {
    const user = userEvent.setup();
    const transcoder = new RecordingTranscoder();
    render(<App createTranscoder={async () => transcoder} />);

    await loadEditor(user);
    await user.clear(screen.getByLabelText("Başlangıç"));
    await user.type(screen.getByLabelText("Başlangıç"), "20");
    await user.click(screen.getByRole("button", { name: "Zil sesini hazırla" }));

    expect(transcoder.requests).toHaveLength(1);
    expect(transcoder.requests[0].selection).toEqual({ start: 20, length: 25, end: 45 });
    expect(await screen.findByRole("link", { name: "Ses dosyasını indir" })).toHaveAttribute(
      "download",
      "melodi-zil-sesi.m4a",
    );
    expect(transcoder.disposed).toBe(true);
  });

  it("explains how to correct an unsupported file", async () => {
    const user = userEvent.setup();
    render(<App createTranscoder={async () => new RecordingTranscoder()} />);

    await user.upload(
      screen.getByLabelText("Video veya ses dosyası seç"),
      new File(["nope"], "uygulama.exe", { type: "audio/mpeg" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("MP3, M4A, WAV veya MP4 seçin");
  });

  it("prevents converting media shorter than one second", async () => {
    const user = userEvent.setup();
    render(<App createTranscoder={async () => new RecordingTranscoder()} />);

    await loadEditor(user, 0.5);

    expect(screen.getByText(/en az 1 saniye/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Zil sesini hazırla" })).toBeDisabled();
  });

  it("explains how to recover when the browser cannot read selected media", async () => {
    const user = userEvent.setup();
    render(<App createTranscoder={async () => new RecordingTranscoder()} />);

    await user.upload(
      screen.getByLabelText("Video veya ses dosyası seç"),
      new File(["not audio"], "bozuk.mp3", { type: "audio/mpeg" }),
    );
    fireEvent.error(await screen.findByTestId("media-preview"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Dosya oynatılamadı. Başka bir MP3, M4A, WAV veya MP4 seçin.",
    );
  });

  it("preserves the editor after a failure and permits retry", async () => {
    const user = userEvent.setup();
    const first = new RecordingTranscoder();
    first.shouldFail = true;
    const second = new RecordingTranscoder();
    let attempt = 0;
    render(<App createTranscoder={async () => (attempt++ === 0 ? first : second)} />);

    await loadEditor(user);
    await user.click(screen.getByRole("button", { name: "Zil sesini hazırla" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tekrar deneyin");
    expect(screen.getByLabelText("Başlangıç")).toHaveValue("0");
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(await screen.findByRole("link", { name: "Ses dosyasını indir" })).toBeVisible();
    expect(second.requests).toHaveLength(1);
  });

  it("shows conversion progress while the converter is working", async () => {
    const user = userEvent.setup();
    let finish!: (value: ConversionResult) => void;
    const delayed: Transcoder = {
      convert: (_request, onProgress) => {
        onProgress(0.42);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      dispose: () => undefined,
    };
    render(<App createTranscoder={async () => delayed} />);

    await loadEditor(user);
    await user.click(screen.getByRole("button", { name: "Zil sesini hazırla" }));
    expect(await screen.findByText("Dönüştürülüyor: %42")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Dönüştürme ilerlemesi" })).toBeVisible();
    expect(screen.getByText("Dönüştürülüyor: %42").parentElement).toHaveAttribute(
      "aria-live",
      "polite",
    );

    finish({
      blob: new Blob(["done"], { type: "audio/mp4" }),
      fileName: "melodi-zil-sesi.m4a",
      format: "m4a",
    });
  });

  it("clamps a start near the end to a valid one-second selection", async () => {
    const user = userEvent.setup();
    const transcoder = new RecordingTranscoder();
    render(<App createTranscoder={async () => transcoder} />);

    await loadEditor(user, 45);
    await user.clear(screen.getByLabelText("Başlangıç"));
    await user.type(screen.getByLabelText("Başlangıç"), "45");
    await user.tab();

    expect(screen.getByLabelText("Başlangıç")).toHaveValue("44");
    expect(screen.getByLabelText("Süre")).toHaveValue("1");
  });

  it("revokes the previous download URL before exposing a replacement", async () => {
    const user = userEvent.setup();
    const first = new RecordingTranscoder();
    const second = new RecordingTranscoder();
    let attempt = 0;
    render(<App createTranscoder={async () => (attempt++ === 0 ? first : second)} />);

    await loadEditor(user);
    await user.click(screen.getByRole("button", { name: "Zil sesini hazırla" }));
    await screen.findByRole("link", { name: "Ses dosyasını indir" });
    await user.click(screen.getByRole("button", { name: "Zil sesini yeniden hazırla" }));
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:test-2"));
    expect(createObjectURL).toHaveBeenCalledTimes(3);
  });
});
