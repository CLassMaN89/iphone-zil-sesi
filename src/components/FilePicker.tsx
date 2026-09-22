import { useState } from "react";

interface FilePickerProps {
  onFile: (file: File) => void;
  onUrl: (url: string) => Promise<void>;
  importingUrl?: boolean;
  disabled?: boolean;
}

export function FilePicker({
  onFile,
  onUrl,
  importingUrl = false,
  disabled = false,
}: FilePickerProps) {
  const [url, setUrl] = useState("");

  return (
    <div className="source-picker">
      <form
        className="url-picker"
        onSubmit={(event) => {
          event.preventDefault();
          if (url.trim()) void onUrl(url);
        }}
      >
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
        <p>Herkese açık, doğrudan MP3, M4A, WAV veya MP4 bağlantısı kullanın.</p>
      </form>

      <div className="source-divider" aria-hidden="true"><span>veya</span></div>

      <label className="file-picker">
        <span>Telefonundan video veya ses seç</span>
        <input
          aria-label="Video veya ses dosyası seç"
          type="file"
          accept=".mp3,.m4a,.wav,.mp4,audio/mpeg,audio/mp4,audio/wav,video/mp4"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onFile(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
    </div>
  );
}
