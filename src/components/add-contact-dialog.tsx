"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createContact } from "@/app/contacts/actions";
import { ContactForm } from "@/components/contact-form";
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
import type {
  ContactFieldName,
  ContactFormValues,
  FieldErrors,
} from "@/lib/contacts/validation";

import { revealContactRow } from "./contact-row-reveal";

export function AddContactDialog() {
  const router = useRouter();
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
      const result = await createContact(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.formError ?? null);
        return;
      }

      const { id, name } = result.data;
      setOpen(false);
      toast.success("Контакт добавлен", {
        description: name,
        action: {
          label: "Открыть",
          onClick: () => router.push(`/contacts/${id}`),
        },
      });
      revealContactRow(id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* On phones a regular-size button, so it fits on one line with the heading */}
      <DialogTrigger
        render={
          <Button
            size="lg"
            className="max-sm:h-10 max-sm:gap-2 max-sm:rounded-lg max-sm:px-3.5 max-sm:text-sm max-sm:[&_svg:not([class*='size-'])]:size-4"
          />
        }
      >
        <PlusIcon data-icon="inline-start" />
        Добавить контакт
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Новый контакт</DialogTitle>
          <DialogDescription>
            Обязательно только имя — остальное можно дописать потом.
          </DialogDescription>
        </DialogHeader>
        <ContactForm
          errors={errors}
          formError={formError}
          onSubmit={handleSubmit}
          footer={
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Отмена
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Сохраняю…" : "Добавить"}
              </Button>
            </DialogFooter>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
