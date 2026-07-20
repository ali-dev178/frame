/// <reference types="@vitest/browser/providers/playwright" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            instances: [
              {
                browser: "chromium",
                launch: {
                  // the default chromium-headless-shell build lacks working
                  // video encoders (VideoEncoder crashes the tab) — use the
                  // FULL chromium build in new-headless mode instead
                  channel: "chromium",
                },
              },
            ],
          },
        },
      },
    ],
  },
});
