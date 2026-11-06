import { mkdirSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { LOCAL_DB_DATA_DIR, readDatabaseUrl, runningLocalDbUrl } from "./scripts/local-db";

/**
 * Para onde `pnpm db:migrate` / `pnpm db:studio` apontam, em ordem:
 *   1. `DATABASE_URL` do ambiente ou do `.dev.vars` (ex.: branch `dev` do Neon);
 *   2. o PGlite do `pnpm dev`, se estiver rodando (via TCP, sem disputar o arquivo);
 *   3. o diretório do PGlite local, aberto direto (com o `pnpm dev` parado).
 * `pnpm db:generate` só compara o schema com as migrations e não conecta.
 */
const url = readDatabaseUrl() ?? runningLocalDbUrl();
if (!url) mkdirSync(LOCAL_DB_DATA_DIR, { recursive: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./worker/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  ...(url
    ? { dbCredentials: { url } }
    : { driver: "pglite", dbCredentials: { url: LOCAL_DB_DATA_DIR } }),
});
