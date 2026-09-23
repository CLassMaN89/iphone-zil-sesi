// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseYouTubeUrl } from "./youtubeUrl.js";

describe("parseYouTubeUrl", () => {
  function expectInvalid(url: string) {
    try {
      parseYouTubeUrl(url);
      throw new Error("Expected parseYouTubeUrl to reject the input");
    } catch (error) {
      expect(error).toMatchObject({
        code: "INVALID_YOUTUBE_URL",
        status: 400,
      });
    }
  }

  it.each([
    ["https://www.youtube.com/watch?v=cm_tiqyoJ9k", "cm_tiqyoJ9k"],
    ["https://youtu.be/cm_tiqyoJ9k", "cm_tiqyoJ9k"],
    ["https://www.youtube.com/shorts/cm_tiqyoJ9k", "cm_tiqyoJ9k"],
  ])("accepts one HTTPS video URL", (url, id) => {
    expect(parseYouTubeUrl(url)).toEqual({
      canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
      id,
    });
  });

  it.each([
    "http://youtu.be/abc123",
    "https://example.com/watch?v=abc123",
    "https://www.youtube.com/playlist?list=abc123",
    "https://www.youtube.com/watch?v=abc123&list=playlist",
  ])("rejects unsupported input %s", expectInvalid);
});
