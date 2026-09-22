import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilePicker } from "./FilePicker";

describe("FilePicker", () => {
  it("switches between video, audio, and direct-link sources", async () => {
    const user = userEvent.setup();
    render(<FilePicker onFile={vi.fn()} onUrl={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "Video yükle" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Video veya ses dosyası seç")).toHaveAttribute(
      "accept",
      ".mp4,video/mp4",
    );

    await user.click(screen.getByRole("tab", { name: "Ses yükle" }));
    expect(screen.getByLabelText("Video veya ses dosyası seç")).toHaveAttribute(
      "accept",
      ".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav",
    );

    await user.click(screen.getByRole("tab", { name: "Doğrudan bağlantı" }));
    expect(screen.getByLabelText("Doğrudan medya bağlantısı")).toBeVisible();
    expect(screen.queryByLabelText("Video veya ses dosyası seç")).not.toBeInTheDocument();
  });

  it("accepts a file dropped onto the active upload panel", () => {
    const onFile = vi.fn();
    render(<FilePicker onFile={onFile} onUrl={vi.fn()} />);
    const file = new File([new Uint8Array([1])], "klip.mp4", { type: "video/mp4" });

    fireEvent.drop(screen.getByTestId("file-drop-zone"), {
      dataTransfer: { files: [file] },
    });

    expect(onFile).toHaveBeenCalledWith(file);
  });
});
