"use client";

import { useState } from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MONTH_NAMES } from "@/lib/contacts/birthdays";

export type BirthdayDefault = { day: number; month: number; year: number | null };

// «Не указан» is the empty value: the form then sends "" for the month.
const MONTH_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "Не указан" },
  ...MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })),
];

const CONTROL_CLASS = "h-10 rounded-lg bg-card text-base md:text-sm";

/**
 * «Дата рождения»: day, month and year in one row, one error under all three.
 * The parts are plain form fields (birthdayDay, birthdayMonth, birthdayYear); the server checks them.
 * The year is a text field, not type="number": that one changes with the mouse wheel and accepts "e".
 */
export function BirthdayField({
  id,
  defaultValue,
  error,
}: {
  id: string;
  defaultValue: BirthdayDefault | null | undefined;
  error: string | undefined;
}) {
  // Taken once, when the form opens. After saving, the card re-renders with the new date
  // while the dialog is still closing, and Select warns if its starting value changes.
  const [initial] = useState(() => ({
    day: defaultValue ? String(defaultValue.day) : "",
    month: defaultValue ? String(defaultValue.month) : null,
    year: defaultValue?.year ? String(defaultValue.year) : "",
  }));
  // Only to grey out «Не указан»; the Select itself keeps the value
  const [month, setMonth] = useState<string | null>(initial.month);
  const labelId = `${id}-label`;
  const invalid = error ? true : undefined;

  return (
    <Field aria-labelledby={labelId} data-invalid={invalid}>
      <FieldLabel id={labelId} htmlFor={`${id}-day`}>
        Дата рождения
      </FieldLabel>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_6rem] gap-2">
        <Input
          id={`${id}-day`}
          name="birthdayDay"
          aria-label="День рождения: число"
          aria-invalid={invalid}
          inputMode="numeric"
          maxLength={2}
          autoComplete="off"
          placeholder="День"
          defaultValue={initial.day}
          className={CONTROL_CLASS}
        />
        <Select
          name="birthdayMonth"
          items={MONTH_OPTIONS}
          defaultValue={initial.month}
          onValueChange={setMonth}
        >
          <SelectTrigger
            aria-label="День рождения: месяц"
            aria-invalid={invalid}
            className={`${CONTROL_CLASS} w-full pr-3 pl-3.5 data-popup-open:border-ring data-[size=default]:h-10 ${month === null ? "text-muted-foreground" : ""}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            alignItemWithTrigger={false}
            align="start"
            className="min-w-44 rounded-button p-1 shadow-lg ring-border"
          >
            {MONTH_OPTIONS.map((option) => (
              <SelectItem
                key={option.label}
                value={option.value}
                className="h-10 rounded-lg pl-2.5 text-base data-selected:bg-muted data-selected:font-semibold md:text-sm [&_svg]:text-primary"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={`${id}-year`}
          name="birthdayYear"
          aria-label="День рождения: год"
          aria-invalid={invalid}
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          placeholder="Год"
          defaultValue={initial.year}
          className={CONTROL_CLASS}
        />
      </div>
      <FieldError>{error}</FieldError>
    </Field>
  );
}
