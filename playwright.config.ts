import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const localPython = existsSync(".venv/Scripts/python.exe") ? ".venv/Scripts/python.exe" : "python";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:8420",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${localPython} -m uvicorn server.api:app --host 127.0.0.1 --port 8420`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
    url: "http://127.0.0.1:8420/api/health",
  },
});
