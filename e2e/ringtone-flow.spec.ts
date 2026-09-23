import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const tonePath = path.join(process.cwd(), "e2e", "fixtures", "tone.wav");

test("commits a decimal duration after keyboard editing", async ({ page }) => {
  await page.goto("/iphone-zil-sesi/");
  await page.getByRole("tab", { name: "Ses yükle" }).click();
  await page.getByLabel("Video veya ses dosyası seç").setInputFiles(tonePath);

  const duration = page.getByLabel("Süre");
  await duration.click();
  await duration.press("ControlOrMeta+A");
  await duration.pressSequentially("1.5");
  await duration.press("Tab");

  await expect(duration).toHaveValue("1.5");
});

test("opens the editor for a direct media URL", async ({ page }) => {
  const tone = await readFile(tonePath);
  await page.route("https://media.example.com/tone.wav", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      headers: { "access-control-allow-origin": "*" },
      body: tone,
    });
  });

  await page.goto("/iphone-zil-sesi/");
  await page.getByRole("tab", { name: "Bağlantı" }).click();
  await page.getByRole("button", { name: "Doğrudan dosya" }).click();
  await page
    .getByLabel("Doğrudan medya bağlantısı")
    .fill("https://media.example.com/tone.wav");
  await page.getByRole("button", { name: "Bağlantıdan getir" }).click();

  await expect(page.getByText("tone.wav", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zil sesini hazırla" })).toBeEnabled();
});

test("pairs a personal server and imports a ringtone source", async ({ page }) => {
  const tone = await readFile(tonePath);
  await page.route(
    "https://quiet-space-8787.app.github.dev/api/**",
    async (route) => {
      const url = route.request().url();
      const cors = {
        "access-control-allow-origin": "http://127.0.0.1:4173",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-expose-headers":
          "content-disposition,content-type,content-length",
      };
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      if (url.endsWith("/api/health")) {
        await route.fulfill({
          headers: cors,
          json: { ok: true, service: "iphone-ringtone-personal", version: 1 },
        });
        return;
      }
      if (url.endsWith("/api/youtube/inspect")) {
        await route.fulfill({
          headers: cors,
          json: {
            id: "abc123",
            title: "Kısa video",
            durationSeconds: 2,
            thumbnailUrl: "",
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        headers: {
          ...cors,
          "content-disposition": "attachment; filename=kisa-video.wav",
        },
        body: tone,
      });
    },
  );

  await page.goto("/iphone-zil-sesi/");
  await page.getByRole("tab", { name: "Bağlantı" }).click();
  await page.getByRole("button", { name: "YouTube" }).click();
  await page
    .getByLabel("Codespaces sunucu adresi")
    .fill("https://quiet-space-8787.app.github.dev");
  await page.getByLabel("Eşleştirme kodu").fill("secret");
  await page.getByRole("button", { name: "Sunucuya bağlan" }).click();
  await page.getByLabel("YouTube video bağlantısı").fill("https://youtu.be/abc123");
  await page.getByRole("button", { name: "Videoyu bul" }).click();
  await page.getByRole("button", { name: "Zil sesi hazırla" }).click();

  await expect(page.getByText("Seçilen medya:")).toContainText("kisa-video.wav");
  await expect(page.getByRole("button", { name: "Zil sesini hazırla" })).toBeEnabled();
});

test("creates a downloadable ringtone from a local WAV", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/iphone-zil-sesi/");
  await page.getByRole("tab", { name: "Ses yükle" }).click();
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
