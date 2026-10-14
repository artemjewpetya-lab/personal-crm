"use client";

import { PencilIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateContact } from "@/app/contacts/actions";
import { ContactForm } from "@/components/contact-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  ContactFieldName,
  ContactFormValues,
  FieldErrors,
} from "@/lib/contacts/validation";

export function EditContactDialog({
  contactId,
  defaultValues,
}: {
  contactId: string;
  defaultValues: Record<ContactFieldName, string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<ContactFieldName>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setErrors({});
      setFormError(null);
    }
    setOpen(nextOpen);
  }

  function handleSubmit(values: ContactFormValues) {
    startTransition(async () => {
      const result = await updateContact(contactId, values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        return;
      }
      setOpen(false);
      toast.success("Изменения сохранены");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="secondary" />}>
        <PencilIcon data-icon="inline-start" />
        Изменить
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Изменить контакт</DialogTitle>
        </DialogHeader>
        <ContactForm
          defaultValues={defaultValues}
          errors={errors}
          formError={formError}
          onSubmit={handleSubmit}
          footer={
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Отмена
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Сохраняю…" : "Сохранить"}
              </Button>
            </DialogFooter>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
