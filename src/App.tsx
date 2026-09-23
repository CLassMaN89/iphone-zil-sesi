import { useEffect, useMemo, useRef, useState } from "react";
import { ConversionResult } from "./components/ConversionResult";
import { FilePicker } from "./components/FilePicker";
import { GarageBandGuide } from "./components/GarageBandGuide";
import { TrimControls } from "./components/TrimControls";
import { useObjectUrl } from "./hooks/useObjectUrl";
import { importMediaUrl } from "./media/importMediaUrl";
import { safeOutputName, validateMediaFile } from "./media/mediaFile";
import { normalizeSelection, type TrimSelection } from "./media/trimSelection";
import {
  createPersonalMediaClient,
  type PersonalMediaClient,
} from "./personal/personalMediaClient";
import {
  clearPersonalServer,
  loadPersonalServer,
  savePersonalServer,
} from "./personal/personalServerStorage";
import type { PersonalServerConfig } from "./personal/types";
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
  importFromUrl?: (url: string) => Promise<File>;
  createPersonalClient?: (config: PersonalServerConfig) => PersonalMediaClient;
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

export function App({
  createTranscoder = createBrowserTranscoder,
  importFromUrl = importMediaUrl,
  createPersonalClient = createPersonalMediaClient,
}: AppProps) {
  const [state, setState] = useState<WorkspaceState>({ name: "empty" });
  const [importingUrl, setImportingUrl] = useState(false);
  const [personalConfig, setPersonalConfig] = useState<PersonalServerConfig | undefined>(
    () => loadPersonalServer(),
  );
  const [personalStatus, setPersonalStatus] = useState<
    "checking" | "connected" | "offline"
  >(personalConfig ? "checking" : "offline");
  const [volume, setVolume] = useState(1);
  const [fadeIn, setFadeIn] = useState(true);
  const [fadeOut, setFadeOut] = useState(true);
  const previewRef = useRef<HTMLMediaElement>(null);
  const file = "file" in state ? state.file : undefined;
  const previewUrl = useObjectUrl(file);
  const completedResult = state.name === "complete" ? state.result : undefined;
  const downloadUrl = useObjectUrl(completedResult?.blob);
  const editable = editableFrom(state);
  const personalClient = useMemo(
    () => (personalConfig ? createPersonalClient(personalConfig) : undefined),
    [createPersonalClient, personalConfig],
  );

  useEffect(() => {
    if (!personalClient) {
      setPersonalStatus("offline");
      return;
    }
    let current = true;
    setPersonalStatus("checking");
    void personalClient
      .health()
      .then((healthy) => {
        if (current) setPersonalStatus(healthy ? "connected" : "offline");
      })
      .catch(() => {
        if (current) setPersonalStatus("offline");
      });
    return () => {
      current = false;
    };
  }, [personalClient]);

  function savePersonal(config: PersonalServerConfig) {
    savePersonalServer(config);
    setPersonalConfig(loadPersonalServer());
  }

  function clearPersonal() {
    clearPersonalServer();
    setPersonalConfig(undefined);
    setPersonalStatus("offline");
  }

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

  async function chooseUrl(url: string) {
    setImportingUrl(true);
    setState({ name: "empty" });
    try {
      chooseFile(await importFromUrl(url));
    } catch (error) {
      setState({
        name: "error",
        message:
          error instanceof Error
            ? error.message
            : "Dosya indirilemedi. Bağlantıyı kontrol edip tekrar deneyin.",
        recoverable: false,
      });
    } finally {
      setImportingUrl(false);
    }
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
  const sourceBusy = isConverting || importingUrl;

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="sound-mark" aria-hidden="true"><span /><span /><span /><span /></div>
        <p className="privacy-note">Yerel dosyan cihazından çıkmaz</p>
        <h1>iPhone zil sesini kendin hazırla</h1>
        <p>Dosyadan veya doğrudan medya bağlantısından en fazla 30 saniyeyi seç. İndir, GarageBand ile zil sesi yap.</p>
      </header>

      <section className="workbench" aria-label="Zil sesi çalışma alanı">
        <FilePicker
          onFile={chooseFile}
          onDirectUrl={chooseUrl}
          personalConfig={personalConfig}
          personalStatus={personalStatus}
          personalClient={personalClient}
          onSavePersonal={savePersonal}
          onClearPersonal={clearPersonal}
          onPersonalConnectionLost={() => setPersonalStatus("offline")}
          importingUrl={importingUrl}
          disabled={sourceBusy}
        />

        {state.name === "error" && (
          <p role="alert" className="error-message">{state.message}</p>
        )}

        {previewUrl && file && (
          <div className="media-preview">
            <p>Seçilen medya: <strong>{file.name}</strong></p>
            {isVideo ? (
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
            )}
          </div>
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
