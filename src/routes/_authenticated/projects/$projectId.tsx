import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { projectQueryOptions, useUpdateProject } from "@/features/projects/api";
import { DeleteProjectButton } from "@/features/projects/delete-project-button";
import { ProjectForm } from "@/features/projects/project-form";
import { DetailedError, getErrorMessage } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  component: EditProjectPage,
});

function EditProjectPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const project = useQuery({ ...projectQueryOptions(projectId), meta: { silent: true } });
  const updateProject = useUpdateProject(projectId);

  if (project.isPending) return <LoadingState label="Carregando projeto…" />;

  if (project.isError) {
    if (project.error instanceof DetailedError && project.error.statusCode === 404) {
      return (
        <EmptyState
          title="Projeto não encontrado"
          description="Ele pode ter sido apagado ou o endereço está errado."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/projects">Voltar para projetos</Link>
            </Button>
          }
        />
      );
    }
    return (
      <ErrorState
        title="Não foi possível carregar o projeto"
        message={getErrorMessage(project.error)}
        onRetry={() => project.refetch()}
      />
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Editar projeto</h1>
        </CardTitle>
        <CardAction>
          <DeleteProjectButton
            project={project.data}
            onDeleted={() => void navigate({ to: "/projects" })}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ProjectForm
          // Recria o formulário se outro projeto for aberto na mesma rota.
          key={project.data.id}
          defaultValues={{ name: project.data.name, description: project.data.description }}
          submitLabel="Salvar alterações"
          pending={updateProject.isPending}
          onSubmit={(values) =>
            updateProject.mutate(values, {
              onSuccess: (updated) => {
                toast.success(`Projeto "${updated.name}" atualizado.`);
                void navigate({ to: "/projects" });
              },
            })
          }
        />
      </CardContent>
    </Card>
  );
}
