export const MAX_FILE_BYTES = 200 * 1024 * 1024;

export type MediaValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "empty" | "too-large" | "unsupported";
      message: string;
    };

const allowedMimeTypes: Record<string, readonly string[]> = {
  mp3: ["audio/mpeg", "audio/mp3"],
  m4a: ["audio/mp4", "audio/x-m4a", "audio/m4a"],
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  mp4: ["video/mp4", "audio/mp4"],
};

function extensionOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

export function validateMediaFile(
  file: Pick<File, "name" | "size" | "type">,
): MediaValidationResult {
  if (file.size <= 0) {
    return {
      ok: false,
      reason: "empty",
      message: "Bu dosya boş görünüyor. Başka bir video veya ses dosyası seçin.",
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: "too-large",
      message: "Dosya 200 MB sınırını aşıyor. Daha kısa veya daha küçük bir dosya seçin.",
    };
  }

  const extension = extensionOf(file.name);
  const acceptedMimes = allowedMimeTypes[extension];
  const genericMime = file.type === "" || file.type === "application/octet-stream";

  if (!acceptedMimes || (!genericMime && !acceptedMimes.includes(file.type.toLowerCase()))) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Bu dosya desteklenmiyor. MP3, M4A, WAV veya MP4 seçin.",
    };
  }

  return { ok: true };
}

const turkishCharacters: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

export function safeOutputName(name: string): string {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  const normalized = withoutExtension
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (character) => turkishCharacters[character])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "iphone"}-zil-sesi.m4a`;
}
