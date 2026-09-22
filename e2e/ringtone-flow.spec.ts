import { expect, test } from "@playwright/test";
import path from "node:path";

const tonePath = path.join(process.cwd(), "e2e", "fixtures", "tone.wav");

test("commits a decimal duration after keyboard editing", async ({ page }) => {
  await page.goto("/iphone-zil-sesi/");
  await page.getByLabel("Video veya ses dosyası seç").setInputFiles(tonePath);

  const duration = page.getByLabel("Süre");
  await duration.click();
  await duration.press("ControlOrMeta+A");
  await duration.pressSequentially("1.5");
  await duration.press("Tab");

  await expect(duration).toHaveValue("1.5");
});

test("creates a downloadable ringtone from a local WAV", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/iphone-zil-sesi/");
  await page
    .getByLabel("Video veya ses dosyası seç")
    .setInputFiles(tonePath);
  await expect(page.getByRole("button", { name: "Zil sesini hazırla" })).toBeEnabled();
  await page.getByRole("button", { name: "Zil sesini hazırla" }).click();
  await expect(page.getByRole("link", { name: "Ses dosyasını indir" })).toBeVisible({
    timeout: 15_000,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Ses dosyasını indir" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/zil-sesi\.(m4a|wav)$/);
  await expect(page.getByRole("heading", { name: "iPhone’da zil sesi olarak ayarla" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
