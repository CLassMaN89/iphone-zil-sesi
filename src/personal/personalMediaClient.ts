import {
  PersonalApiError,
  type DownloadFormat,
  type PersonalApiErrorCode,
  type PersonalServerConfig,
  type YouTubeVideo,
} from "./types";

type Fetcher = typeof fetch;

export interface PersonalMediaClient {
  health(): Promise<boolean>;
  inspect(url: string): Promise<YouTubeVideo>;
  download(url: string, format: DownloadFormat): Promise<File>;
}

interface ApiErrorEnvelope {
  error: {
    code: PersonalApiErrorCode;
    message: string;
  };
}

function attachmentName(disposition: string | null): string {
  const match = /filename=(?:"([^"]+)"|([^;]+))/i.exec(disposition ?? "");
  return (match?.[1] ?? match?.[2] ?? "medya.bin").trim();
}

export function createPersonalMediaClient(
  config: PersonalServerConfig,
  fetcher: Fetcher = fetch,
): PersonalMediaClient {
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetcher(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${config.token}`,
      },
    });

    if (!response.ok) {
      const body = (await response.json()) as ApiErrorEnvelope;
      throw new PersonalApiError(body.error.code, body.error.message);
    }

    return response;
  }

  return {
    async health() {
      const response = await request("/api/health");
      const body = (await response.json()) as { ok: boolean };
      return body.ok;
    },

    async inspect(url) {
      const response = await request("/api/youtube/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      return (await response.json()) as YouTubeVideo;
    },

    async download(url, format) {
      const response = await request("/api/youtube/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, format }),
      });
      return new File([await response.blob()], attachmentName(response.headers.get("content-disposition")), {
        type: response.headers.get("content-type") ?? "application/octet-stream",
      });
    },
  };
}
