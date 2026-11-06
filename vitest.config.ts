import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
  "@worker": fileURLToPath(new URL("./worker", import.meta.url)),
};

// Config separada do vite.config.ts: o plugin do Cloudflare não é necessário
// nos testes unitários (a API é testada com `app.request(...)`).
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.ts"],
          setupFiles: ["./src/test/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "worker",
          environment: "node",
          include: ["worker/**/*.test.ts"],
        },
      },
    ],
  },
});
