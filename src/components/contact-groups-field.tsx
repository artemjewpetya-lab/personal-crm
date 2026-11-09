"use client";

import { useState } from "react";

import { GroupListItem } from "@/components/group-list-item";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  NEW_PREFIX,
  createItemName,
  isCreateItem,
  isPendingGroup,
  pickerItems,
  sortGroups,
  type PickerGroup,
} from "@/lib/groups/picker";

/** The groups chosen in the form, split the way the server wants them. */
export function splitChosenGroups(chosen: PickerGroup[]) {
  return {
    groupIds: chosen.filter((group) => !isPendingGroup(group)).map((group) => group.id),
    newGroupNames: chosen.filter(isPendingGroup).map((group) => group.name),
  };
}

/**
 * The «Группы» field of the contact form: chips of the chosen groups and a
 * list to choose more or to create one. A group created here only lives in
 * the form (a «pending» chip) until the form is saved.
 */
export function ContactGroupsField({
  id,
  groups,
  value,
  onChange,
  invalid,
}: {
  id: string;
  /** All saved groups */
  groups: PickerGroup[];
  value: PickerGroup[];
  onChange: (value: PickerGroup[]) => void;
  invalid?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");

  // Saved groups plus the ones created in this form, so they can be unchosen again.
  const options = sortGroups([...groups, ...value.filter(isPendingGroup)]);

  function handleValueChange(next: PickerGroup[]) {
    const created = next.find(isCreateItem);
    if (!created) {
      onChange(next);
      return;
    }
    const name = createItemName(created);
    setQuery("");
    onChange([
      ...next.filter((group) => !isCreateItem(group)),
      { id: `${NEW_PREFIX}${name}`, name },
    ]);
  }

  return (
    <Combobox
      multiple
      items={pickerItems(query, options)}
      value={value}
      onValueChange={handleValueChange}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
      // The list is already filtered (and has the «Создать» item), so no built-in filter.
      filter={null}
      itemToStringLabel={(group) => group.name}
      isItemEqualToValue={(item, other) => item.id === other.id}
    >
      <ComboboxChips ref={anchor} className="min-h-10 rounded-lg bg-card px-2 py-1.5">
        <ComboboxValue>
          {(chosen: PickerGroup[]) => (
            <>
              {sortGroups(chosen).map((group) => (
                <ComboboxChip
                  key={group.id}
                  className="h-7 rounded-full bg-secondary pl-3 text-sm text-secondary-foreground"
                >
                  {group.name}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                aria-invalid={invalid ? true : undefined}
                placeholder={chosen.length === 0 ? "Выберите или создайте группу" : undefined}
                className="h-7 bg-transparent px-1 text-base placeholder:text-muted-foreground md:text-sm"
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor} className="rounded-2xl">
        <ComboboxEmpty>Групп пока нет</ComboboxEmpty>
        <ComboboxList>
          {(group: PickerGroup) => <GroupListItem key={group.id} group={group} />}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
