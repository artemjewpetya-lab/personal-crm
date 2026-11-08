"use client";

import { SelectContent, SelectItem } from "@/components/ui/select";
import {
  CONTACT_FREQUENCIES,
  CONTACT_FREQUENCY_DETAILS,
  CONTACT_FREQUENCY_NOT_SET_LABEL,
  type ContactFrequency,
} from "@/lib/contacts/frequency";

// "Не задано" is the empty value: a form field then sends "".
export const FREQUENCY_OPTIONS: { value: ContactFrequency | null; label: string }[] = [
  { value: null, label: CONTACT_FREQUENCY_NOT_SET_LABEL },
  ...CONTACT_FREQUENCIES.map((value) => ({
    value,
    label: CONTACT_FREQUENCY_DETAILS[value].label,
  })),
];

/** The list of frequencies, the same in the contact form and in the card. */
export function FrequencyOptions() {
  return (
    // Opens below the button, as in the mockup, rather than over it
    <SelectContent
      alignItemWithTrigger={false}
      align="start"
      className="min-w-48 rounded-button p-1 shadow-lg ring-border"
    >
      {FREQUENCY_OPTIONS.map((option) => (
        <SelectItem
          key={option.label}
          value={option.value}
          className="h-10 rounded-lg pl-2.5 text-base data-selected:bg-muted data-selected:font-semibold md:text-sm [&_svg]:text-primary"
        >
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  );
}
