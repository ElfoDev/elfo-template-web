import type { SignInInput, SignUpInput, SocialProvider } from "@shared/auth";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, parseResponse } from "@/lib/api";
import { authClient, type Session } from "@/lib/auth-client";

/** Search params de /login e /signup. */
export const authSearchSchema = z.object({
  /** Página para voltar depois de entrar (só caminhos internos, ver `safeRedirect`). */
  redirect: z.string().optional().catch(undefined),
  /** Erro devolvido pelo Better Auth ao voltar do OAuth (`errorCallbackURL`). */
  error: z.string().optional().catch(undefined),
});

export const sessionQueryKey = ["session"] as const;

/** Mensagens do Better Auth (pelo `code`) em pt-BR. */
const AUTH_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email ou senha incorretos.",
  INVALID_EMAIL: "Informe um email válido.",
  USER_ALREADY_EXISTS: "Já existe uma conta com este email.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Já existe uma conta com este email.",
  PASSWORD_TOO_SHORT: "A senha é curta demais.",
  PASSWORD_TOO_LONG: "A senha é longa demais.",
  EMAIL_NOT_VERIFIED: "Confirme seu email antes de entrar (veja o link que enviamos).",
};

/** Erro de um endpoint do Better Auth, com a mensagem já traduzida. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

type AuthResult<T> = {
  data: T | null;
  error: { code?: string; message?: string; status: number; statusText?: string } | null;
};

/** `{ data, error }` do cliente do Better Auth → dado ou `AuthError`. */
async function unwrap<T>(promise: Promise<AuthResult<T>>): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    const message =
      (error.code && AUTH_ERRORS[error.code]) ||
      (error.status === 429 ? "Muitas tentativas. Espere um pouco e tente de novo." : undefined) ||
      "Não foi possível concluir. Tente de novo.";
    throw new AuthError(message, error.status, error.code);
  }
  return data as T;
}

/**
 * Sessão atual (`null` = ninguém logado). É a fonte de verdade do front: o
 * guard das rotas protegidas e o menu do usuário leem daqui.
 */
export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: sessionQueryKey,
    queryFn: async (): Promise<Session | null> => (await unwrap(authClient.getSession())) ?? null,
    staleTime: 5 * 60_000,
  });

/** Formas de login disponíveis (botões de GitHub/Google só se configurados). */
export const authProvidersQueryOptions = () =>
  queryOptions({
    queryKey: ["auth-providers"],
    queryFn: () => parseResponse(api.auth.providers.$get()),
    staleTime: Number.POSITIVE_INFINITY,
  });

/**
 * Depois de entrar ou sair, nada do cache pode ser reaproveitado (eram dados de
 * outra pessoa ou de ninguém): descarta tudo e busca a sessão de novo. A sessão
 * é rebuscada no lugar (e não removida) para que quem a observa, como o menu do
 * usuário, receba o valor novo.
 */
function useResetSession() {
  const queryClient = useQueryClient();
  return async () => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionQueryKey[0] });
    await queryClient.fetchQuery({ ...sessionQueryOptions(), staleTime: 0 });
  };
}

export function useSignIn() {
  const resetSession = useResetSession();
  return useMutation({
    mutationFn: (input: SignInInput) => unwrap(authClient.signIn.email(input)),
    onSuccess: resetSession,
  });
}

export function useSignUp() {
  const resetSession = useResetSession();
  return useMutation({
    mutationFn: (input: SignUpInput) => unwrap(authClient.signUp.email(input)),
    onSuccess: resetSession,
  });
}

export function useSignOut() {
  const resetSession = useResetSession();
  return useMutation({
    mutationFn: () => unwrap(authClient.signOut()),
    onSuccess: resetSession,
  });
}

/**
 * Login com GitHub/Google: o navegador sai para o provedor e volta em
 * `callbackURL` já logado (ou em /login?error=… se algo falhar).
 */
export function useSocialSignIn() {
  return useMutation({
    mutationFn: ({ provider, callbackURL }: { provider: SocialProvider; callbackURL: string }) =>
      unwrap(authClient.signIn.social({ provider, callbackURL, errorCallbackURL: "/login" })),
  });
}
