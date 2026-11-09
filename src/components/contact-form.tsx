"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { ContactGroupsField, splitChosenGroups } from "@/components/contact-groups-field";
import { FREQUENCY_OPTIONS, FrequencyOptions } from "@/components/frequency-options";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isContactFrequency } from "@/lib/contacts/frequency";
import type { PickerGroup } from "@/lib/groups/picker";
import type {
  ContactFieldName,
  ContactFormValues,
  FieldErrors,
} from "@/lib/contacts/validation";

type FieldConfig = {
  name: Exclude<ContactFieldName, "contactFrequency" | "groups">;
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
  const text = (name: Exclude<ContactFieldName, "groups">) => String(data.get(name) ?? "");
  return {
    name: text("name"),
    about: text("about"),
    howWeMet: text("howWeMet"),
    phone: text("phone"),
    email: text("email"),
    contactFrequency: text("contactFrequency"),
  };
}

export function ContactForm({
  defaultValues,
  groups,
  defaultGroups = [],
  errors,
  formError,
  onSubmit,
  footer,
}: {
  defaultValues?: Partial<Record<Exclude<ContactFieldName, "groups">, string | null>>;
  /** All saved groups, to choose from */
  groups: PickerGroup[];
  /** The groups the contact is in when the form opens */
  defaultGroups?: PickerGroup[];
  errors: FieldErrors<ContactFieldName>;
  formError?: string | null;
  onSubmit: (values: ContactFormValues) => void;
  footer: ReactNode;
}) {
  const idPrefix = useId();
  // Groups chosen or created here stay in the form until it is saved.
  const [chosenGroups, setChosenGroups] = useState(defaultGroups);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ ...readContactForm(event.currentTarget), ...splitChosenGroups(chosenGroups) });
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
        <FrequencyField
          id={`${idPrefix}-contactFrequency`}
          defaultValue={defaultValues?.contactFrequency}
          error={errors.contactFrequency}
        />
        <Field data-invalid={errors.groups ? true : undefined}>
          <FieldLabel htmlFor={`${idPrefix}-groups`}>Группы</FieldLabel>
          <ContactGroupsField
            id={`${idPrefix}-groups`}
            groups={groups}
            value={chosenGroups}
            onChange={setChosenGroups}
            invalid={Boolean(errors.groups)}
          />
          <FieldError>{errors.groups}</FieldError>
        </Field>
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

function FrequencyField({
  id,
  defaultValue,
  error,
}: {
  id: string;
  defaultValue: string | null | undefined;
  error: string | undefined;
}) {
  // Taken once, when the form opens. After saving, the card re-renders with the
  // new value while the dialog is still closing, and Select warns if its
  // starting value changes after it has started.
  const [initialValue] = useState(() =>
    isContactFrequency(defaultValue) ? defaultValue : null,
  );

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Как часто общаться</FieldLabel>
      <Select
        id={id}
        name="contactFrequency"
        items={FREQUENCY_OPTIONS}
        defaultValue={initialValue}
      >
        <SelectTrigger
          aria-invalid={error ? true : undefined}
          className="h-10 w-full rounded-lg bg-card pr-3 pl-3.5 text-base data-popup-open:border-ring md:text-sm data-[size=default]:h-10"
        >
          <SelectValue />
        </SelectTrigger>
        <FrequencyOptions />
      </Select>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
