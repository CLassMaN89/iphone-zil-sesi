export interface VideoInfo {
  id: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
}

export type DownloadFormat = "mp3" | "mp4" | "ringtone-source";

export interface PreparedDownload {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  cleanup(): Promise<void>;
}

export interface MediaTool {
  inspect(url: string, signal?: AbortSignal): Promise<VideoInfo>;
  prepare(
    url: string,
    format: DownloadFormat,
    signal?: AbortSignal,
  ): Promise<PreparedDownload>;
  shutdown(): Promise<void>;
}
