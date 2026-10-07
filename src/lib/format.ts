const pluralRules = new Intl.PluralRules("ru-RU");
const numberFormat = new Intl.NumberFormat("ru-RU");
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** pluralize(5, ["контакт", "контакта", "контактов"]) -> "5 контактов" */
export function pluralize(
  value: number,
  [one, few, many]: [one: string, few: string, many: string],
): string {
  const rule = pluralRules.select(value);
  const word = rule === "one" ? one : rule === "few" ? few : many;
  return `${numberFormat.format(value)} ${word}`;
}

export function formatDateTime(date: Date): string {
  return dateTimeFormat.format(date);
}

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

/** "+7 900 123-45-67" -> "tel:+79001234567" */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
