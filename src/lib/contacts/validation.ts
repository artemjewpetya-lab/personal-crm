import { z } from "zod";

import { groupNameSchema } from "../groups/validation";
import { CONTACT_FREQUENCIES } from "./frequency";

// Validation is shared by the forms (field names, error shape) and the server
// actions (the actual check). Messages are shown to the user, so they are in Russian.

function optionalText(maxLength: number, tooLongMessage: string) {
  return z
    .string()
    .trim()
    .max(maxLength, tooLongMessage)
    .transform((value) => (value === "" ? null : value));
}

const emailFormat = z.email();

export const contactInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Укажите имя")
    .max(200, "Имя слишком длинное — не больше 200 символов"),
  about: optionalText(500, "Слишком длинно — не больше 500 символов"),
  howWeMet: optionalText(500, "Слишком длинно — не больше 500 символов"),
  phone: optionalText(50, "Слишком длинный телефон — не больше 50 символов"),
  email: z
    .string()
    .trim()
    .max(254, "Слишком длинный адрес почты")
    .refine(
      (value) => value === "" || emailFormat.safeParse(value).success,
      "Проверьте адрес почты — например, name@example.com",
    )
    .transform((value) => (value === "" ? null : value.toLowerCase())),
  // The form sends "" for "Не задано".
  contactFrequency: z
    .string()
    .pipe(
      z.enum(["", ...CONTACT_FREQUENCIES], {
        error: "Выберите, как часто общаться, из списка",
      }),
    )
    .transform((value) => (value === "" ? null : value)),
  // Groups of the contact. Not sent at all: the groups stay as they are.
  // Sent (even empty): the contact ends up in exactly these groups.
  groupIds: z.array(z.uuid()).optional(),
  // Names typed into the form for groups that do not exist yet. They are created
  // when the form is saved, so a form closed without saving leaves nothing behind.
  newGroupNames: z.array(groupNameSchema).optional(),
});

export const noteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Заметка пустая — напишите хотя бы пару слов")
    .max(5000, "Заметка слишком длинная — не больше 5000 символов"),
});

export const contactIdSchema = z.uuid();
export const noteIdSchema = z.uuid();

export type ContactFormValues = z.input<typeof contactInputSchema>;
// Both group inputs report their errors under one field: «Группы».
export type ContactFieldName =
  Exclude<keyof ContactFormValues, "groupIds" | "newGroupNames"> | "groups";
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export type ActionResult<Data, Field extends string = never> =
  { ok: true; data: Data } | { ok: false; fieldErrors?: FieldErrors<Field>; formError?: string };

export function firstFieldErrors<Field extends string>(error: z.ZodError): FieldErrors<Field> {
  const { fieldErrors } = z.flattenError(error) as {
    fieldErrors: Partial<Record<Field, string[]>>;
  };
  const result: FieldErrors<Field> = {};
  for (const [field, messages] of Object.entries(fieldErrors) as [Field, string[] | undefined][]) {
    if (messages?.[0]) result[field] = messages[0];
  }
  return result;
}

/** Like firstFieldErrors, with the errors of the group inputs under «groups». */
export function contactFieldErrors(error: z.ZodError): FieldErrors<ContactFieldName> {
  const { groupIds, newGroupNames, ...rest } = firstFieldErrors<
    ContactFieldName | "groupIds" | "newGroupNames"
  >(error);
  const groups = groupIds ?? newGroupNames;
  return groups ? { ...rest, groups } : rest;
}
