import { useState } from "react";
import { useObjectUrl } from "../hooks/useObjectUrl";
import type { PersonalMediaClient } from "../personal/personalMediaClient";
import {
  PersonalApiError,
  type DownloadFormat,
  type PersonalApiErrorCode,
  type YouTubeVideo,
} from "../personal/types";

const PERSONAL_ERROR_MESSAGES: Record<PersonalApiErrorCode, string> = {
  UNAUTHORIZED:
    "Eşleştirme kodu geçersiz. Codespace terminalindeki yeni kodla tekrar bağlanın.",
  ORIGIN_NOT_ALLOWED:
    "Bu kişisel sunucu yalnızca uygulamanın resmi adresinden kullanılabilir.",
  INVALID_YOUTUBE_URL: "Tek bir geçerli YouTube video bağlantısı girin.",
  VIDEO_UNAVAILABLE: "Video herkese açık değil veya oturum gerektiriyor.",
  VIDEO_TOO_LONG: "Video 20 dakikadan uzun. Daha kısa bir video seçin.",
  OUTPUT_TOO_LARGE: "Hazırlanan dosya 200 MB sınırını aşıyor.",
  PERSONAL_SERVER_BUSY:
    "Kişisel sunucu başka bir dosya hazırlıyor. İlk işlem bitince tekrar deneyin.",
  TOOL_UPDATE_REQUIRED:
    "YouTube aracı güncel değil. Codespace'i yeniden oluşturun.",
  CONVERSION_FAILED: "Dosya hazırlanamadı. Başka bir video veya biçim deneyin.",
};

export function personalErrorMessage(error: unknown): string {
  if (error instanceof PersonalApiError) {
    return PERSONAL_ERROR_MESSAGES[error.code];
  }
  return "Kişisel sunucuya ulaşılamadı. Codespace'in açık olduğunu kontrol edin.";
}

interface DownloadedFile {
  file: File;
  format: "mp3" | "mp4";
}

type PanelState =
  | { status: "idle" }
  | { status: "inspecting" }
  | { status: "ready"; video: YouTubeVideo; downloaded?: DownloadedFile }
  | { status: "downloading"; video: YouTubeVideo; format: DownloadFormat }
  | { status: "error"; message: string; video?: YouTubeVideo };

export interface YouTubeImportPanelProps {
  client: PersonalMediaClient;
  onRingtoneSource(file: File): void;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function YouTubeImportPanel({
  client,
  onRingtoneSource,
}: YouTubeImportPanelProps) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const downloaded = state.status === "ready" ? state.downloaded : undefined;
  const downloadUrl = useObjectUrl(downloaded?.file);
  const video =
    state.status === "ready" || state.status === "downloading"
      ? state.video
      : state.status === "error"
        ? state.video
        : undefined;

  async function inspect() {
    setState({ status: "inspecting" });
    try {
      setState({ status: "ready", video: await client.inspect(url.trim()) });
    } catch (error) {
      setState({ status: "error", message: personalErrorMessage(error) });
    }
  }

  async function download(format: DownloadFormat) {
    if (!video) return;
    setState({ status: "downloading", video, format });
    try {
      const file = await client.download(url.trim(), format);
      if (format === "ringtone-source") {
        onRingtoneSource(file);
        setState({ status: "ready", video });
      } else {
        setState({ status: "ready", video, downloaded: { file, format } });
      }
    } catch (error) {
      setState({
        status: "error",
        message: personalErrorMessage(error),
        video,
      });
    }
  }

  const busy = state.status === "inspecting" || state.status === "downloading";

  return (
    <section className="youtube-panel glass-inset">
      <form
        className="youtube-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) void inspect();
        }}
      >
        <label htmlFor="youtube-url">YouTube video bağlantısı</label>
        <div className="url-picker-row">
          <input
            id="youtube-url"
            type="url"
            inputMode="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.currentTarget.value)}
          />
          <button type="submit" disabled={busy || !url.trim()}>
            {state.status === "inspecting" ? "Video aranıyor…" : "Videoyu bul"}
          </button>
        </div>
      </form>

      {state.status === "error" && (
        <p role="alert" className="error-message">
          {state.message}
        </p>
      )}

      {video && (
        <div className="youtube-result">
          {video.thumbnailUrl && (
            <img src={video.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
          )}
          <div className="youtube-details">
            <strong>{video.title}</strong>
            <span>{formatDuration(video.durationSeconds)}</span>
          </div>
          <div className="youtube-actions">
            <button type="button" disabled={busy} onClick={() => void download("mp3")}>
              MP3 indir
            </button>
            <button type="button" disabled={busy} onClick={() => void download("mp4")}>
              MP4 indir
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void download("ringtone-source")}
            >
              Zil sesi hazırla
            </button>
          </div>
          {state.status === "downloading" && (
            <p className="download-status" aria-live="polite">
              Dosya hazırlanıyor…
            </p>
          )}
          {downloaded && downloadUrl && (
            <a
              className="primary-action media-download"
              href={downloadUrl}
              download={downloaded.file.name}
            >
              {downloaded.format.toUpperCase()} dosyasını indir
            </a>
          )}
        </div>
      )}
    </section>
  );
}
