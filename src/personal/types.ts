export interface PersonalServerConfig {
  baseUrl: string;
  token: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
}

export type DownloadFormat = "mp3" | "mp4" | "ringtone-source";

export type PersonalApiErrorCode =
  | "UNAUTHORIZED"
  | "ORIGIN_NOT_ALLOWED"
  | "INVALID_YOUTUBE_URL"
  | "VIDEO_UNAVAILABLE"
  | "VIDEO_TOO_LONG"
  | "OUTPUT_TOO_LARGE"
  | "PERSONAL_SERVER_BUSY"
  | "TOOL_UPDATE_REQUIRED"
  | "CONVERSION_FAILED";

export class PersonalApiError extends Error {
  constructor(
    public readonly code: PersonalApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PersonalApiError";
  }
}
