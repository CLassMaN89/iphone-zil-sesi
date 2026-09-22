import { MAX_FILE_BYTES, validateMediaFile } from "./mediaFile";

type MediaFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const extensionByMime: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "video/mp4": "mp4",
};

class MediaUrlError extends Error {}

function fileNameFrom(url: URL, mimeType: string): string {
  const pathName = decodeURIComponent(url.pathname.split("/").pop() || "medya");
  const safeName = pathName.replace(/[\\/:*?"<>|]/g, "-") || "medya";
  const expectedExtension = extensionByMime[mimeType];

  if (validateMediaFile({ name: safeName, size: 1, type: mimeType }).ok) {
    return safeName;
  }

  return `${safeName.replace(/\.[^.]+$/, "") || "medya"}.${expectedExtension}`;
}

export async function importMediaUrl(
  rawUrl: string,
  fetcher: MediaFetcher = fetch,
): Promise<File> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new MediaUrlError("Geçerli bir bağlantı girin.");
  }

  if (url.protocol !== "https:") {
    throw new MediaUrlError("Bağlantı https:// ile başlamalıdır.");
  }

  if (
    url.hostname === "youtu.be" ||
    url.hostname === "youtube.com" ||
    url.hostname.endsWith(".youtube.com")
  ) {
    throw new MediaUrlError(
      "YouTube bağlantıları indirilemez. Videoyu YouTube Studio’dan indirip dosya olarak yükleyin.",
    );
  }

  try {
    const response = await fetcher(url.href, {
      credentials: "omit",
      mode: "cors",
    });

    if (!response.ok) {
      throw new MediaUrlError(
        `Dosya indirilemedi (HTTP ${response.status}). Bağlantıyı kontrol edin.`,
      );
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_FILE_BYTES) {
      throw new MediaUrlError("Bağlantıdaki dosya 200 MB sınırını aşıyor.");
    }

    const mimeType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (!extensionByMime[mimeType]) {
      throw new MediaUrlError(
        "Bağlantı doğrudan bir MP3, M4A, WAV veya MP4 dosyasına gitmeli.",
      );
    }

    const blob = await response.blob();
    const file = new File([blob], fileNameFrom(url, mimeType), { type: mimeType });
    const validation = validateMediaFile(file);
    if (!validation.ok) {
      if (validation.reason === "too-large") {
        throw new MediaUrlError("Bağlantıdaki dosya 200 MB sınırını aşıyor.");
      }
      throw new MediaUrlError(validation.message);
    }

    return file;
  } catch (error) {
    if (error instanceof MediaUrlError) throw error;
    throw new MediaUrlError(
      "Dosya indirilemedi. Bağlantı herkese açık olmalı ve tarayıcı erişimine izin vermelidir.",
    );
  }
}
