"use client";

import { CheckIcon } from "lucide-react";
import { useRef, useTransition } from "react";
import { toast } from "sonner";

import { markContacted, undoMarkContacted } from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import { SAVE_FAILED, UNDO_CONTACTED_FAILED } from "@/lib/contacts/messages";
import { cn } from "@/lib/utils";

// How long the message with "Отменить" stays (the usual messages last about 4 seconds).
const UNDO_DURATION_MS = 10_000;

// Runs from the message, which outlives the button: in the block the row is
// gone by then. So no component state here.
async function undo(contactId: string, noteId: string) {
  try {
    const result = await undoMarkContacted(contactId, noteId);
    if (!result.ok) toast.error(result.formError ?? UNDO_CONTACTED_FAILED);
  } catch {
    // The request never reached the server.
    toast.error(UNDO_CONTACTED_FAILED);
  }
}

/** Saves a note "Связались" for the contact: the period starts again from now. */
export function MarkContactedButton({
  contactId,
  className,
}: {
  contactId: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  // A quick second press can come before the button turns inactive;
  // without this it would save a second, identical note.
  const savingRef = useRef(false);

  function handleClick() {
    if (savingRef.current) return;
    savingRef.current = true;

    startTransition(async () => {
      try {
        const result = await markContacted(contactId);
        if (result.ok) {
          const noteId = result.data.id;
          toast.success("Заметка «Связались» сохранена", {
            duration: UNDO_DURATION_MS,
            action: { label: "Отменить", onClick: () => void undo(contactId, noteId) },
          });
        } else {
          toast.error(result.formError ?? SAVE_FAILED);
        }
      } catch {
        // The request never reached the server: no connection, or the server is down.
        toast.error(SAVE_FAILED);
      } finally {
        savingRef.current = false;
      }
    });
  }

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={handleClick}
      className={cn(
        "h-11 px-3 font-medium text-primary hover:text-primary md:h-10 md:px-3.5",
        className,
      )}
    >
      <CheckIcon data-icon="inline-start" />
      Связались
    </Button>
  );
}
