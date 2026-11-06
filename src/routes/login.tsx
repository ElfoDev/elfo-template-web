import { safeRedirect } from "@shared/auth";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authSearchSchema, sessionQueryOptions } from "@/features/auth/api";
import { SignInForm } from "@/features/auth/sign-in-form";
import { SocialSignIn } from "@/features/auth/social-sign-in";

export const Route = createFileRoute("/login")({
  validateSearch: authSearchSchema,
  // Já logado: não faz sentido mostrar o login.
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: target, error } = Route.useSearch();
  const navigate = useNavigate();
  const next = safeRedirect(target);

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Entrar</h1>
        </CardTitle>
        <CardDescription>Use seu email e senha para acessar seus projetos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
            Não foi possível entrar com o provedor escolhido. Tente de novo.
          </p>
        ) : null}
        <SocialSignIn callbackURL={next} />
        <SignInForm onSuccess={() => void navigate({ href: next, replace: true })} />
        <p className="text-center text-muted-foreground text-sm">
          Ainda não tem conta?{" "}
          <Link
            to="/signup"
            search={{ redirect: target }}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
