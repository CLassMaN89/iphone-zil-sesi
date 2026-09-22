import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, safeOutputName, validateMediaFile } from "./mediaFile";

function file(name: string, size: number, type: string) {
  return { name, size, type };
}

describe("validateMediaFile", () => {
  it.each([
    ["ses.mp3", "audio/mpeg"],
    ["ses.m4a", "audio/mp4"],
    ["ses.wav", "audio/wav"],
    ["klip.mp4", "video/mp4"],
  ])("accepts supported %s media", (name, type) => {
    expect(validateMediaFile(file(name, 10, type))).toEqual({ ok: true });
  });

  it("accepts an mp4 when iOS reports a generic MIME type", () => {
    expect(validateMediaFile(file("klip.mp4", 10, "application/octet-stream"))).toEqual({ ok: true });
  });

  it("rejects a disguised executable even when its MIME claims audio", () => {
    expect(validateMediaFile(file("zararli.exe", 10, "audio/mpeg"))).toMatchObject({
      ok: false,
      reason: "unsupported",
    });
  });

  it("rejects files larger than 200 MB", () => {
    expect(validateMediaFile(file("buyuk.wav", MAX_FILE_BYTES + 1, "audio/wav"))).toMatchObject({
      ok: false,
      reason: "too-large",
    });
  });

  it("accepts a file exactly at the size boundary", () => {
    expect(validateMediaFile(file("sinir.wav", MAX_FILE_BYTES, "audio/wav"))).toEqual({ ok: true });
  });

  it("rejects empty files", () => {
    expect(validateMediaFile(file("bos.mp3", 0, "audio/mpeg"))).toMatchObject({
      ok: false,
      reason: "empty",
    });
  });
});

describe("safeOutputName", () => {
  it("creates a Turkish-safe ringtone filename", () => {
    expect(safeOutputName("Çağrı Müziği!!.mp3")).toBe("cagri-muzigi-zil-sesi.m4a");
  });

  it("uses a useful fallback for punctuation-only names", () => {
    expect(safeOutputName("!!!.wav")).toBe("iphone-zil-sesi.m4a");
  });
});
