export interface TrimSelection {
  start: number;
  length: number;
  end: number;
  tooShort?: true;
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeSelection(
  duration: number,
  requestedStart: number,
  requestedLength: number,
): TrimSelection {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError("Medya süresi geçerli bir sayı olmalıdır.");
  }

  const roundedDuration = roundMilliseconds(duration);
  const tooShort = roundedDuration < 1;
  const latestValidStart = tooShort ? 0 : Math.max(0, roundedDuration - 1);
  const start = roundMilliseconds(
    Math.min(Math.max(finiteOr(requestedStart, 0), 0), latestValidStart),
  );
  const wantedLength = Math.min(
    Math.max(finiteOr(requestedLength, 1), 1),
    30,
  );
  const length = roundMilliseconds(
    Math.min(wantedLength, Math.max(0, roundedDuration - start)),
  );
  const selection: TrimSelection = {
    start,
    length,
    end: roundMilliseconds(start + length),
  };

  if (tooShort) {
    selection.tooShort = true;
  }

  return selection;
}

export function formatClock(seconds: number): string {
  const safeSeconds = Math.max(0, finiteOr(seconds, 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds - minutes * 60;
  return `${minutes.toString().padStart(2, "0")}:${remaining
    .toFixed(1)
    .padStart(4, "0")}`;
}
