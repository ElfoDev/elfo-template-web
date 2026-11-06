import { safeRedirect } from "@shared/auth";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authSearchSchema, sessionQueryOptions } from "@/features/auth/api";
import { SignUpForm } from "@/features/auth/sign-up-form";
import { SocialSignIn } from "@/features/auth/social-sign-in";

export const Route = createFileRoute("/signup")({
  validateSearch: authSearchSchema,
  beforeLoad: async ({ context, search }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: SignUpPage,
});

function SignUpPage() {
  const { redirect: target } = Route.useSearch();
  const navigate = useNavigate();
  const next = safeRedirect(target);

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Criar conta</h1>
        </CardTitle>
        <CardDescription>Cadastre-se para criar e gerenciar seus projetos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SocialSignIn callbackURL={next} />
        <SignUpForm onSuccess={() => void navigate({ href: next, replace: true })} />
        <p className="text-center text-muted-foreground text-sm">
          Já tem conta?{" "}
          <Link
            to="/login"
            search={{ redirect: target }}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
