import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectList } from "@/features/projects/project-list";

export const Route = createFileRoute("/projects/")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-semibold text-3xl tracking-tight">Projetos</h1>
          <p className="text-muted-foreground">
            Recurso de exemplo: CRUD com Drizzle + Postgres (Neon em produção, PGlite no dev).
          </p>
        </div>
        <Button asChild>
          <Link to="/projects/new">
            <Plus aria-hidden />
            Novo projeto
          </Link>
        </Button>
      </div>
      <ProjectList />
    </div>
  );
}
