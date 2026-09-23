import { describe, expect, it, vi } from "vitest";
import { createPersonalMediaClient } from "./personalMediaClient";
import { PersonalApiError } from "./types";

const config = {
  baseUrl: "https://quiet-space-8787.app.github.dev",
  token: "secret",
};

describe("personalMediaClient", () => {
  it("authenticates health and inspect requests", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            service: "iphone-ringtone-personal",
            version: 1,
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "abc",
            title: "Kısa video",
            durationSeconds: 90,
            thumbnailUrl: "https://i.ytimg.com/x.jpg",
          }),
        ),
      );

    const client = createPersonalMediaClient(config, fetcher);
    await expect(client.health()).resolves.toBe(true);
    await expect(client.inspect("https://youtu.be/abc")).resolves.toMatchObject({
      id: "abc",
      durationSeconds: 90,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `${config.baseUrl}/api/health`,
      expect.objectContaining({
        headers: { Authorization: "Bearer secret" },
      }),
    );
  });

  it("turns an API error envelope into PersonalApiError", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "VIDEO_TOO_LONG",
              message: "Video 20 dakikadan uzun.",
            },
          }),
          { status: 422 },
        ),
    );

    const client = createPersonalMediaClient(config, fetcher);
    await expect(client.inspect("https://youtu.be/abc")).rejects.toEqual(
      new PersonalApiError("VIDEO_TOO_LONG", "Video 20 dakikadan uzun."),
    );
  });

  it("returns a named File for every download format", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2]), {
          headers: {
            "content-type": "audio/mp4",
            "content-disposition": "attachment; filename=melodi.m4a",
          },
        }),
    );

    const file = await createPersonalMediaClient(config, fetcher).download(
      "https://youtu.be/abc",
      "ringtone-source",
    );
    expect(file).toEqual(
      expect.objectContaining({
        name: "melodi.m4a",
        type: "audio/mp4",
        size: 2,
      }),
    );
  });

  it("forwards cancellation signals to personal API requests", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: "abc",
      title: "Kısa video",
      durationSeconds: 90,
      thumbnailUrl: "",
    })));
    const controller = new AbortController();

    await createPersonalMediaClient(config, fetcher).inspect(
      "https://youtu.be/abc",
      controller.signal,
    );

    expect(fetcher).toHaveBeenCalledWith(
      `${config.baseUrl}/api/youtube/inspect`,
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
