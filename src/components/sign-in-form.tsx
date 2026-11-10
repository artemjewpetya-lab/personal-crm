"use client";

import { CircleCheckIcon } from "lucide-react";
import { useId, useState, useTransition, type FormEvent } from "react";

import { requestSignInLink } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * The sign-in form: an address and "Получить ссылку". After sending, the message stays under
 * the form and the form stays too, so a link can be asked for again (within the limits).
 */
export function SignInForm() {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");

    startTransition(async () => {
      const result = await requestSignInLink(email);
      if (result.ok) {
        setError(null);
        setSentTo(result.data.email);
      } else {
        setSentTo(null);
        setError(result.fieldErrors?.email ?? result.formError ?? null);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>Почта</FieldLabel>
        <Input
          id={id}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-11"
        />
        <FieldError id={`${id}-error`}>{error}</FieldError>
      </Field>

      <Button type="submit" size="lg" disabled={isPending || !hydrated} className="w-full">
        {isPending ? "Отправляю…" : "Получить ссылку"}
      </Button>

      {sentTo && (
        <div role="status" className="flex items-start gap-3 rounded-tile bg-muted px-4 py-3.5">
          <CircleCheckIcon aria-hidden className="mt-px size-5 shrink-0 text-primary" />
          <p className="min-w-0 text-sm break-words">
            Ссылка для входа отправлена на <span className="font-semibold">{sentTo}</span>
          </p>
        </div>
      )}
    </form>
  );
}
