# iPhone Ringtone Maker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a mobile-first static web app that turns a user-owned local media file into a 1–30 second iPhone ringtone-ready audio download without uploading the file.

**Architecture:** A Vite/React/TypeScript single-page app keeps all media in the browser. Pure domain functions validate media and trim selections, while an `FfmpegTranscoder` adapter owns the WebAssembly runtime and emits progress; the React workspace coordinates selection, preview, conversion, download, and the GarageBand guide.

**Tech Stack:** React 19.3, TypeScript 7.0, Vite 8.3, Vitest 5, Testing Library 16, `@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/core` 0.12.10, `@ffmpeg/util` 0.12.2, Playwright 1.63, GitHub Actions, GitHub Pages

**Spec:** `docs/superpowers/specs/2026-09-22-iphone-ringtone-maker-design.md`

## Global Constraints

- Accept only MP3, M4A, WAV, and MP4 local files, up to 200 MB.
- Keep all user media in the browser; no upload API, analytics payload, or remote storage.
- Restrict selections to 1–30 seconds and never extend beyond the media duration.
- Produce AAC `.m4a` when supported and fall back to PCM WAV when AAC conversion fails.
- Support current iPhone Safari plus current desktop Chrome and Safari.
- Make the static build work below the `/iphone-zil-sesi/` GitHub Pages base path.
- Use Turkish user-facing copy and never claim that the website directly installs an iOS ringtone.
- Respect visible keyboard focus, WCAG AA color contrast, and reduced-motion preferences.

## Review Focus

- An MP4 reported as `application/octet-stream` should be accepted by its `.mp4` extension; a disguised `.exe` must be rejected.
- A media item shorter than 30 seconds should clamp the selection to its actual remaining duration.
- A selection starting near the end must remain at least one second or explain why the file cannot satisfy the selection.
- Repeated conversions must revoke old object URLs and must not retain temporary FFmpeg files.
- Failure to load the FFmpeg core or encode AAC must leave the selected file and controls intact, then offer retry or WAV fallback.

---

### Task 1: Project shell and media validation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/media/mediaFile.ts`
- Create: `src/media/mediaFile.test.ts`
- Create: `src/test/setup.ts`

**Interfaces:**
- Consumes: browser `File` objects.
- Produces: `validateMediaFile(file: Pick<File, "name" | "size" | "type">): MediaValidationResult`, `safeOutputName(name: string): string`, and `MAX_FILE_BYTES`.

- [ ] **Step 1: Add the runnable test harness and failing domain tests**

Create the Vite/React package scripts (`dev`, `build`, `test`, `test:run`, `e2e`) and configure Vitest with jsdom and `src/test/setup.ts`. Write tests covering valid MIME types, `.mp4` extension fallback for `application/octet-stream`, a disguised executable, the 200 MB boundary, empty files, and Turkish-safe output names:

```ts
expect(validateMediaFile(file("ses.mp3", 10, "audio/mpeg"))).toEqual({ ok: true });
expect(validateMediaFile(file("klip.mp4", 10, "application/octet-stream"))).toEqual({ ok: true });
expect(validateMediaFile(file("zararli.exe", 10, "audio/mpeg"))).toMatchObject({ ok: false });
expect(validateMediaFile(file("buyuk.wav", MAX_FILE_BYTES + 1, "audio/wav"))).toMatchObject({ reason: "too-large" });
expect(safeOutputName("Çağrı Müziği!!.mp3")).toBe("cagri-muzigi-zil-sesi.m4a");
```

- [ ] **Step 2: Install dependencies and verify RED**

Run:

```powershell
npm install react@19.3.0 react-dom@19.3.0 @ffmpeg/ffmpeg@0.12.15 @ffmpeg/core@0.12.10 @ffmpeg/util@0.12.2
npm install -D vite@8.3.0 typescript@7.0.2 @vitejs/plugin-react vitest@5.0.1 jsdom @testing-library/react@16.3.3 @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom
npm run test:run -- src/media/mediaFile.test.ts
```

Expected: FAIL because `src/media/mediaFile.ts` exports do not exist.

- [ ] **Step 3: Implement minimal media validation**

Implement discriminated results and extension/MIME agreement so an executable cannot pass only by claiming an audio MIME:

```ts
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export type MediaValidationResult =
  | { ok: true }
  | { ok: false; reason: "empty" | "too-large" | "unsupported"; message: string };

export function validateMediaFile(file: Pick<File, "name" | "size" | "type">): MediaValidationResult;
export function safeOutputName(name: string): string;
```

