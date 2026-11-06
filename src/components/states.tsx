import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Estados padrão de tela. Toda tela que carrega dados deve cobrir os três:
 * carregando, erro (com "tentar de novo") e vazio.
 */

export function LoadingState({
  label = "Carregando…",
  rows = 3,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders estáticos
        <Skeleton key={i} className="h-5 w-full last:w-2/3" />
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Não foi possível carregar",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-6 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden />
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = <Inbox className="size-6 text-muted-foreground" aria-hidden />,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center",
        className,
      )}
    >
      {icon}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
