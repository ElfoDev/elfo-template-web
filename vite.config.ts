import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { type LocalDb, readDatabaseUrl, readDevVar, startLocalDb } from "./scripts/local-db.ts";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
  "@worker": fileURLToPath(new URL("./worker", import.meta.url)),
};

/**
 * Secrets opcionais (OAuth). Não estão em `secrets.required` (o deploy exigiria
 * todos), então o wrangler não os lê do `.dev.vars`: no `pnpm dev` eles vão
 * para o Worker por aqui. Ver worker/types.ts.
 */
const OPTIONAL_SECRETS = [
  "OAUTH_GITHUB_CLIENT_ID",
  "OAUTH_GITHUB_CLIENT_SECRET",
  "OAUTH_GOOGLE_CLIENT_ID",
  "OAUTH_GOOGLE_CLIENT_SECRET",
];

/**
 * Secret do Better Auth para dev/preview/e2e quando o `.dev.vars` não define
 * `BETTER_AUTH_SECRET`. Só no `serve` local: nunca vai para o build nem o deploy
 * (em produção o Elfo gera um secret de verdade).
 */
const DEV_AUTH_SECRET = "dev-only-better-auth-secret-nao-use-em-producao";

export default defineConfig(async ({ command, isPreview }) => {
  const serve = command === "serve";

  // Sem DATABASE_URL no .dev.vars, sobe um PGlite local e passa a URL dele para
  // o Worker. Só em `serve` (dev/preview): nunca vai para o build nem o deploy.
  const useLocalDb = serve && !readDatabaseUrl();
  const useDevAuthSecret = serve && !readDevVar("BETTER_AUTH_SECRET");

  // `pnpm dev`: banco persistente em .wrangler/pglite, injetado na config do Worker.
  const localDb = useLocalDb && !isPreview ? await getLocalDb() : undefined;

  // `pnpm preview` (e o e2e): o Worker usa a config gerada pelo build, então os
  // valores vão por process.env (lido pelo wrangler para os secrets declarados).
  // Banco em memória: descartável e sem disputar o diretório com um `pnpm dev` aberto.
  if (isPreview) {
    if (useLocalDb) process.env.DATABASE_URL = (await getLocalDb("memory://")).workerUrl;
    if (useDevAuthSecret) process.env.BETTER_AUTH_SECRET = DEV_AUTH_SECRET;
  }

  // `pnpm dev`: valores injetados como `vars` na config do Worker.
  const devVars: Record<string, string> = {};
  if (serve && !isPreview) {
    if (localDb) devVars.DATABASE_URL = localDb.workerUrl;
    if (useDevAuthSecret) devVars.BETTER_AUTH_SECRET = DEV_AUTH_SECRET;
    for (const name of OPTIONAL_SECRETS) {
      const value = readDevVar(name);
      if (value) devVars[name] = value;
    }
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
        config:
          Object.keys(devVars).length > 0
            ? (config) => {
                // O que é injetado aqui sai da lista de secrets exigidos, para o
                // wrangler não avisar que está faltando. (Mutação de propósito: o
                // plugin mescla o retorno com `defu`, que concatena arrays.)
                if (config.secrets?.required) {
                  config.secrets.required = config.secrets.required.filter(
                    (name) => !(name in devVars),
                  );
                }
                return { vars: devVars };
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