Allowed extensions are `mp3`, `m4a`, `wav`, and `mp4`; each non-empty MIME must also belong to the matching audio/video family except `application/octet-stream`.

- [ ] **Step 4: Verify GREEN and production build**

Run `npm run test:run -- src/media/mediaFile.test.ts` and `npm run build`.

Expected: all tests PASS and `dist/index.html` exists with `/iphone-zil-sesi/` asset paths.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src
git commit -m "feat: scaffold browser ringtone workspace"
```

### Task 2: Trim selection domain model

**Files:**
- Create: `src/media/trimSelection.ts`
- Create: `src/media/trimSelection.test.ts`

**Interfaces:**
- Consumes: `duration`, requested `start`, and requested `length`, all seconds.
- Produces: `normalizeSelection(duration: number, start: number, length: number): TrimSelection` and `formatClock(seconds: number): string`.

- [ ] **Step 1: Write failing selection tests**

```ts
expect(normalizeSelection(90, 12, 31)).toEqual({ start: 12, length: 30, end: 42 });
expect(normalizeSelection(12.4, 10, 10)).toEqual({ start: 10, length: 2.4, end: 12.4 });
expect(normalizeSelection(0.5, 0, 1)).toEqual({ start: 0, length: 0.5, end: 0.5, tooShort: true });
expect(normalizeSelection(60, -4, 0)).toEqual({ start: 0, length: 1, end: 1 });
expect(formatClock(65.25)).toBe("01:05.3");
```

- [ ] **Step 2: Verify RED**

Run `npm run test:run -- src/media/trimSelection.test.ts`.

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement clamping and formatting**

```ts
export interface TrimSelection {
  start: number;
  length: number;
  end: number;
  tooShort?: true;
}

export function normalizeSelection(duration: number, start: number, length: number): TrimSelection;
export function formatClock(seconds: number): string;
```

Round computed values to three decimal places, reject non-finite duration with `RangeError`, clamp start to `[0, duration]`, length to `[1, 30]`, then clamp length to remaining duration. Mark media shorter than one second with `tooShort: true`.

- [ ] **Step 4: Verify GREEN and full suite**

Run `npm run test:run`.

Expected: all domain tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/media/trimSelection.ts src/media/trimSelection.test.ts
git commit -m "feat: constrain ringtone trim selections"
```

### Task 3: Browser FFmpeg transcoder

**Files:**
- Create: `src/transcoder/types.ts`
- Create: `src/transcoder/ffmpegTranscoder.ts`
- Create: `src/transcoder/ffmpegTranscoder.test.ts`

**Interfaces:**
- Consumes: `ConversionRequest { file, selection, volume, fadeIn, fadeOut, outputName }`.
- Produces: `Transcoder { convert(request, onProgress): Promise<ConversionResult>; dispose(): void }`, with `ConversionResult { blob, fileName, format: "m4a" | "wav" }`.

- [ ] **Step 1: Write failing adapter tests against an injected FFmpeg port**

Define a small `FfmpegPort` interface in the test and assert observable commands and cleanup:

```ts
expect(port.exec).toHaveBeenCalledWith(expect.arrayContaining(["-ss", "12", "-t", "20"]));
expect(port.exec).toHaveBeenCalledWith(expect.arrayContaining(["-af", "volume=1.25,afade=t=in:st=0:d=0.4,afade=t=out:st=19.6:d=0.4"]));
expect(port.deleteFile).toHaveBeenCalledWith(expect.stringMatching(/^input-/));
expect(port.deleteFile).toHaveBeenCalledWith(expect.stringMatching(/output\.m4a$/));
```

Add a test in which AAC `exec` throws and WAV succeeds; expect `format: "wav"`, a `.wav` filename, preserved progress callbacks, and cleanup of both attempted outputs.

- [ ] **Step 2: Verify RED**

Run `npm run test:run -- src/transcoder/ffmpegTranscoder.test.ts`.

Expected: FAIL because the transcoder has not been implemented.

- [ ] **Step 3: Implement the injected adapter and real factory**

```ts
export interface Transcoder {
  convert(request: ConversionRequest, onProgress: (ratio: number) => void): Promise<ConversionResult>;
  dispose(): void;
}

export class FfmpegTranscoder implements Transcoder {
  constructor(private readonly port: FfmpegPort) {}
  convert(request: ConversionRequest, onProgress: (ratio: number) => void): Promise<ConversionResult>;
  dispose(): void;
}

export async function createBrowserTranscoder(): Promise<Transcoder>;
```

