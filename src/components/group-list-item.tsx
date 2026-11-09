import { CheckIcon, PlusIcon } from "lucide-react";

import { ComboboxItem } from "@/components/ui/combobox";
import { isCreateItem, type PickerGroup } from "@/lib/groups/picker";

/**
 * One row of a group list: a group with a check box (filled when it is chosen)
 * or the «Создать группу «…»» item. Used by the card and by the contact form.
 */
export function GroupListItem({ group }: { group: PickerGroup }) {
  return (
    <ComboboxItem
      value={group}
      showIndicator={false}
      className="h-9 gap-2.5 px-2.5 pr-2.5 font-medium"
    >
      {isCreateItem(group) ? (
        <span className="flex items-center gap-2.5 font-semibold text-primary">
          <PlusIcon aria-hidden className="size-4" />
          {group.name}
        </span>
      ) : (
        <>
          <span
            aria-hidden
            className="flex size-4.5 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-input bg-card group-data-[selected]/combobox-item:border-primary group-data-[selected]/combobox-item:bg-primary"
          >
            <CheckIcon className="size-3 text-primary-foreground! opacity-0 group-data-[selected]/combobox-item:opacity-100" />
          </span>
          {group.name}
        </>
      )}
    </ComboboxItem>
  );
}
