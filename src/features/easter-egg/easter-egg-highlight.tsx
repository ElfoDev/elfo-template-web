import { useQuery } from "@tanstack/react-query";
import { Egg } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/api";
import { easterEggQueryOptions } from "./api";

/**
 * Bloco de destaque da home: mostra a mensagem secreta que vem de
 * GET /api/easter-egg. Se o front aparecer sem a API, o erro fica evidente aqui.
 */
export function EasterEggHighlight() {
  const egg = useQuery(easterEggQueryOptions());

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Egg className="size-5 text-amber-600 dark:text-amber-400" aria-hidden />
          Mensagem secreta do backend
        </CardTitle>
        <CardDescription>
          Escondida pelo Worker em <code className="font-mono">GET /api/easter-egg</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {egg.isPending ? (
          <LoadingState label="Procurando o ovo na API…" rows={2} />
        ) : egg.isError ? (
          <ErrorState
            title="O backend não entregou o Easter egg"
            message={getErrorMessage(egg.error)}
            onRetry={() => egg.refetch()}
          />
        ) : egg.data.message.trim() === "" ? (
          <EmptyState
            title="Nenhum ovo escondido"
            description="A API respondeu, mas sem mensagem secreta desta vez."
          />
        ) : (
          <figure className="space-y-2">
            <blockquote className="font-medium text-lg" data-testid="easter-egg-message">
              {egg.data.message}
            </blockquote>
            <figcaption className="text-muted-foreground text-sm">
              Escondido em{" "}
              <time dateTime={egg.data.hiddenAt}>
                {new Date(egg.data.hiddenAt).toLocaleString("pt-BR")}
              </time>
            </figcaption>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}
