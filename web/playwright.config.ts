import { defineConfig } from "@playwright/test";

// End-to-end tests: start the real headless companion and the real relay, then drive the web app in Chromium.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { locale: "de-DE", trace: "off", screenshot: "only-on-failure" },
});
