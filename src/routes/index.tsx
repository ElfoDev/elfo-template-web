import { createFileRoute } from "@tanstack/react-router";
import { HealthStatus } from "@/features/health/health-status";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="font-semibold text-3xl tracking-tight">Seu app está no ar</h1>
        <p className="max-w-2xl text-muted-foreground">
          Front React e API Hono rodando no mesmo Cloudflare Worker. Edite{" "}
          <code className="font-mono text-sm">src/routes/index.tsx</code> para começar.
        </p>
      </section>
      <HealthStatus />
    </div>
  );
}
