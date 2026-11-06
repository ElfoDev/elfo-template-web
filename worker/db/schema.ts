import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Schema do banco (Drizzle). Depois de mudar este arquivo:
 *   pnpm db:generate   → gera a migration SQL em drizzle/ (commite)
 *   pnpm db:migrate    → aplica no banco (PGlite local ou DATABASE_URL)
 */

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type ProjectRow = typeof projects.$inferSelect;
