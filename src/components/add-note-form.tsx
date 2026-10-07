"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { addNote } from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function AddNoteForm({ contactId }: { contactId: string }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");

    startTransition(async () => {
      const result = await addNote(contactId, { body });
      if (!result.ok) {
        setError(result.fieldErrors?.body ?? result.formError ?? null);
        return;
      }
      setError(null);
      form.reset();
      toast.success("Заметка сохранена");
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-3">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id} className="sr-only">
          Новая заметка
        </FieldLabel>
        <Textarea
          id={id}
          name="body"
          rows={3}
          placeholder="Что обсудили, о чём договорились…"
          aria-invalid={error ? true : undefined}
          className="min-h-20"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
        />
        <FieldError>{error}</FieldError>
      </Field>
      <div className="flex items-center justify-end gap-3">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Ctrl + Enter — сохранить
        </span>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохраняю…" : "Добавить заметку"}
        </Button>
      </div>
    </form>
  );
}
