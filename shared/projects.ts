import { z } from "zod";

/**
 * Contrato do recurso de exemplo "projects" (CRUD em /api/projects),
 * compartilhado entre o Worker (validação) e o front (tipos e formulário).
 */
export const PROJECT_NAME_MAX = 100;
export const PROJECT_DESCRIPTION_MAX = 500;

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Project = z.infer<typeof projectSchema>;

const projectName = z
  .string({ error: "Informe o nome do projeto." })
  .trim()
  .min(1, "Informe o nome do projeto.")
  .max(PROJECT_NAME_MAX, `O nome pode ter no máximo ${PROJECT_NAME_MAX} caracteres.`);

const projectDescription = z
  .string({ error: "A descrição deve ser um texto." })
  .trim()
  .max(
    PROJECT_DESCRIPTION_MAX,
    `A descrição pode ter no máximo ${PROJECT_DESCRIPTION_MAX} caracteres.`,
  );

export const createProjectSchema = z.object({
  name: projectName,
  description: projectDescription.default(""),
});
export type CreateProjectInput = z.input<typeof createProjectSchema>;

/** PATCH: todos os campos opcionais, mas pelo menos um. */
export const updateProjectSchema = z
  .object({ name: projectName, description: projectDescription })
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Informe pelo menos um campo para atualizar.",
  });
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
