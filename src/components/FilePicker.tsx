interface FilePickerProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function FilePicker({ onFile, disabled = false }: FilePickerProps) {
  return (
    <label className="file-picker">
      <span>Video veya ses dosyası seç</span>
      <input
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
  );
}
