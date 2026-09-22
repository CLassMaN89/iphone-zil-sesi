import type { PersonalServerConfig } from "./types";

const STORAGE_KEY = "iphone-ringtone-personal-server-v1";
const CODESPACES_HOST = /^[a-z0-9-]+-8787\.app\.github\.dev$/i;
const INVALID_URL_MESSAGE = "Geçerli HTTPS Codespaces sunucu adresini girin.";

function normalizeConfig(config: PersonalServerConfig): PersonalServerConfig {
  const token = config.token.trim();
  if (!token) {
    throw new Error("Eşleştirme kodunu girin.");
  }

  let url: URL;
  try {
    url = new URL(config.baseUrl.trim());
  } catch {
    throw new Error(INVALID_URL_MESSAGE);
  }

  if (
    url.protocol !== "https:" ||
    !CODESPACES_HOST.test(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(INVALID_URL_MESSAGE);
  }

  return { baseUrl: url.origin, token };
}

export function savePersonalServer(config: PersonalServerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeConfig(config)));
}

export function loadPersonalServer(): PersonalServerConfig | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return undefined;
  }

  try {
    return normalizeConfig(JSON.parse(raw) as PersonalServerConfig);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return undefined;
  }
}

export function clearPersonalServer(): void {
  localStorage.removeItem(STORAGE_KEY);
}
