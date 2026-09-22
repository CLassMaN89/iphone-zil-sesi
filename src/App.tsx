import { useRef, useState } from "react";
import { ConversionResult } from "./components/ConversionResult";
import { FilePicker } from "./components/FilePicker";
import { GarageBandGuide } from "./components/GarageBandGuide";
import { TrimControls } from "./components/TrimControls";
import { useObjectUrl } from "./hooks/useObjectUrl";
import { safeOutputName, validateMediaFile } from "./media/mediaFile";
import { normalizeSelection, type TrimSelection } from "./media/trimSelection";
import { createBrowserTranscoder } from "./transcoder/ffmpegTranscoder";
import type {
  ConversionResult as CompletedConversion,
  Transcoder,
} from "./transcoder/types";

type EditableState = {
  file: File;
  duration: number;
  selection: TrimSelection;
};

type WorkspaceState =
  | { name: "empty" }
  | { name: "loading-metadata"; file: File }
  | ({ name: "editing" } & EditableState)
  | ({ name: "converting"; progress: number } & EditableState)
  | ({ name: "complete"; result: CompletedConversion } & EditableState)
  | ({
      name: "error";
      message: string;
      recoverable: boolean;
    } & Partial<EditableState>);

export interface AppProps {
  createTranscoder?: () => Promise<Transcoder>;
}

function editableFrom(state: WorkspaceState): EditableState | undefined {
  if (
    (state.name === "editing" ||
      state.name === "converting" ||
      state.name === "complete" ||
      state.name === "error") &&
    state.file &&
    state.duration !== undefined &&
    state.selection
  ) {
    return {
      file: state.file,
      duration: state.duration,
      selection: state.selection,
    };
  }
}

