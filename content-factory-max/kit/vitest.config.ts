import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: [{ find: /^@\/(.*)$/, replacement: path.resolve(import.meta.dirname, "$1") }] },
  test: { environment: "node", include: ["tests/**/*.test.{ts,tsx}"] },
});
