import { useEffect, useRef, useState } from "react";
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
  | { status: "ready"; video: YouTubeVideo; sourceUrl: string; downloaded?: DownloadedFile }
  | { status: "downloading"; video: YouTubeVideo; sourceUrl: string; format: DownloadFormat }
  | { status: "error"; message: string; video?: YouTubeVideo; sourceUrl?: string };

export interface YouTubeImportPanelProps {
  client: PersonalMediaClient;
  onRingtoneSource(file: File): void;
  onConnectionLost?(): void;
  disabled?: boolean;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function YouTubeImportPanel({
  client,
  onRingtoneSource,
  onConnectionLost,
  disabled = false,
}: YouTubeImportPanelProps) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const operationRef = useRef<AbortController | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    operationRef.current?.abort();
  }, []);

  function beginOperation() {
    operationRef.current?.abort();
    const controller = new AbortController();
    operationRef.current = controller;
    return controller;
  }

  function isCurrent(controller: AbortController) {
    return mountedRef.current &&
      operationRef.current === controller &&
      !controller.signal.aborted;
  }

  function isAbort(error: unknown) {
    return error instanceof DOMException && error.name === "AbortError";
  }
  const downloaded = state.status === "ready" ? state.downloaded : undefined;
  const downloadUrl = useObjectUrl(downloaded?.file);
  const video =
    state.status === "ready" || state.status === "downloading"
      ? state.video
      : state.status === "error"
        ? state.video
        : undefined;
  const sourceUrl =
    state.status === "ready" || state.status === "downloading"
      ? state.sourceUrl
      : state.status === "error"
        ? state.sourceUrl
        : undefined;

  async function inspect() {
    const requestedUrl = url.trim();
    const controller = beginOperation();
    setState({ status: "inspecting" });
    try {
      const inspected = await client.inspect(requestedUrl, controller.signal);
      if (!isCurrent(controller)) return;
      setState({ status: "ready", video: inspected, sourceUrl: requestedUrl });
    } catch (error) {
      if (!isCurrent(controller) || isAbort(error)) return;
      if (!(error instanceof PersonalApiError) || error.code === "UNAUTHORIZED") {
        onConnectionLost?.();
      }
      setState({ status: "error", message: personalErrorMessage(error) });
    }
  }

  async function download(format: DownloadFormat) {
    if (!video || !sourceUrl) return;
    const controller = beginOperation();
    setState({ status: "downloading", video, sourceUrl, format });
    try {
      const file = await client.download(sourceUrl, format, controller.signal);
      if (!isCurrent(controller)) return;
      if (format === "ringtone-source") {
        onRingtoneSource(file);
        if (isCurrent(controller)) setState({ status: "ready", video, sourceUrl });
      } else {
        setState({ status: "ready", video, sourceUrl, downloaded: { file, format } });
      }
    } catch (error) {
      if (!isCurrent(controller) || isAbort(error)) return;
      if (!(error instanceof PersonalApiError) || error.code === "UNAUTHORIZED") {
        onConnectionLost?.();
      }
      setState({
        status: "error",
        message: personalErrorMessage(error),
        video,
        sourceUrl,
      });
    }
  }

  const busy = state.status === "inspecting" || state.status === "downloading";
  const controlsDisabled = busy || disabled;

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
            disabled={controlsDisabled}
            onChange={(event) => {
              operationRef.current?.abort();
              setUrl(event.currentTarget.value);
              setState({ status: "idle" });
            }}
          />
          <button type="submit" disabled={controlsDisabled || !url.trim()}>
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
            <button type="button" disabled={controlsDisabled} onClick={() => void download("mp3")}>
              MP3 indir
            </button>
            <button type="button" disabled={controlsDisabled} onClick={() => void download("mp4")}>
              MP4 indir
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
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
