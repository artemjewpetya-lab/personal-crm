import { z } from "zod";

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
});

export const noteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Заметка пустая — напишите хотя бы пару слов")
    .max(5000, "Заметка слишком длинная — не больше 5000 символов"),
});

export const contactIdSchema = z.uuid();

export type ContactFormValues = z.input<typeof contactInputSchema>;
export type ContactFieldName = keyof ContactFormValues;
export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export type ActionResult<Data, Field extends string = never> =
  | { ok: true; data: Data }
  | { ok: false; fieldErrors?: FieldErrors<Field>; formError?: string };

export function firstFieldErrors<Field extends string>(
  error: z.ZodError,
): FieldErrors<Field> {
  const { fieldErrors } = z.flattenError(error) as {
    fieldErrors: Partial<Record<Field, string[]>>;
  };
  const result: FieldErrors<Field> = {};
  for (const [field, messages] of Object.entries(fieldErrors) as [
    Field,
    string[] | undefined,
  ][]) {
    if (messages?.[0]) result[field] = messages[0];
  }
  return result;
}
