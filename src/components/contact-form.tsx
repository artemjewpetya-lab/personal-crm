"use client";

import { useId, type FormEvent, type ReactNode } from "react";

import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  ContactFieldName,
  ContactFormValues,
  FieldErrors,
} from "@/lib/contacts/validation";

type FieldConfig = {
  name: ContactFieldName;
  label: string;
  placeholder: string;
  type?: "text" | "tel" | "email";
  multiline?: boolean;
  autoComplete?: string;
};

const FIELDS: FieldConfig[] = [
  {
    name: "name",
    label: "Имя",
    placeholder: "Например, Анна Смирнова",
    autoComplete: "off",
  },
  {
    name: "about",
    label: "Кто это",
    placeholder: "Например, бывшая коллега, дизайнер в Яндексе",
    multiline: true,
  },
  {
    name: "howWeMet",
    label: "Откуда знакомы",
    placeholder: "Например, учились вместе в МГУ",
    multiline: true,
  },
  {
    name: "phone",
    label: "Телефон",
    placeholder: "+7 900 123-45-67",
    type: "tel",
    autoComplete: "off",
  },
  {
    name: "email",
    label: "Почта",
    placeholder: "name@example.com",
    type: "email",
    autoComplete: "off",
  },
];

export function readContactForm(form: HTMLFormElement): ContactFormValues {
  const data = new FormData(form);
  const text = (name: ContactFieldName) => String(data.get(name) ?? "");
  return {
    name: text("name"),
    about: text("about"),
    howWeMet: text("howWeMet"),
    phone: text("phone"),
    email: text("email"),
  };
}

export function ContactForm({
  defaultValues,
  errors,
  formError,
  onSubmit,
  footer,
}: {
  defaultValues?: Partial<Record<ContactFieldName, string | null>>;
  errors: FieldErrors<ContactFieldName>;
  formError?: string | null;
  onSubmit: (values: ContactFormValues) => void;
  footer: ReactNode;
}) {
  const idPrefix = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(readContactForm(event.currentTarget));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <FieldGroup className="gap-4">
        {FIELDS.map((field) => {
          const id = `${idPrefix}-${field.name}`;
          const error = errors[field.name];
          const commonProps = {
            id,
            name: field.name,
            placeholder: field.placeholder,
            defaultValue: defaultValues?.[field.name] ?? "",
            "aria-invalid": error ? true : undefined,
            autoFocus: field.name === "name",
          };
          return (
            <Field key={field.name} data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={id}>
                {field.label}
                {field.name === "name" && (
                  <span aria-hidden className="-ml-1 text-destructive">
                    *
                  </span>
                )}
              </FieldLabel>
              {field.multiline ? (
                <Textarea {...commonProps} rows={2} className="min-h-10" />
              ) : (
                <Input
                  {...commonProps}
                  type={field.type ?? "text"}
                  autoComplete={field.autoComplete}
                  required={field.name === "name"}
                />
              )}
              <FieldError>{error}</FieldError>
            </Field>
          );
        })}
      </FieldGroup>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      {footer}
    </form>
  );
}