The real factory dynamically imports FFmpeg, attaches one progress listener, loads same-origin core assets from `public/ffmpeg`, writes a unique input name, attempts AAC-LC at 192 kbps, retries as 44.1 kHz stereo WAV when AAC fails, and deletes all temporary files in `finally`. `dispose()` terminates FFmpeg and removes the progress listener.

- [ ] **Step 4: Verify GREEN and full suite**

Run `npm run test:run`.

Expected: all tests PASS without console warnings.

- [ ] **Step 5: Commit**

```powershell
git add src/transcoder
git commit -m "feat: convert ringtone clips in the browser"
```

### Task 4: Mobile workspace flow

**Files:**
- Create: `src/App.tsx`
- Create: `src/App.test.tsx`
- Create: `src/components/FilePicker.tsx`
- Create: `src/components/TrimControls.tsx`
- Create: `src/components/ConversionResult.tsx`
- Create: `src/hooks/useObjectUrl.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: a `Transcoder` factory supplied through `AppProps.createTranscoder` for deterministic tests.
- Produces: the complete select → edit → convert → download state machine and revocation-safe object URLs.

- [ ] **Step 1: Write failing component tests for the full user flow**

Test with a real `File`, a stubbed media duration event, and a fake transcoder:

```tsx
render(<App createTranscoder={async () => fakeTranscoder} />);
await user.upload(screen.getByLabelText("Video veya ses dosyası seç"), validFile);
fireEvent.loadedMetadata(screen.getByTestId("media-preview"), { target: { duration: 45 } });
await user.clear(screen.getByLabelText("Başlangıç"));
await user.type(screen.getByLabelText("Başlangıç"), "20");
await user.click(screen.getByRole("button", { name: "Zil sesini hazırla" }));
expect(fakeTranscoder.convert).toHaveBeenCalledWith(expect.objectContaining({ selection: { start: 20, length: 25, end: 45 } }), expect.any(Function));
expect(await screen.findByRole("link", { name: "Ses dosyasını indir" })).toHaveAttribute("download");
```

Add tests for unsupported files, media under one second, conversion failure with controls preserved, retry, progress text, selection clamping, and revoking the previous download URL before a second conversion.

- [ ] **Step 2: Verify RED**

Run `npm run test:run -- src/App.test.tsx`.

Expected: FAIL because `App` and components are missing.

- [ ] **Step 3: Implement the explicit workspace states**

Use this state union rather than independent booleans:

```ts
type WorkspaceState =
  | { name: "empty" }
  | { name: "loading-metadata"; file: File; previewUrl: string }
  | { name: "editing"; file: File; previewUrl: string; duration: number; selection: TrimSelection }
  | { name: "converting"; file: File; previewUrl: string; duration: number; selection: TrimSelection; progress: number }
  | { name: "complete"; file: File; previewUrl: string; duration: number; selection: TrimSelection; result: ConversionResult; downloadUrl: string }
  | { name: "error"; file?: File; message: string; recoverable: boolean };
```

Keep the native audio/video preview mounted during editing, seek it to `selection.start` for “Seçimi dinle”, stop playback at `selection.end`, expose native number/range controls, and disable conversion for `tooShort` media.

- [ ] **Step 4: Verify GREEN and full suite**

Run `npm run test:run`.

Expected: all tests PASS and object URL spies show balanced create/revoke behavior.

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/App.test.tsx src/components src/hooks src/main.tsx
git commit -m "feat: add mobile ringtone creation flow"
```

### Task 5: Product styling and GarageBand guidance

