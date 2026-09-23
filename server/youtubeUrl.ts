import { ServerError } from "./errors.js";

const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
const INVALID_MESSAGE = "Geçerli bir YouTube video bağlantısı girin.";

function invalid(message = INVALID_MESSAGE): never {
  throw new ServerError(400, "INVALID_YOUTUBE_URL", message);
}

export function parseYouTubeUrl(raw: string): {
  canonicalUrl: string;
  id: string;
} {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    invalid();
  }

  if (url.protocol !== "https:" || url.searchParams.has("list")) {
    invalid("Yalnızca tek bir HTTPS YouTube videosu kullanabilirsiniz.");
  }

  const host = url.hostname.toLowerCase();
  let id = "";
  if (host === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (host === "youtube.com" || host === "www.youtube.com") {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v") ?? "";
    } else if (url.pathname.startsWith("/shorts/")) {
      id = url.pathname.split("/")[2] ?? "";
    }
  }

  if (!VIDEO_ID.test(id)) {
    invalid();
  }

  return {
    id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}
