import { createFileRoute } from "@tanstack/react-router";
import { EasterEggHighlight } from "@/features/easter-egg/easter-egg-highlight";
import { HealthStatus } from "@/features/health/health-status";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="font-semibold text-3xl tracking-tight">🥚 Easter egg encontrado!</h1>
        <p className="max-w-2xl text-muted-foreground">
          Se você está vendo esta página no preview, o front React está no ar. A mensagem logo
          abaixo vem da API Hono, rodando no mesmo Cloudflare Worker.
        </p>
      </section>
      <EasterEggHighlight />
      <HealthStatus />
    </div>
  );
}
