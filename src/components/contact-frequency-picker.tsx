"use client";

import { RepeatIcon } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { updateContactFrequency } from "@/app/contacts/actions";
import { FREQUENCY_OPTIONS, FrequencyOptions } from "@/components/frequency-options";
import { Select, SelectTrigger } from "@/components/ui/select";
import { frequencySummary, type ContactFrequency } from "@/lib/contacts/frequency";
import { SAVE_FAILED } from "@/lib/contacts/messages";

/**
 * The frequency in the contact card: "Общаемся раз в месяц", or "Задать
 * частоту" when it is not set. Pressing it opens the same list as the form;
 * the choice is saved right away, by the same rules as saving the form.
 */
export function ContactFrequencyPicker({
  contactId,
  frequency,
}: {
  contactId: string;
  frequency: ContactFrequency | null;
}) {
  const [isPending, startTransition] = useTransition();
  // Shows the choice at once; if saving fails, it goes back to the saved value.
  const [shown, setShown] = useOptimistic(frequency);

  function handleChange(value: ContactFrequency | null) {
    startTransition(async () => {
      setShown(value);
      try {
        const result = await updateContactFrequency(contactId, value ?? "");
        if (!result.ok) toast.error(result.formError ?? SAVE_FAILED);
      } catch {
        // The request never reached the server.
        toast.error(SAVE_FAILED);
      }
    });
  }

  return (
    <Select
      items={FREQUENCY_OPTIONS}
      value={shown}
      onValueChange={handleChange}
      disabled={isPending}
    >
      {/* Looks like the frequency chip from the mockup, with an arrow: it opens a list */}
      <SelectTrigger
        aria-label="Как часто общаться"
        className="gap-1.5 rounded-full border-0 bg-muted py-0 pr-2 pl-2 text-meta font-medium text-primary hover:bg-secondary data-popup-open:bg-secondary [&>svg:last-child]:size-3 [&>svg:last-child]:text-primary"
      >
        <RepeatIcon aria-hidden className="size-3.5" />
        {shown ? frequencySummary(shown) : "Задать частоту"}
      </SelectTrigger>
      <FrequencyOptions />
    </Select>
  );
}
