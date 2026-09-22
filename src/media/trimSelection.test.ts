import { describe, expect, it } from "vitest";
import { formatClock, normalizeSelection } from "./trimSelection";

describe("normalizeSelection", () => {
  it("caps a ringtone at 30 seconds", () => {
    expect(normalizeSelection(90, 12, 31)).toEqual({ start: 12, length: 30, end: 42 });
  });

  it("clamps the selection to the media remaining after its start", () => {
    expect(normalizeSelection(12.4, 10, 10)).toEqual({ start: 10, length: 2.4, end: 12.4 });
  });

  it("marks media shorter than one second as too short", () => {
    expect(normalizeSelection(0.5, 0, 1)).toEqual({
      start: 0,
      length: 0.5,
      end: 0.5,
      tooShort: true,
    });
  });

  it("clamps negative starts and zero lengths", () => {
    expect(normalizeSelection(60, -4, 0)).toEqual({ start: 0, length: 1, end: 1 });
  });

  it("keeps a one-second selection when the start is requested at the end", () => {
    expect(normalizeSelection(60, 60, 10)).toEqual({ start: 59, length: 1, end: 60 });
  });

  it("rejects a duration that cannot be placed on a timeline", () => {
    expect(() => normalizeSelection(Number.NaN, 0, 10)).toThrow(RangeError);
    expect(() => normalizeSelection(Number.POSITIVE_INFINITY, 0, 10)).toThrow(RangeError);
  });

  it("rounds floating point results to milliseconds", () => {
    expect(normalizeSelection(20, 1.12345, 2.34567)).toEqual({
      start: 1.123,
      length: 2.346,
      end: 3.469,
    });
  });
});

describe("formatClock", () => {
  it("formats minutes, seconds and tenths for the editor", () => {
    expect(formatClock(65.25)).toBe("01:05.3");
  });

  it("does not display negative time", () => {
    expect(formatClock(-3)).toBe("00:00.0");
  });
});
