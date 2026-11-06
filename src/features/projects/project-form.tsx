import {
  type CreateProjectInput,
  createProjectSchema,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_MAX,
} from "@shared/projects";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ProjectFormValues = { name: string; description: string };
type FieldErrors = Partial<Record<keyof ProjectFormValues, string>>;

/**
 * Formulário de criar/editar projeto. Valida com o mesmo schema da API
 * (shared/projects) antes de enviar; erros da API viram toast (QueryClient).
 */
export function ProjectForm({
  defaultValues = { name: "", description: "" },
  submitLabel,
  pending = false,
  onSubmit,
}: {
  defaultValues?: ProjectFormValues;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (values: Required<CreateProjectInput>) => void;
}) {
  const id = useId();
  const [values, setValues] = useState(defaultValues);
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createProjectSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ProjectFormValues;
        fieldErrors[field] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
  }

  function update(field: keyof ProjectFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Nome</Label>
        <Input
          id={`${id}-name`}
          name="name"
          value={values.name}
          maxLength={PROJECT_NAME_MAX}
          autoComplete="off"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
          onChange={(event) => update("name", event.target.value)}
        />
        {errors.name ? (
          <p id={`${id}-name-error`} className="text-destructive text-sm">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-description`}>
          Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          id={`${id}-description`}
          name="description"
          value={values.description}
          maxLength={PROJECT_DESCRIPTION_MAX}
          rows={4}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? `${id}-description-error` : undefined}
          onChange={(event) => update("description", event.target.value)}
        />
        {errors.description ? (
          <p id={`${id}-description-error`} className="text-destructive text-sm">
            {errors.description}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link to="/projects">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
