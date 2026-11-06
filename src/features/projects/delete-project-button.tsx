import type { Project } from "@shared/projects";
import { Loader2, Trash2 } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteProject } from "./api";

/** Botão "Apagar" com confirmação. */
export function DeleteProjectButton({
  project,
  onDeleted,
}: {
  project: Pick<Project, "id" | "name">;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const deleteProject = useDeleteProject();

  function handleConfirm(event: MouseEvent) {
    // Mantém o diálogo aberto até a API responder.
    event.preventDefault();
    deleteProject.mutate(project.id, {
      onSuccess: () => {
        setOpen(false);
        toast.success(`Projeto "${project.name}" apagado.`);
        onDeleted?.();
      },
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Apagar ${project.name}`}>
          <Trash2 aria-hidden />
          <span className="sr-only sm:not-sr-only">Apagar</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apagar “{project.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            O projeto será removido permanentemente. Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteProject.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleteProject.isPending}
            onClick={handleConfirm}
          >
            {deleteProject.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Apagar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
