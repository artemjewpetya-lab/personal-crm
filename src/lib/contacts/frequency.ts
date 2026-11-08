// How often the owner wants to keep in touch with a contact.
// The single source of the values: the database enum, the form options,
// the card label and the Postgres interval used to decide who is due.
// No server-only imports here: the form (a client component) uses it too.

export const CONTACT_FREQUENCIES = ["week", "month", "quarter", "year"] as const;

export type ContactFrequency = (typeof CONTACT_FREQUENCIES)[number];

export const CONTACT_FREQUENCY_NOT_SET_LABEL = "Не задано";

export const CONTACT_FREQUENCY_DETAILS: Record<
  ContactFrequency,
  { label: string; interval: string }
> = {
  week: { label: "Раз в неделю", interval: "7 days" },
  month: { label: "Раз в месяц", interval: "1 month" },
  quarter: { label: "Раз в квартал", interval: "3 months" },
  year: { label: "Раз в год", interval: "1 year" },
};

export function isContactFrequency(value: unknown): value is ContactFrequency {
  return (CONTACT_FREQUENCIES as readonly unknown[]).includes(value);
}

/** "month" -> "Общаемся раз в месяц", shown in the contact card */
export function frequencySummary(frequency: ContactFrequency): string {
  return `Общаемся ${CONTACT_FREQUENCY_DETAILS[frequency].label.toLowerCase()}`;
}
