import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Database tests share one test database; run files one at a time.
    fileParallelism: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
