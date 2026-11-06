import { zValidator } from "@hono/zod-validator";
import { createProjectSchema, type Project, updateProjectSchema } from "@shared/projects";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth";
import { withDb } from "../db/middleware";
import { type ProjectRow, projects } from "../db/schema";
import type { AppEnv } from "../types";

const NOT_FOUND = { error: "Projeto não encontrado." };

/** Body JSON validado com o schema de shared/; erro vira 400 `{ error }`. */
const jsonBody = <T extends z.ZodType>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: result.error.issues[0]?.message ?? "Dados inválidos." }, 400);
    }
  });

/** `:id` que não é UUID não existe no banco: 404 em vez de erro do Postgres. */
const idParam = zValidator("param", z.object({ id: z.uuid() }), (result, c) => {
  if (!result.success) return c.json(NOT_FOUND, 404);
});

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Filtro "este projeto é do usuário logado". Projeto de outro usuário responde
 * 404 (como se não existisse), para não revelar que o id existe.
 */
const ownProject = (id: string, userId: string) =>
  and(eq(projects.id, id), eq(projects.userId, userId));

/** Projetos do usuário logado: toda query filtra por `c.var.user.id`. */
export const projectRoutes = new Hono<AppEnv>()
  .use(withDb, requireUser)
  .get("/", async (c) => {
    const rows = await c.var.db
      .select()
      .from(projects)
      .where(eq(projects.userId, c.var.user.id))
      .orderBy(desc(projects.createdAt));
    return c.json(rows.map(toProject), 200);
  })
  .get("/:id", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const [row] = await c.var.db.select().from(projects).where(ownProject(id, c.var.user.id));
    if (!row) return c.json(NOT_FOUND, 404);
    return c.json(toProject(row), 200);
  })
  .post("/", jsonBody(createProjectSchema), async (c) => {
    const input = c.req.valid("json");
    const [row] = await c.var.db
      .insert(projects)
      .values({ ...input, userId: c.var.user.id })
      .returning();
    if (!row) throw new Error("INSERT não retornou o projeto criado");
    return c.json(toProject(row), 201);
  })
  .patch("/:id", idParam, jsonBody(updateProjectSchema), async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const [row] = await c.var.db
      .update(projects)
      .set(input)
      .where(ownProject(id, c.var.user.id))
      .returning();
    if (!row) return c.json(NOT_FOUND, 404);
    return c.json(toProject(row), 200);
  })
  .delete("/:id", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const [row] = await c.var.db
      .delete(projects)
      .where(ownProject(id, c.var.user.id))
      .returning({ id: projects.id });
    if (!row) return c.json(NOT_FOUND, 404);
    return c.body(null, 204);
  });
