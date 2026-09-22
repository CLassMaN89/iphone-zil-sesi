import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPersonalServer,
  loadPersonalServer,
  savePersonalServer,
} from "./personalServerStorage";

describe("personalServerStorage", () => {
  beforeEach(() => localStorage.clear());

  it("normalizes and stores an HTTPS Codespaces endpoint", () => {
    savePersonalServer({
      baseUrl: " https://quiet-space-8787.app.github.dev/ ",
      token: "  secret-token  ",
    });
    expect(loadPersonalServer()).toEqual({
      baseUrl: "https://quiet-space-8787.app.github.dev",
      token: "secret-token",
    });
  });

  it.each([
    "http://quiet-space-8787.app.github.dev",
    "https://example.com",
    "https://user:pass@quiet-space-8787.app.github.dev",
    "https://quiet-space-8787.app.github.dev/api",
  ])("rejects an unsafe backend URL: %s", (baseUrl) => {
    expect(() => savePersonalServer({ baseUrl, token: "secret-token" })).toThrow(
      "Geçerli HTTPS Codespaces sunucu adresini girin.",
    );
  });

  it("does not store an empty pairing token", () => {
    expect(() =>
      savePersonalServer({
        baseUrl: "https://quiet-space-8787.app.github.dev",
        token: "   ",
      }),
    ).toThrow("Eşleştirme kodunu girin.");
  });

  it("removes the stored pairing", () => {
    savePersonalServer({
      baseUrl: "https://quiet-space-8787.app.github.dev",
      token: "secret-token",
    });
    clearPersonalServer();
    expect(loadPersonalServer()).toBeUndefined();
  });
});
