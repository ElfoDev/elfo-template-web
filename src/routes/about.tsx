import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const stack = [
  { name: "Front", items: "Vite, React 19, TanStack Router e Query, Tailwind CSS v4, shadcn/ui" },
  { name: "API", items: "Hono no Cloudflare Worker, cliente tipado via Hono RPC" },
  {
    name: "Banco",
    items: "Postgres com Drizzle ORM: Neon em produção, PGlite no dev e nos testes",
  },
  {
    name: "Autenticação",
    items: "Better Auth: email e senha (+ GitHub/Google opcionais), sessão por cookie",
  },
  { name: "Compartilhado", items: "Schemas zod em shared/, usados no front e na API" },
  { name: "Qualidade", items: "Biome, Vitest + Testing Library, Playwright" },
];

function AboutPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-semibold text-3xl tracking-tight">Sobre</h1>
      <Card>
        <CardHeader>
          <CardTitle>Stack</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            {stack.map((entry) => (
              <div key={entry.name} className="contents">
                <dt className="font-medium">{entry.name}</dt>
                <dd className="text-muted-foreground">{entry.items}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
