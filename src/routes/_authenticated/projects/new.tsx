import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateProject } from "@/features/projects/api";
import { ProjectForm } from "@/features/projects/project-form";

export const Route = createFileRoute("/_authenticated/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();
  const createProject = useCreateProject();

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Novo projeto</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ProjectForm
          submitLabel="Criar projeto"
          pending={createProject.isPending}
          onSubmit={(values) =>
            createProject.mutate(values, {
              onSuccess: (project) => {
                toast.success(`Projeto "${project.name}" criado.`);
                void navigate({ to: "/projects" });
              },
            })
          }
        />
      </CardContent>
    </Card>
  );
}
