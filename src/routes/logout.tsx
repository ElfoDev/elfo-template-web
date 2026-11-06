import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ErrorState, LoadingState } from "@/components/states";
import { useSignOut } from "@/features/auth/api";
import { getErrorMessage } from "@/lib/api";

/**
 * Sair: encerra a sessão ao abrir a página e volta para o login. É uma página
 * (e não só um botão) para que qualquer link `/logout` funcione.
 */
export const Route = createFileRoute("/logout")({
  component: LogoutPage,
});

function LogoutPage() {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { mutate } = signOut;
  const started = useRef(false);

  useEffect(() => {
    // Uma vez só (o StrictMode roda os efeitos duas vezes no dev).
    if (started.current) return;
    started.current = true;
    mutate(undefined, { onSuccess: () => void navigate({ to: "/login", replace: true }) });
  }, [mutate, navigate]);

  if (signOut.isError) {
    return (
      <ErrorState
        title="Não foi possível sair"
        message={getErrorMessage(signOut.error)}
        onRetry={() =>
          mutate(undefined, { onSuccess: () => void navigate({ to: "/login", replace: true }) })
        }
      />
    );
  }
  return <LoadingState label="Saindo…" rows={1} />;
}