export function App({ createTranscoder = createBrowserTranscoder }: AppProps) {
  const [state, setState] = useState<WorkspaceState>({ name: "empty" });
  const [volume, setVolume] = useState(1);
  const [fadeIn, setFadeIn] = useState(true);
  const [fadeOut, setFadeOut] = useState(true);
  const previewRef = useRef<HTMLMediaElement>(null);
  const file = "file" in state ? state.file : undefined;
  const previewUrl = useObjectUrl(file);
  const completedResult = state.name === "complete" ? state.result : undefined;
  const downloadUrl = useObjectUrl(completedResult?.blob);
  const editable = editableFrom(state);

  function chooseFile(nextFile: File) {
    const validation = validateMediaFile(nextFile);
    if (!validation.ok) {
      setState({
        name: "error",
        message: validation.message,
        recoverable: false,
      });
      return;
    }

    setState({ name: "loading-metadata", file: nextFile });
  }

  function metadataLoaded(event: React.SyntheticEvent<HTMLMediaElement>) {
    if (state.name !== "loading-metadata") return;
    const duration = event.currentTarget.duration;
    try {
      setState({
        name: "editing",
        file: state.file,
        duration,
        selection: normalizeSelection(duration, 0, 30),
      });
    } catch {
      setState({
        name: "error",
        message: "Dosyanın süresi okunamadı. Başka bir dosya seçin.",
        recoverable: false,
      });
    }
  }

  function mediaFailed() {
    setState({
      name: "error",
      message: "Dosya oynatılamadı. Başka bir MP3, M4A, WAV veya MP4 seçin.",
      recoverable: false,
    });
  }

  function updateSelection(start: number, length: number) {
    if (!editable) return;
    const selection = normalizeSelection(editable.duration, start, length);
    setState({ name: "editing", ...editable, selection });
  }

  function previewSelection() {
    if (!editable || !previewRef.current) return;
    previewRef.current.currentTime = editable.selection.start;
    void previewRef.current.play();
  }

  function stopAtSelectionEnd() {
    if (
      editable &&
      previewRef.current &&
      previewRef.current.currentTime >= editable.selection.end
    ) {
      previewRef.current.pause();
    }
  }

  async function convert() {
    if (!editable || editable.selection.tooShort) return;
    const source = editable;
    setState({ name: "converting", ...source, progress: 0 });
    let transcoder: Transcoder | undefined;

    try {
      transcoder = await createTranscoder();
      const result = await transcoder.convert(
        {
          file: source.file,
          selection: source.selection,
          volume,
          fadeIn: fadeIn ? 0.4 : 0,
          fadeOut: fadeOut ? 0.4 : 0,
          outputName: safeOutputName(source.file.name),
        },
        (progress) => {
          setState((current) =>
            current.name === "converting" ? { ...current, progress } : current,
          );
        },
      );
      setState({ name: "complete", ...source, result });
    } catch {
      setState({
        name: "error",
        ...source,
        message: "Dönüştürme tamamlanamadı. Tekrar deneyin; ayarlarınız korundu.",
        recoverable: true,
      });
    } finally {
      transcoder?.dispose();
    }
  }

  const isVideo = file?.name.toLowerCase().endsWith(".mp4");
  const isConverting = state.name === "converting";

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="sound-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="privacy-note">Dosyan cihazından çıkmaz</p>
        <h1>iPhone zil sesini kendin hazırla</h1>
        <p>Video veya sesinden en fazla 30 saniyeyi seç. Dosyayı indir, GarageBand ile zil sesi yap.</p>
      </header>

      <section className="workbench" aria-label="Zil sesi çalışma alanı">
        <FilePicker onFile={chooseFile} disabled={isConverting} />

        {state.name === "error" && (
          <p role="alert" className="error-message">{state.message}</p>
        )}

        {previewUrl && file && (
          isVideo ? (
            <video
              ref={previewRef as React.RefObject<HTMLVideoElement>}
              data-testid="media-preview"
              src={previewUrl}
              controls
              playsInline
              onLoadedMetadata={metadataLoaded}
              onError={mediaFailed}
              onTimeUpdate={stopAtSelectionEnd}
            />
          ) : (
            <audio
              ref={previewRef as React.RefObject<HTMLAudioElement>}
              data-testid="media-preview"
              src={previewUrl}
              controls
              onLoadedMetadata={metadataLoaded}
              onError={mediaFailed}
              onTimeUpdate={stopAtSelectionEnd}
            />
          )
        )}

        {editable && (
          <>
            <TrimControls
              duration={editable.duration}
              selection={editable.selection}
              volume={volume}
              fadeIn={fadeIn}
              fadeOut={fadeOut}
              disabled={isConverting}
              onStart={(start) => updateSelection(start, editable.selection.length)}
              onLength={(length) => updateSelection(editable.selection.start, length)}
              onVolume={setVolume}
              onFadeIn={setFadeIn}
              onFadeOut={setFadeOut}
              onPreview={previewSelection}
            />

            {editable.selection.tooShort && (
              <p className="error-message">Zil sesi için dosya en az 1 saniye olmalı.</p>
            )}

            {isConverting ? (
              <div aria-live="polite">
                <progress aria-label="Dönüştürme ilerlemesi" value={state.progress} max={1} />
                <p>Dönüştürülüyor: %{Math.round(state.progress * 100)}</p>
              </div>
            ) : state.name === "error" && state.recoverable ? (
              <button type="button" className="primary-action" onClick={convert}>Tekrar dene</button>
            ) : state.name !== "complete" ? (
              <button
                type="button"
                className="primary-action"
                disabled={Boolean(editable.selection.tooShort)}
                onClick={convert}
              >
                Zil sesini hazırla
              </button>
            ) : null}
          </>
        )}

        {state.name === "complete" && downloadUrl && (
          <>
            <ConversionResult
              result={state.result}
              downloadUrl={downloadUrl}
              onConvertAgain={convert}
            />
            <GarageBandGuide />
          </>
        )}
      </section>
    </main>
  );
}
