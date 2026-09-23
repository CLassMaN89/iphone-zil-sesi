import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalMediaClient } from "../personal/personalMediaClient";
import {
  PersonalApiError,
  type PersonalApiErrorCode,
} from "../personal/types";
import {
  personalErrorMessage,
  YouTubeImportPanel,
} from "./YouTubeImportPanel";

const video = {
  id: "abc123",
  title: "Kısa video",
  durationSeconds: 90,
  thumbnailUrl: "https://i.ytimg.com/x.jpg",
};

function fakeClient(): PersonalMediaClient {
  return {
    health: vi.fn(async () => true),
    inspect: vi.fn(async () => video),
    download: vi.fn(async (_url, format) => {
      const details =
        format === "mp3"
          ? ["kisa-video.mp3", "audio/mpeg"]
          : format === "mp4"
            ? ["kisa-video.mp4", "video/mp4"]
            : ["kisa-video.m4a", "audio/mp4"];
      return new File([new Uint8Array([1, 2])], details[0], { type: details[1] });
    }),
  };
}

beforeEach(() => {
  let next = 1;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => `blob:youtube-${next++}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => vi.restoreAllMocks());

describe("YouTubeImportPanel", () => {
  it("inspects a video and transfers its ringtone source to the editor", async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    const onRingtoneSource = vi.fn();
    render(
      <YouTubeImportPanel
        client={client}
        onRingtoneSource={onRingtoneSource}
      />,
    );

    await user.type(
      screen.getByLabelText("YouTube video bağlantısı"),
      "https://youtu.be/abc123",
    );
    await user.click(screen.getByRole("button", { name: "Videoyu bul" }));
    expect(await screen.findByText("Kısa video")).toBeVisible();
    expect(screen.getByText("01:30")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Zil sesi hazırla" }));
    expect(onRingtoneSource).toHaveBeenCalledWith(
      expect.objectContaining({ name: "kisa-video.m4a" }),
    );
  });

  it("exposes named MP3 and MP4 downloads and revokes replacements", async () => {
    const user = userEvent.setup();
    render(
      <YouTubeImportPanel client={fakeClient()} onRingtoneSource={vi.fn()} />,
    );
    await user.type(
      screen.getByLabelText("YouTube video bağlantısı"),
      "https://youtu.be/abc123",
    );
    await user.click(screen.getByRole("button", { name: "Videoyu bul" }));

    await user.click(screen.getByRole("button", { name: "MP3 indir" }));
    expect(
      await screen.findByRole("link", { name: "MP3 dosyasını indir" }),
    ).toHaveAttribute("download", "kisa-video.mp3");
    await user.click(screen.getByRole("button", { name: "MP4 indir" }));
    expect(
      await screen.findByRole("link", { name: "MP4 dosyasını indir" }),
    ).toHaveAttribute("download", "kisa-video.mp4");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:youtube-1");
  });

  it("shows an actionable busy message instead of the server text", async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    client.inspect = vi.fn(async () => {
      throw new PersonalApiError("PERSONAL_SERVER_BUSY", "raw server detail");
    });
    render(<YouTubeImportPanel client={client} onRingtoneSource={vi.fn()} />);

    await user.type(
      screen.getByLabelText("YouTube video bağlantısı"),
      "https://youtu.be/abc123",
    );
    await user.click(screen.getByRole("button", { name: "Videoyu bul" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Kişisel sunucu başka bir dosya hazırlıyor. İlk işlem bitince tekrar deneyin.",
    );
    expect(screen.queryByText("raw server detail")).not.toBeInTheDocument();
  });

  it("reports an expired pairing after a later unauthorized request", async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    const onConnectionLost = vi.fn();
    client.inspect = vi.fn(async () => {
      throw new PersonalApiError("UNAUTHORIZED", "expired");
    });
    render(
      <YouTubeImportPanel
        client={client}
        onRingtoneSource={vi.fn()}
        onConnectionLost={onConnectionLost}
      />,
    );

    await user.type(
      screen.getByLabelText("YouTube video bağlantısı"),
      "https://youtu.be/abc123",
    );
    await user.click(screen.getByRole("button", { name: "Videoyu bul" }));

    expect(onConnectionLost).toHaveBeenCalledOnce();
  });

  it("does not replace the editor after a pending import is unmounted", async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    let finishDownload!: (file: File) => void;
    client.download = vi.fn(
      () =>
        new Promise<File>((resolve) => {
          finishDownload = resolve;
        }),
    );
    const onRingtoneSource = vi.fn();
    const view = render(
      <YouTubeImportPanel client={client} onRingtoneSource={onRingtoneSource} />,
    );
    await user.type(
      screen.getByLabelText("YouTube video bağlantısı"),
      "https://youtu.be/abc123",
    );
    await user.click(screen.getByRole("button", { name: "Videoyu bul" }));
    await user.click(await screen.findByRole("button", { name: "Zil sesi hazırla" }));

    view.unmount();
    finishDownload(new File(["late"], "late.m4a", { type: "audio/mp4" }));
    await waitFor(() => expect(client.download).toHaveBeenCalledOnce());
    expect(onRingtoneSource).not.toHaveBeenCalled();
  });

  it("clears inspected actions when the YouTube URL changes", async () => {
    const user = userEvent.setup();
    const client = fakeClient();
    render(<YouTubeImportPanel client={client} onRingtoneSource={vi.fn()} />);
    const input = screen.getByLabelText("YouTube video bağlantısı");
    await user.type(input, "https://youtu.be/abc123");
    await user.click(screen.getByRole("button", { name: "Videoyu bul" }));
    expect(await screen.findByText("Kısa video")).toBeVisible();

    await user.clear(input);
    await user.type(input, "https://youtu.be/different");

    expect(screen.queryByText("Kısa video")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "MP3 indir" })).not.toBeInTheDocument();
  });

  it("disables YouTube controls while the workspace is busy", () => {
    render(
      <YouTubeImportPanel
        client={fakeClient()}
        onRingtoneSource={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText("YouTube video bağlantısı")).toBeDisabled();
  });
});

describe("personalErrorMessage", () => {
  it.each<[PersonalApiErrorCode, string]>([
    ["UNAUTHORIZED", "Eşleştirme kodu geçersiz. Codespace terminalindeki yeni kodla tekrar bağlanın."],
    ["ORIGIN_NOT_ALLOWED", "Bu kişisel sunucu yalnızca uygulamanın resmi adresinden kullanılabilir."],
    ["INVALID_YOUTUBE_URL", "Tek bir geçerli YouTube video bağlantısı girin."],
    ["VIDEO_UNAVAILABLE", "Video herkese açık değil veya oturum gerektiriyor."],
    ["VIDEO_TOO_LONG", "Video 20 dakikadan uzun. Daha kısa bir video seçin."],
    ["OUTPUT_TOO_LARGE", "Hazırlanan dosya 200 MB sınırını aşıyor."],
    ["PERSONAL_SERVER_BUSY", "Kişisel sunucu başka bir dosya hazırlıyor. İlk işlem bitince tekrar deneyin."],
    ["TOOL_UPDATE_REQUIRED", "YouTube aracı güncel değil. Codespace'i yeniden oluşturun."],
    ["CONVERSION_FAILED", "Dosya hazırlanamadı. Başka bir video veya biçim deneyin."],
  ])("maps %s without leaking the API message", (code, expected) => {
    expect(personalErrorMessage(new PersonalApiError(code, "raw stderr"))).toBe(
      expected,
    );
  });
});
