import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonalServerSettings } from "./PersonalServerSettings";

describe("PersonalServerSettings", () => {
  it("submits a Codespaces address and secret pairing code", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <PersonalServerSettings
        status="offline"
        onSave={onSave}
        onClear={vi.fn()}
      />,
    );

    await user.type(
      screen.getByLabelText("Codespaces sunucu adresi"),
      "https://quiet-space-8787.app.github.dev",
    );
    await user.type(screen.getByLabelText("Eşleştirme kodu"), "secret");
    await user.click(screen.getByRole("button", { name: "Sunucuya bağlan" }));

    expect(onSave).toHaveBeenCalledWith({
      baseUrl: "https://quiet-space-8787.app.github.dev",
      token: "secret",
    });
    expect(screen.getByLabelText("Eşleştirme kodu")).toHaveAttribute(
      "type",
      "password",
    );
  });

  it("shows connected state without exposing the token and can clear pairing", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <PersonalServerSettings
        config={{
          baseUrl: "https://quiet-space-8787.app.github.dev",
          token: "never-render-this-token",
        }}
        status="connected"
        onSave={vi.fn()}
        onClear={onClear}
      />,
    );

    expect(screen.getByText("Kişisel sunucu bağlı")).toBeVisible();
    expect(screen.queryByDisplayValue("never-render-this-token")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bağlantıyı kaldır" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it.each([
    ["checking", "Kişisel sunucu kontrol ediliyor"],
    ["offline", "Kişisel sunucu kapalı"],
  ] as const)("renders the %s status", (status, text) => {
    render(
      <PersonalServerSettings
        config={{
          baseUrl: "https://quiet-space-8787.app.github.dev",
          token: "secret",
        }}
        status={status}
        onSave={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText(text)).toBeVisible();
  });

  it("shows a pairing validation error without crashing the page", async () => {
    const user = userEvent.setup();
    render(
      <PersonalServerSettings
        status="offline"
        onSave={() => {
          throw new Error("Geçerli HTTPS Codespaces sunucu adresini girin.");
        }}
        onClear={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("Codespaces sunucu adresi"), "https://example.com");
    await user.type(screen.getByLabelText("Eşleştirme kodu"), "secret");
    await user.click(screen.getByRole("button", { name: "Sunucuya bağlan" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Geçerli HTTPS Codespaces sunucu adresini girin.",
    );
  });
});
