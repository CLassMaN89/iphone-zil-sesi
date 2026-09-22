import { useEffect, useState, type CSSProperties } from "react";
import { formatClock, type TrimSelection } from "../media/trimSelection";

const waveformBars = [
  22, 40, 28, 54, 36, 66, 44, 74, 34, 58, 82, 48, 70, 42, 62, 88,
  52, 76, 45, 68, 92, 58, 80, 50, 72, 42, 64, 38, 56, 32, 48, 28,
  42, 24, 36, 20, 32, 18, 28, 16, 24, 14, 20, 12, 18, 10, 16, 8,
];

interface TrimControlsProps {
  duration: number;
  selection: TrimSelection;
  volume: number;
  fadeIn: boolean;
  fadeOut: boolean;
  disabled?: boolean;
  onStart: (value: number) => void;
  onLength: (value: number) => void;
  onVolume: (value: number) => void;
  onFadeIn: (enabled: boolean) => void;
  onFadeOut: (enabled: boolean) => void;
  onPreview: () => void;
}

export function TrimControls({
  duration,
  selection,
  volume,
  fadeIn,
  fadeOut,
  disabled = false,
  onStart,
  onLength,
  onVolume,
  onFadeIn,
  onFadeOut,
  onPreview,
}: TrimControlsProps) {
  const [startDraft, setStartDraft] = useState(selection.start.toString());
  const [lengthDraft, setLengthDraft] = useState(selection.length.toString());
  const railStyle = {
    "--selection-start": `${(selection.start / Math.max(duration, 1)) * 100}%`,
    "--selection-width": `${(selection.length / Math.max(duration, 1)) * 100}%`,
  } as CSSProperties;

  useEffect(() => setStartDraft(selection.start.toString()), [selection.start]);
  useEffect(() => setLengthDraft(selection.length.toString()), [selection.length]);

  function commitDraft(
    draft: string,
    fallback: number,
    commit: (value: number) => void,
    reset: (value: string) => void,
  ) {
    const normalized = draft.trim().replace(",", ".");
    const parsed = normalized === "" ? Number.NaN : Number(normalized);
    if (Number.isFinite(parsed)) {
      commit(parsed);
    } else {
      reset(fallback.toString());
    }
  }

  return (
    <section aria-labelledby="trim-heading" className="trim-controls glass-inset">
      <div className="section-heading">
        <h2 id="trim-heading">Kullanacağın bölümü seç</h2>
        <output>{formatClock(selection.start)} – {formatClock(selection.end)}</output>
      </div>

      <div className="waveform-player">
        <button
          type="button"
          className="play-selection"
          onClick={onPreview}
          disabled={disabled}
          aria-label="Seçimi dinle"
        >
          <span aria-hidden="true">▶</span>
        </button>
        <div className="waveform" aria-hidden="true">
          {waveformBars.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className={index < 27 ? "is-selected" : undefined}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      <div className="timeline-rail" style={railStyle} aria-hidden="true">
        <span />
      </div>

      <div className="time-controls">
        <label>
          <span>Başlangıç</span>
          <input
            type="text"
            inputMode="decimal"
            data-time-input
            value={startDraft}
            disabled={disabled}
            onChange={(event) => setStartDraft(event.currentTarget.value)}
            onBlur={() => commitDraft(startDraft, selection.start, onStart, setStartDraft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>

        <label>
          <span>Süre</span>
          <input
            type="text"
            inputMode="decimal"
            data-time-input
            value={lengthDraft}
            disabled={disabled || Boolean(selection.tooShort)}
            onChange={(event) => setLengthDraft(event.currentTarget.value)}
            onBlur={() => commitDraft(lengthDraft, selection.length, onLength, setLengthDraft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
      </div>

      <label className="volume-control">
        <span>Ses seviyesi: %{Math.round(volume * 100)}</span>
        <input
          type="range"
          min="0.5"
          max="1.5"
          step="0.05"
          value={volume}
          disabled={disabled}
          onChange={(event) => onVolume(event.currentTarget.valueAsNumber)}
        />
      </label>

      <div className="toggle-row">
        <label>
          <input
            type="checkbox"
            checked={fadeIn}
            disabled={disabled}
            onChange={(event) => onFadeIn(event.currentTarget.checked)}
          />
          Yumuşak başlat
        </label>
        <label>
          <input
            type="checkbox"
            checked={fadeOut}
            disabled={disabled}
            onChange={(event) => onFadeOut(event.currentTarget.checked)}
          />
          Yumuşak bitir
        </label>
      </div>

    </section>
  );
}
