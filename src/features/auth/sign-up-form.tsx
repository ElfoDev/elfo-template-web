import { PASSWORD_MIN_LENGTH, type SignUpInput, signUpSchema } from "@shared/auth";
import { Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSignUp } from "./api";
import { FormField, fieldErrors } from "./form-field";

type Errors = Partial<Record<keyof SignUpInput, string>>;

/** Criar conta com nome, email e senha. Já entra logado em seguida. */
export function SignUpForm({ onSuccess }: { onSuccess: () => void }) {
  const id = useId();
  const signUp = useSignUp();
  const [values, setValues] = useState<SignUpInput>({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = signUpSchema.safeParse(values);
    if (!result.success) {
      setErrors(fieldErrors(result.error.issues));
      return;
    }
    setErrors({});
    signUp.mutate(result.data, { onSuccess });
  }

  function update(field: keyof SignUpInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-4">
      <FormField
        id={`${id}-name`}
        label="Nome"
        name="name"
        autoComplete="name"
        value={values.name}
        error={errors.name}
        onChange={(event) => update("name", event.target.value)}
      />
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
        autoComplete="new-password"
        placeholder={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`}
        value={values.password}
        error={errors.password}
        onChange={(event) => update("password", event.target.value)}
      />
      <Button type="submit" className="w-full" disabled={signUp.isPending}>
        {signUp.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Criar conta
      </Button>
    </form>
  );
}
