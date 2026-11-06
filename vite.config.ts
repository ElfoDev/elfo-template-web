import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
  "@worker": fileURLToPath(new URL("./worker", import.meta.url)),
};

export default defineConfig({
  resolve: { alias },
  plugins: [
    // Precisa vir antes do plugin do React.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Roda o Worker (worker/index.ts) no workerd durante `pnpm dev`/`preview`,
    // com HMR, e gera o build do Worker + assets em `pnpm build`.
    cloudflare(),
  ],
});