**Files:**
- Create: `src/styles.css`
- Create: `src/components/GarageBandGuide.tsx`
- Create: `src/components/GarageBandGuide.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: completed conversion state.
- Produces: accessible Turkish installation guidance and the finalized responsive visual system.

- [ ] **Step 1: Write failing guide and accessibility tests**

```tsx
render(<GarageBandGuide />);
expect(screen.getAllByRole("listitem")).toHaveLength(5);
expect(screen.getByText(/GarageBand.*Zil Sesi/i)).toBeVisible();
expect(screen.getByRole("link", { name: /Apple'ın ayrıntılı rehberi/i })).toHaveAttribute("href", "https://support.apple.com/en-au/120692");
```

In `App.test.tsx`, assert a single `h1`, a labeled progress element, an `aria-live="polite"` status region, and Turkish error copy that names the corrective action.

- [ ] **Step 2: Verify RED**

Run `npm run test:run -- src/components/GarageBandGuide.test.tsx src/App.test.tsx`.

Expected: FAIL because the guide and accessibility hooks are absent.

- [ ] **Step 3: Implement guide and visual tokens**

Use CSS custom properties matching the spec, a single-column 720 px workbench, 44 px minimum touch targets, a selected amber timeline segment, prominent `:focus-visible`, and a no-animation reduced-motion block:

```css
:root { --paper:#f6f8fb; --ink:#17202a; --action:#176b87; --timeline:#f2b134; --success:#16825d; --danger:#b83a3a; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior:auto !important; transition-duration:0.01ms !important; } }
```

The five guide steps are: save to Files, open GarageBand Audio Recorder, import from Files, trim/align and share as “Zil Sesi”, then select standard ringtone or a contact.

- [ ] **Step 4: Verify GREEN, build, and inspect responsive output**

Run `npm run test:run` and `npm run build`, then open the dev server at 390×844 and 1440×900. Verify no horizontal overflow, legible labels, visible focus, and that the memorable element is the amber selected-time rail rather than decorative cards.

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx src/main.tsx src/styles.css src/components/GarageBandGuide.tsx src/components/GarageBandGuide.test.tsx
git commit -m "feat: finish mobile UI and GarageBand guide"
```

### Task 6: Real-browser verification, documentation, and GitHub Pages

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/ringtone-flow.spec.ts`
- Create: `e2e/fixtures/tone.wav`
- Create: `.github/workflows/pages.yml`
- Create: `.gitignore`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: production app, real FFmpeg assets, and a generated two-second WAV fixture.
- Produces: reproducible browser verification, CI deployment, and user/developer documentation.

- [ ] **Step 1: Add Playwright and write the failing end-to-end test**

Install `@playwright/test@1.63.0`, generate a tiny public-domain sine-wave WAV fixture, and test the deployed-base build:

```ts
test("creates a downloadable ringtone from a local WAV", async ({ page }) => {
  await page.goto("/iphone-zil-sesi/");
  await page.getByLabel("Video veya ses dosyası seç").setInputFiles("e2e/fixtures/tone.wav");
  await expect(page.getByRole("button", { name: "Zil sesini hazırla" })).toBeEnabled();
  await page.getByRole("button", { name: "Zil sesini hazırla" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Ses dosyasını indir" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/zil-sesi\.(m4a|wav)$/);
});
```

- [ ] **Step 2: Verify RED before copying FFmpeg assets**

Run `npm run build` followed by `npx playwright test`.

Expected: FAIL because same-origin FFmpeg core assets and/or the completed deployment configuration are not yet present.

- [ ] **Step 3: Add same-origin assets, deployment workflow, and README**

Add an npm `postinstall` script that copies `ffmpeg-core.js` and `ffmpeg-core.wasm` from the installed core package into `public/ffmpeg`. Configure Playwright `webServer` to run `npm run preview -- --host 127.0.0.1` and `baseURL` to include `/iphone-zil-sesi/`.

Create a Pages workflow triggered on `main` that runs `npm ci`, `npm run test:run`, `npm run build`, uploads `dist`, and deploys with `actions/deploy-pages`. Grant only `contents: read`, `pages: write`, and `id-token: write`.

README must document prerequisites, `npm ci`/`npm run dev`, supported formats and 200 MB limit, device-only processing, the GarageBand handoff, current limitations, test commands, and the live URL `https://classman89.github.io/iphone-zil-sesi/`.

- [ ] **Step 4: Verify the complete release candidate**

Run:

```powershell
npm ci
npm run test:run
npm run build
npx playwright install chromium
npx playwright test
```

Expected: unit/component suite PASS, production build PASS, Playwright PASS, and no unexpected console errors.

- [ ] **Step 5: Create and publish the GitHub repository**

Run:

```powershell
git add .github .gitignore README.md package.json package-lock.json playwright.config.ts e2e public
git commit -m "ci: publish verified app to GitHub Pages"
gh repo create CLassMaN89/iphone-zil-sesi --public --source . --remote origin --push
gh api -X POST repos/CLassMaN89/iphone-zil-sesi/pages -f build_type=workflow
gh run watch --exit-status
```

Expected: repository exists on GitHub, the Pages workflow succeeds, and the live URL returns HTTP 200.

- [ ] **Step 6: Perform the release smoke test**

Open `https://classman89.github.io/iphone-zil-sesi/` in a clean browser session, upload `e2e/fixtures/tone.wav`, create a clip, download it, and confirm the GarageBand guide remains visible. Record any iPhone-only limitation in README rather than hiding it.

- [ ] **Step 7: Commit any verified documentation correction**

```powershell
git add README.md
git diff --cached --quiet || git commit -m "docs: record release verification notes"
git push
```
