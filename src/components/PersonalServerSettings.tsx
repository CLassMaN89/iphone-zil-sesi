import { useEffect, useState } from "react";
import type { PersonalServerConfig } from "../personal/types";

export interface PersonalServerSettingsProps {
  config?: PersonalServerConfig;
  status: "checking" | "connected" | "offline";
  onSave(config: PersonalServerConfig): void;
  onClear(): void;
}

const STATUS_TEXT = {
  checking: "Kişisel sunucu kontrol ediliyor",
  connected: "Kişisel sunucu bağlı",
  offline: "Kişisel sunucu kapalı",
} as const;

export function PersonalServerSettings({
  config,
  status,
  onSave,
  onClear,
}: PersonalServerSettingsProps) {
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? "");
  const [token, setToken] = useState("");
  const [validationError, setValidationError] = useState<string>();

  useEffect(() => {
    setBaseUrl(config?.baseUrl ?? "");
    setToken("");
    setValidationError(undefined);
  }, [config]);

  if (status === "connected" && config) {
    return (
      <section className="personal-server-card glass-inset" aria-live="polite">
        <div>
          <strong className="server-status is-connected">{STATUS_TEXT.connected}</strong>
          <p>{config.baseUrl}</p>
        </div>
        <button type="button" className="text-action compact-action" onClick={onClear}>
          Bağlantıyı kaldır
        </button>
      </section>
    );
  }

  return (
    <section className="personal-server-card glass-inset" aria-live="polite">
      <div className="server-copy">
        <strong className={`server-status is-${status}`}>{STATUS_TEXT[status]}</strong>
        <p>
          Codespace içinde <code>npm run personal-server</code> çalıştırıp terminaldeki
          adres ve kodu girin.
        </p>
      </div>
      <form
        className="pairing-form"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onSave({ baseUrl, token });
            setValidationError(undefined);
          } catch (error) {
            setValidationError(
              error instanceof Error
                ? error.message
                : "Sunucu bilgileri kaydedilemedi.",
            );
          }
        }}
      >
        <label>
          Codespaces sunucu adresi
          <input
            type="url"
            inputMode="url"
            value={baseUrl}
            placeholder="https://codespace-8787.app.github.dev"
            onChange={(event) => setBaseUrl(event.currentTarget.value)}
          />
        </label>
        <label>
          Eşleştirme kodu
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
          />
        </label>
        <button type="submit" disabled={!baseUrl.trim() || !token.trim()}>
          Sunucuya bağlan
        </button>
      </form>
      {validationError && (
        <p role="alert" className="error-message pairing-error">
          {validationError}
        </p>
      )}
      {config && (
        <button type="button" className="text-action compact-action" onClick={onClear}>
          Bağlantıyı kaldır
        </button>
      )}
    </section>
  );
}
