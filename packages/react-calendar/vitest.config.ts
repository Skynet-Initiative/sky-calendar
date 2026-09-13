import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // Wall-clock performance assertions must not contend with other test files.
    fileParallelism: false,
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
  },
});
