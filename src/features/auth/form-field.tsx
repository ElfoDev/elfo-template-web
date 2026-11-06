import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Campo com label e mensagem de erro ligada por `aria-describedby`. */
export function FormField({
  id,
  label,
  error,
  ...inputProps
}: React.ComponentProps<typeof Input> & { id: string; label: string; error?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Primeira mensagem do zod por campo (para mostrar abaixo de cada input). */
export function fieldErrors<K extends string>(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0] as K;
    errors[field] ??= issue.message;
  }
  return errors;
}
