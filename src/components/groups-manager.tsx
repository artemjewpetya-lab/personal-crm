"use client";

import { PencilIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { createGroup, deleteGroup, renameGroup } from "@/app/groups/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DELETE_FAILED, SAVE_FAILED } from "@/lib/contacts/messages";
import type { ActionResult } from "@/lib/contacts/validation";
import { pluralize } from "@/lib/format";
import { GROUP_DELETED } from "@/lib/groups/messages";
import type { GroupListItem } from "@/lib/groups/queries";

const CONTACT_WORDS: [string, string, string] = ["контакт", "контакта", "контактов"];

/**
 * The «Группы» page: the list of groups with the number of contacts, and
 * creating, renaming and deleting. A field opens right in the list; the list
 * itself comes from the server and is refreshed by the actions.
 */
export function GroupsManager({ groups }: { groups: GroupListItem[] }) {
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GroupListItem | null>(null);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-heading text-h2 font-semibold md:text-h1">Группы</h1>
        <Button
          size="lg"
          className="max-sm:h-10 max-sm:gap-2 max-sm:rounded-lg max-sm:px-3.5 max-sm:text-sm max-sm:[&_svg:not([class*='size-'])]:size-4"
          onClick={() => {
            setRenamingId(null);
            setCreating(true);
          }}
          disabled={creating}
        >
          <PlusIcon data-icon="inline-start" />
          Создать группу
        </Button>
      </div>

      {groups.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-2 rounded-card bg-card px-6 py-16 text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-icon-box bg-primary text-primary-foreground">
            <UsersIcon aria-hidden className="size-5.5" />
          </span>
          <p className="font-heading font-semibold">Групп пока нет</p>
          <p className="text-sm text-muted-foreground">
            Нажмите «Создать группу», чтобы собрать людей по кругам общения.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card bg-card [&>li]:border-t [&>li:first-child]:border-t-0">
          {creating && (
            <li className="bg-muted">
              <NameForm
                label="Название новой группы"
                submitLabel="Создать"
                pendingLabel="Создаю…"
                initialName=""
                onSubmit={(name) => createGroup(name)}
                onDone={() => setCreating(false)}
              />
            </li>
          )}
          {groups.map((group) => (
            <li key={group.id} className={renamingId === group.id ? "bg-muted" : undefined}>
              {renamingId === group.id ? (
                <NameForm
                  label="Новое название группы"
                  submitLabel="Сохранить"
                  pendingLabel="Сохраняю…"
                  initialName={group.name}
                  onSubmit={(name) => renameGroup(group.id, name)}
                  onDone={() => setRenamingId(null)}
                />
              ) : (
                <GroupRow
                  group={group}
                  onRename={() => {
                    setCreating(false);
                    setRenamingId(group.id);
                  }}
                  onDelete={() => setDeleting(group)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <DeleteGroupDialog group={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function GroupRow({
  group,
  onRename,
  onDelete,
}: {
  group: GroupListItem;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-h-16 items-center gap-1 py-2 pr-2 pl-5 sm:gap-4 sm:pr-4">
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-4">
        <Link
          href={`/?group=${group.id}`}
          className="min-w-0 truncate font-semibold decoration-ochre decoration-2 underline-offset-4 hover:underline sm:flex-1"
        >
          {group.name}
        </Link>
        <span className="text-sm text-muted-foreground sm:w-28">
          {pluralize(group.contactCount, CONTACT_WORDS)}
        </span>
      </div>
      <Button
        variant="ghost"
        aria-label={`Переименовать группу «${group.name}»`}
        className="max-sm:size-11 max-sm:px-0"
        onClick={onRename}
      >
        <PencilIcon data-icon="inline-start" />
        <span className="max-sm:sr-only">Переименовать</span>
      </Button>
      <Button
        variant="ghost"
        aria-label={`Удалить группу «${group.name}»`}
        className="text-destructive hover:text-destructive max-sm:size-11 max-sm:px-0"
        onClick={onDelete}
      >
        <Trash2Icon data-icon="inline-start" />
        <span className="max-sm:sr-only">Удалить</span>
      </Button>
    </div>
  );
}

/** The field for a group name with its buttons: used for creating and renaming. */
function NameForm({
  label,
  submitLabel,
  pendingLabel,
  initialName,
  onSubmit,
  onDone,
}: {
  label: string;
  submitLabel: string;
  pendingLabel: string;
  initialName: string;
  onSubmit: (name: string) => Promise<ActionResult<unknown, "name">>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await onSubmit(name);
        if (result.ok) {
          onDone();
          return;
        }
        if (result.fieldErrors?.name) {
          setError(result.fieldErrors.name);
          return;
        }
        // The group is gone or saving failed: the field stays, the reason is shown.
        toast.error(result.formError ?? SAVE_FAILED);
      } catch {
        // The request never reached the server.
        toast.error(SAVE_FAILED);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:px-5"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Input
          aria-label={label}
          aria-invalid={error ? true : undefined}
          autoFocus
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onDone();
          }}
          className="h-11 sm:h-10"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-2 max-sm:*:flex-1">
        <Button type="submit" disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

function DeleteGroupDialog({
  group,
  onClose,
}: {
  group: GroupListItem | null;
  onClose: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // The text stays while the dialog fades out after the group was deleted.
  const [lastGroup, setLastGroup] = useState(group);
  if (group && group !== lastGroup) {
    setLastGroup(group);
    setFormError(null);
  }
  const shown = group ?? lastGroup;

  function handleDelete() {
    if (!group) return;
    startTransition(async () => {
      try {
        const result = await deleteGroup(group.id);
        if (!result.ok) {
          setFormError(result.formError ?? null);
          return;
        }
        toast.success(GROUP_DELETED);
        onClose();
      } catch {
        setFormError(DELETE_FAILED);
      }
    });
  }

  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить группу «{shown?.name}»?</DialogTitle>
          <DialogDescription>
            Контакты останутся, пропадёт только группа. Сейчас в ней{" "}
            {pluralize(shown?.contactCount ?? 0, CONTACT_WORDS)}.
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
