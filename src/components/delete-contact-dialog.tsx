"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteContact } from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { pluralize } from "@/lib/format";

export function DeleteContactDialog({
  contactId,
  name,
  noteCount,
}: {
  contactId: string;
  name: string;
  noteCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setFormError(null);
    setOpen(nextOpen);
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteContact(contactId);
      if (!result.ok) {
        setFormError(result.formError ?? null);
        return;
      }

      toast.success("Контакт удалён", { description: result.data.name });
      // Replace, so the browser's Back button does not lead to the deleted card.
      router.replace("/");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="destructive" />}>
        <Trash2Icon data-icon="inline-start" />
        Удалить
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить контакт?</DialogTitle>
          <DialogDescription>
            {noteCount > 0
              ? `Контакт «${name}» и ${pluralize(noteCount, ["заметка", "заметки", "заметок"])} удалятся насовсем.`
              : `Контакт «${name}» удалится насовсем.`}{" "}
            Вернуть будет нельзя.
          </DialogDescription>
        </DialogHeader>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
          <Button variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending ? "Удаляю…" : "Удалить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
