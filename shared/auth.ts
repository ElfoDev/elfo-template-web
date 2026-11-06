import { z } from "zod";

/**
 * Contrato da autenticação (Better Auth em /api/auth/*). Os formulários do
 * front validam com estes schemas antes de chamar a API; as mesmas regras são
 * aplicadas pelo Better Auth no Worker (worker/auth.ts).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 100;

/** Provedores OAuth suportados. Ficam ativos só com as envs configuradas. */
export const socialProviderSchema = z.enum(["github", "google"]);
export type SocialProvider = z.infer<typeof socialProviderSchema>;

/** `GET /api/auth/providers`: quais botões de login social mostrar. */
export const authProvidersSchema = z.object({
  emailAndPassword: z.boolean(),
  social: socialProviderSchema.array(),
});
export type AuthProviders = z.infer<typeof authProvidersSchema>;

const email = z
  .string({ error: "Informe o email." })
  .trim()
  .min(1, "Informe o email.")
  .pipe(z.email("Informe um email válido."));

export const signInSchema = z.object({
  email,
  password: z.string({ error: "Informe a senha." }).min(1, "Informe a senha."),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z
    .string({ error: "Informe seu nome." })
    .trim()
    .min(1, "Informe seu nome.")
    .max(NAME_MAX_LENGTH, `O nome pode ter no máximo ${NAME_MAX_LENGTH} caracteres.`),
  email,
  password: z
    .string({ error: "Informe a senha." })
    .min(PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
    .max(PASSWORD_MAX_LENGTH, `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Para onde voltar depois do login (`?redirect=`). Só caminhos internos do app:
 * qualquer outra coisa (URL absoluta, `//host`) vira o padrão, para o login não
 * servir de redirecionamento aberto.
 */
export function safeRedirect(target: unknown, fallback = "/projects"): string {
  if (typeof target !== "string") return fallback;
  if (!target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return fallback;
  }
  return target;
}
