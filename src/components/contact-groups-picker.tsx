"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addContactToGroup,
  createGroupForContact,
  removeContactFromGroup,
} from "@/app/groups/actions";
import { GroupListItem } from "@/components/group-list-item";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxList,
} from "@/components/ui/combobox";
import { SAVE_FAILED } from "@/lib/contacts/messages";
import {
  createItemName,
  isCreateItem,
  pickerItems,
  sortGroups,
  type PickerGroup,
} from "@/lib/groups/picker";

type Change = { type: "add"; group: PickerGroup } | { type: "remove"; id: string };

type Shown = { selected: PickerGroup[]; all: PickerGroup[] };

function applyChange(state: Shown, change: Change): Shown {
  if (change.type === "remove") {
    return { ...state, selected: state.selected.filter((group) => group.id !== change.id) };
  }
  const { group } = change;
  return {
    selected: sortGroups([...state.selected.filter((item) => item.id !== group.id), group]),
    all: state.all.some((item) => item.id === group.id)
      ? state.all
      : sortGroups([...state.all, group]),
  };
}

/**
 * The groups in the contact card header: the chips of the groups, or «Добавить
 * в группу». Pressing opens the list of all groups with check marks; every
 * mark is saved right away (one group per request), the screen shows it at once
 * and takes it back with a message if saving fails. The list stays open.
 */
export function ContactGroupsPicker({
  contactId,
  contactGroups,
  allGroups,
}: {
  contactId: string;
  contactGroups: PickerGroup[];
  allGroups: PickerGroup[];
}) {
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  // Shows the change at once; if saving fails, it goes back to the saved groups.
  const [shown, change] = useOptimistic<Shown, Change>(
    { selected: contactGroups, all: allGroups },
    applyChange,
  );

  function save(optimistic: Change, request: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      change(optimistic);
      try {
        const result = await request();
        if (!result.ok) toast.error(result.message ?? SAVE_FAILED);
      } catch {
        // The request never reached the server.
        toast.error(SAVE_FAILED);
      }
    });
  }

  function handleValueChange(next: PickerGroup[]) {
    const created = next.find(isCreateItem);
    if (created) {
      const name = createItemName(created);
      setQuery("");
      save({ type: "add", group: { id: created.id, name } }, async () => {
        const result = await createGroupForContact(contactId, name);
        return result.ok
          ? { ok: true }
          : { ok: false, message: result.formError ?? result.fieldErrors?.name };
      });
      return;
    }

    for (const group of next) {
      if (shown.selected.some((item) => item.id === group.id)) continue;
      save({ type: "add", group }, async () => {
        const result = await addContactToGroup(contactId, group.id);
        return { ok: result.ok, message: result.ok ? undefined : result.formError };
      });
    }
    for (const group of shown.selected) {
      if (next.some((item) => item.id === group.id)) continue;
      save({ type: "remove", id: group.id }, async () => {
        const result = await removeContactFromGroup(contactId, group.id);
        return { ok: result.ok, message: result.ok ? undefined : result.formError };
      });
    }
  }

  const hasGroups = shown.selected.length > 0;

  return (
    <Combobox
      multiple
      items={pickerItems(query, shown.all)}
      value={shown.selected}
      onValueChange={handleValueChange}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
      // The list is already filtered (and has the «Создать» item), so no built-in filter.
      filter={null}
      itemToStringLabel={(group) => group.name}
      isItemEqualToValue={(item, value) => item.id === value.id}
    >
      <ComboboxPrimitive.Trigger
        aria-label={hasGroups ? "Группы контакта" : "Добавить в группу"}
        className={
          hasGroups
            ? "inline-flex min-h-8 items-center gap-1.5 rounded-full border border-transparent bg-card py-0.5 pr-2 pl-0.5 text-meta outline-none hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring data-popup-open:border-ring"
            : "inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-ochre px-2.5 text-meta font-medium text-primary outline-none hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring data-popup-open:bg-muted"
        }
      >
        {hasGroups ? (
          <>
            <span className="flex flex-wrap gap-1">
              {shown.selected.map((group) => (
                <span
                  key={group.id}
                  className="inline-flex h-7 items-center rounded-full bg-secondary px-3 font-medium text-secondary-foreground"
                >
                  {group.name}
                </span>
              ))}
            </span>
            <ChevronDownIcon aria-hidden className="size-3 text-primary" />
          </>
        ) : (
          <>
            <PlusIcon aria-hidden className="size-3.5" />
            Добавить в группу
          </>
        )}
      </ComboboxPrimitive.Trigger>
      <ComboboxContent
        align="start"
        className="w-72 max-w-[calc(100vw-2.5rem)] rounded-2xl"
      >
        <ComboboxInput
          showTrigger={false}
          placeholder="Найти или создать группу"
          aria-label="Найти или создать группу"
        />
        <ComboboxEmpty>Групп пока нет</ComboboxEmpty>
        <ComboboxList>
          {(group: PickerGroup) => <GroupListItem key={group.id} group={group} />}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
