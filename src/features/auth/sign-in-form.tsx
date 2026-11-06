import { type SignInInput, signInSchema } from "@shared/auth";
import { Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSignIn } from "./api";
import { FormField, fieldErrors } from "./form-field";

type Errors = Partial<Record<keyof SignInInput, string>>;

/** Entrar com email e senha. Erros da API (senha errada…) viram toast. */
export function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const id = useId();
  const signIn = useSignIn();
  const [values, setValues] = useState<SignInInput>({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = signInSchema.safeParse(values);
    if (!result.success) {
      setErrors(fieldErrors(result.error.issues));
      return;
    }
    setErrors({});
    signIn.mutate(result.data, { onSuccess });
  }

  function update(field: keyof SignInInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4">
      <FormField
        id={`${id}-email`}
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={values.email}
        error={errors.email}
        onChange={(event) => update("email", event.target.value)}
      />
      <FormField
        id={`${id}-password`}
        label="Senha"
        type="password"
        name="password"
        autoComplete="current-password"
        value={values.password}
        error={errors.password}
        onChange={(event) => update("password", event.target.value)}
      />
      <Button type="submit" className="w-full" disabled={signIn.isPending}>
        {signIn.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Entrar
      </Button>
    </form>
  );
}
