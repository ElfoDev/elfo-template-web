import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { createApp } from "../index";

/** Env mínimo para `app.request(path, init, testEnv)`. O banco vem do `connectDb`. */
export const testEnv = {
  APP_NAME: "Test App",
  DATABASE_URL: "",
  BETTER_AUTH_SECRET: "test-secret-com-pelo-menos-32-caracteres!",
  BETTER_AUTH_URL: "",
} satisfies Env;

/**
 * Banco PGlite em memória com as migrations de drizzle/ aplicadas: rápido, sem
 * rede e igual ao schema de produção. Crie um por arquivo de teste
 * (`beforeAll`) e limpe entre os testes com `reset()`.
 */
export async function createTestDb() {
  const client = await PGlite.create();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "drizzle" });

  return {
    db,
    /** App da API usando este banco. */
    app: createApp({ connectDb: () => ({ db, close: async () => {} }) }),
    /** Apaga os dados de todas as tabelas (mantém o schema). */
    async reset() {
      const { rows } = await db.execute<{ tablename: string }>(
        sql`select tablename from pg_tables where schemaname = 'public'`,
      );
      if (rows.length === 0) return;
      const tables = rows.map((row) => `"${row.tablename}"`).join(", ");
      await db.execute(sql.raw(`truncate ${tables} restart identity cascade`));
    },
    close: () => client.close(),
  };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;
