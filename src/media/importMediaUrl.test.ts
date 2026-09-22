import { describe, expect, it, vi } from "vitest";
import { importMediaUrl } from "./importMediaUrl";

describe("importMediaUrl", () => {
  it("downloads an HTTPS media response as a validated File", async () => {
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": "3",
        },
      }),
    );

    const file = await importMediaUrl(
      "https://media.example.com/music/telefon-sesi.mp3?download=1",
      fetcher,
    );

    expect(file.name).toBe("telefon-sesi.mp3");
    expect(file.type).toBe("audio/mpeg");
    expect(file.size).toBe(3);
    expect(fetcher).toHaveBeenCalledWith(
      "https://media.example.com/music/telefon-sesi.mp3?download=1",
      { credentials: "omit", mode: "cors" },
    );
  });

  it("rejects non-HTTPS URLs before making a request", async () => {
    const fetcher = vi.fn();

    await expect(
      importMediaUrl("http://media.example.com/tone.mp3", fetcher),
    ).rejects.toThrow("Bağlantı https:// ile başlamalıdır.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a response whose declared size exceeds 200 MB", async () => {
    const fetcher = vi.fn(async () =>
      new Response(null, {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(200 * 1024 * 1024 + 1),
        },
      }),
    );

    await expect(
      importMediaUrl("https://media.example.com/huge.mp4", fetcher),
    ).rejects.toThrow("Bağlantıdaki dosya 200 MB sınırını aşıyor.");
  });

  it("rejects successful responses that are not supported media", async () => {
    const fetcher = vi.fn(async () =>
      new Response("<html>not media</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      importMediaUrl("https://media.example.com/page", fetcher),
    ).rejects.toThrow("Bağlantı doğrudan bir MP3, M4A, WAV veya MP4 dosyasına gitmeli.");
  });

  it("uses the response media type when the URL has a misleading extension", async () => {
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }),
    );

    const file = await importMediaUrl(
      "https://media.example.com/download/video.mp4",
      fetcher,
    );

    expect(file.name).toBe("video.mp3");
    expect(file.type).toBe("audio/mpeg");
  });

  it("explains browser access restrictions when the request fails", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      importMediaUrl("https://media.example.com/tone.mp3", fetcher),
    ).rejects.toThrow("Dosya indirilemedi. Bağlantı herkese açık olmalı ve tarayıcı erişimine izin vermelidir.");
  });
});
