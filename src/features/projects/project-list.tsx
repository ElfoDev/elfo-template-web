import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FolderOpen, Pencil, Plus } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/api";
import { projectsQueryOptions } from "./api";
import { DeleteProjectButton } from "./delete-project-button";

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function ProjectList() {
  const projects = useQuery(projectsQueryOptions());

  if (projects.isPending) return <LoadingState label="Carregando projetos…" />;

  if (projects.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar os projetos"
        message={getErrorMessage(projects.error)}
        onRetry={() => projects.refetch()}
      />
    );
  }

  if (projects.data.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpen className="size-6 text-muted-foreground" aria-hidden />}
        title="Nenhum projeto ainda"
        description="Crie o primeiro projeto para vê-lo aqui."
        action={
          <Button asChild size="sm">
            <Link to="/projects/new">
              <Plus aria-hidden />
              Criar projeto
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul aria-label="Projetos" className="divide-y rounded-lg border">
      {projects.data.map((project) => (
        <li key={project.id} className="flex items-start justify-between gap-4 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="font-medium hover:underline"
            >
              {project.name}
            </Link>
            {project.description ? (
              <p className="line-clamp-2 text-muted-foreground text-sm">{project.description}</p>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Atualizado em{" "}
              <time dateTime={project.updatedAt}>
                {dateFormat.format(new Date(project.updatedAt))}
              </time>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                aria-label={`Editar ${project.name}`}
              >
                <Pencil aria-hidden />
                <span className="sr-only sm:not-sr-only">Editar</span>
              </Link>
            </Button>
            <DeleteProjectButton project={project} />
          </div>
        </li>
      ))}
    </ul>
  );
}
