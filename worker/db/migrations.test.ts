import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterAll, beforeAll, expect, it } from "vitest";

let client: PGlite;

beforeAll(async () => {
  client = await PGlite.create();
});
afterAll(() => client.close());

const migrations = readMigrationFiles({ migrationsFolder: "drizzle" });

/** Roda a migration de índice `index` (ordem do journal), statement a statement. */
async function runMigration(index: number) {
  for (const statement of migrations[index]?.sql ?? []) {
    await client.exec(statement);
  }
}

it("a migration de autenticação não apaga os projetos que já existiam", async () => {
  await runMigration(0);
  await client.exec(`INSERT INTO "projects" ("name") VALUES ('Projeto antigo')`);

  await runMigration(1);

  // A linha continua lá, só que sem dono (user_id nulo): nenhuma query a devolve.
  const { rows } = await client.query<{ name: string; user_id: string | null }>(
    `SELECT "name", "user_id" FROM "projects"`,
  );
  expect(rows).toEqual([{ name: "Projeto antigo", user_id: null }]);
});
