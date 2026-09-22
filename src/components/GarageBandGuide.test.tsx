import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GarageBandGuide } from "./GarageBandGuide";

describe("GarageBandGuide", () => {
  it("gives the five actions needed to install the downloaded sound", () => {
    render(<GarageBandGuide />);

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText(/GarageBand.*Zil Sesi/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Apple'ın ayrıntılı rehberi/i })).toHaveAttribute(
      "href",
      "https://support.apple.com/en-au/120692",
    );
  });
});
