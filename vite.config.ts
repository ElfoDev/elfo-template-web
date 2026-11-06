import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { type LocalDb, readDatabaseUrl, startLocalDb } from "./scripts/local-db.ts";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
  "@worker": fileURLToPath(new URL("./worker", import.meta.url)),
};

export default defineConfig(async ({ command, isPreview }) => {
  // Sem DATABASE_URL no .dev.vars, sobe um PGlite local e passa a URL dele para
  // o Worker. Só em `serve` (dev/preview): nunca vai para o build nem o deploy.
  const useLocalDb = command === "serve" && !readDatabaseUrl();

  // `pnpm dev`: banco persistente em .wrangler/pglite, injetado na config do Worker.
  const localDb = useLocalDb && !isPreview ? await getLocalDb() : undefined;

  // `pnpm preview` (e o e2e): o Worker usa a config gerada pelo build, então a URL
  // vai por process.env (lido pelo wrangler para os secrets declarados). Banco em
  // memória: descartável e sem disputar o diretório com um `pnpm dev` aberto.
  if (useLocalDb && isPreview) {
    process.env.DATABASE_URL = (await getLocalDb("memory://")).workerUrl;
  }

  return {
    resolve: { alias },
    plugins: [
      // Precisa vir antes do plugin do React.
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      // Roda o Worker (worker/index.ts) no workerd durante `pnpm dev`/`preview`,
      // com HMR, e gera o build do Worker + assets em `pnpm build`.
      cloudflare({
        config: localDb
          ? (config) => {
              // DATABASE_URL vem do PGlite: tira da lista de secrets exigidos para o
              // wrangler não avisar que está faltando. (Mutação de propósito: o
              // plugin mescla o retorno com `defu`, que concatena arrays.)
              if (config.secrets?.required) {
                config.secrets.required = config.secrets.required.filter(
                  (name) => name !== "DATABASE_URL",
                );
              }
              return { vars: { DATABASE_URL: localDb.workerUrl } };
            }
          : undefined,
      }),
    ],
  };
});

/**
 * Uma instância por processo: o Vite reavalia este arquivo quando ele muda
 * (restart do server) e o PGlite não pode abrir o mesmo diretório duas vezes.
 */
function getLocalDb(dataDir?: string): Promise<LocalDb> {
  const scope = globalThis as { __localDb?: Promise<LocalDb> };
  scope.__localDb ??= startLocalDb({ dataDir }).then((db) => {
    const where = dataDir === "memory://" ? "em memória" : "em .wrangler/pglite";
    console.info(`\n  🐘 PGlite local ${where} (sem DATABASE_URL no .dev.vars): ${db.url}\n`);
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        void db.close().finally(() => process.exit(0));
      });
    }
    return db;
  });
  return scope.__localDb;
}
