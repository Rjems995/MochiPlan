import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 10000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { channel: "chrome" },
    screenshot: "only-on-failure",
  },
  reporter: "list",
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
