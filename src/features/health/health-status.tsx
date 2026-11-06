import type { ServiceStatus } from "@shared/health";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getErrorMessage } from "@/lib/api";
import { healthQueryOptions } from "./api";

const statusLabel: Record<ServiceStatus, string> = {
  ok: "Operacional",
  degraded: "Degradado",
  down: "Fora do ar",
};

const statusVariant: Record<ServiceStatus, "default" | "secondary" | "destructive"> = {
  ok: "default",
  degraded: "secondary",
  down: "destructive",
};

export function HealthStatus() {
  const health = useQuery(healthQueryOptions());

  async function handleRefresh() {
    const result = await health.refetch();
    if (result.isSuccess) toast.success("API respondeu normalmente.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status da API</CardTitle>
        <CardDescription>
          Resposta de <code className="font-mono">GET /api/health</code> via cliente tipado.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={health.isFetching}>
            <RefreshCw className={health.isFetching ? "animate-spin" : undefined} aria-hidden />
            Atualizar
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {health.isPending ? (
          <LoadingState label="Verificando a API…" />
        ) : health.isError ? (
          <ErrorState
            title="A API não respondeu"
            message={getErrorMessage(health.error)}
            onRetry={() => health.refetch()}
          />
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <Badge variant={statusVariant[health.data.status]}>
                  {statusLabel[health.data.status]}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">App</dt>
              <dd data-testid="health-app">{health.data.app}</dd>
              <dt className="text-muted-foreground">Verificado em</dt>
              <dd>
                <time dateTime={health.data.timestamp}>
                  {new Date(health.data.timestamp).toLocaleString("pt-BR")}
                </time>
              </dd>
            </dl>

            {health.data.services.length === 0 ? (
              <EmptyState
                title="Nenhum serviço conectado"
                description="Quando o app tiver banco de dados ou outros serviços, o status de cada um aparece aqui."
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {health.data.services.map((service) => (
                  <li
                    key={service.name}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span>{service.name}</span>
                    <Badge variant={statusVariant[service.status]}>
                      {statusLabel[service.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
