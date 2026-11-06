import type { SocialProvider } from "@shared/auth";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authProvidersQueryOptions, useSocialSignIn } from "./api";

const LABELS: Record<SocialProvider, string> = { github: "GitHub", google: "Google" };

/**
 * Botões "Continuar com GitHub/Google", só para os provedores configurados no
 * Worker (envs OAUTH_GITHUB_* / OAUTH_GOOGLE_*). Sem nenhum, não renderiza nada.
 */
export function SocialSignIn({ callbackURL }: { callbackURL: string }) {
  const providers = useQuery({ ...authProvidersQueryOptions(), meta: { silent: true } });
  const socialSignIn = useSocialSignIn();
  const social = providers.data?.social ?? [];

  if (social.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {social.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            disabled={socialSignIn.isPending}
            onClick={() => socialSignIn.mutate({ provider, callbackURL })}
          >
            {socialSignIn.isPending && socialSignIn.variables?.provider === provider ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : null}
            Continuar com {LABELS[provider]}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <span className="h-px flex-1 bg-border" />
        ou com email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
