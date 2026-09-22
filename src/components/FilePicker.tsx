import { useState } from "react";

interface FilePickerProps {
  onFile: (file: File) => void;
  onUrl: (url: string) => Promise<void>;
  importingUrl?: boolean;
  disabled?: boolean;
}

type SourceMode = "video" | "audio" | "url";

const sourceOptions: Array<{ mode: SourceMode; label: string; icon: string }> = [
  { mode: "video", label: "Video yükle", icon: "▰" },
  { mode: "audio", label: "Ses yükle", icon: "♫" },
  { mode: "url", label: "Doğrudan bağlantı", icon: "↗" },
];

export function FilePicker({
  onFile,
  onUrl,
  importingUrl = false,
  disabled = false,
}: FilePickerProps) {
  const [mode, setMode] = useState<SourceMode>("video");
  const [url, setUrl] = useState("");
  const isVideo = mode === "video";
  const accept = isVideo
    ? ".mp4,video/mp4"
    : ".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav";

  return (
    <div className="source-picker">
      <div className="source-tabs" role="tablist" aria-label="Medya kaynağı">
        {sourceOptions.map((option) => (
          <button
            key={option.mode}
            type="button"
            role="tab"
            aria-selected={mode === option.mode}
            className={mode === option.mode ? "source-tab is-active" : "source-tab"}
            disabled={disabled}
            onClick={() => setMode(option.mode)}
          >
            <span aria-hidden="true">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </div>

      {mode === "url" ? (
        <form
          className="url-picker glass-inset"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim()) void onUrl(url);
          }}
        >
          <div className="link-orb" aria-hidden="true">↗</div>
          <label htmlFor="media-url">Doğrudan medya bağlantısı</label>
          <div className="url-picker-row">
            <input
              id="media-url"
              type="url"
              inputMode="url"
              placeholder="https://site.com/ses.mp3"
              value={url}
              disabled={disabled}
              onChange={(event) => setUrl(event.currentTarget.value)}
            />
            <button type="submit" disabled={disabled || !url.trim()}>
              {importingUrl ? "Dosya alınıyor…" : "Bağlantıdan getir"}
            </button>
          </div>
          <p>Herkese açık doğrudan MP3, M4A, WAV veya MP4 bağlantısı kullanın.</p>
        </form>
      ) : (
        <label
          className="file-drop-zone glass-inset"
          data-testid="file-drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file && !disabled) onFile(file);
          }}
        >
          <span className="upload-cloud" aria-hidden="true">
            <svg viewBox="0 0 96 72" role="presentation">
              <path d="M26 64h44c13 0 22-9 22-21 0-11-8-20-19-21C69 9 59 2 47 2 31 2 19 14 18 29 8 32 2 39 2 48c0 9 8 16 24 16Z" />
              <path className="upload-arrow" d="m48 50 0-28m0 0-11 11m11-11 11 11" />
            </svg>
          </span>
          <strong>{isVideo ? "Video dosyanı" : "Ses dosyanı"} buraya sürükle ve bırak</strong>
          <span className="drop-or">veya</span>
          <span className="choose-file-button">Dosya seç</span>
          <small>{isVideo ? "MP4 video" : "MP3, M4A veya WAV ses"} · En fazla 200 MB</small>
          <input
            className="file-input"
            aria-label="Video veya ses dosyası seç"
            type="file"
            accept={accept}
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onFile(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
