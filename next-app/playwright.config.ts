import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 960 },
      },
    },
  ],
  webServer: [
    {
      command: "node tests/backend-fixture.mjs",
      url: "http://127.0.0.1:8101/test/state",
      reuseExistingServer: false,
    },
    {
      command: "npm run start -- --port 3100",
      url: "http://localhost:3100",
      env: { BACKEND_API_URL: "http://127.0.0.1:8101/api/v4" },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
})
