import { groupSuggestions } from "./suggestions";
import { normalizeGroupName } from "./validation";

/** A group in a picker list: saved (a real id), pending (see NEW_PREFIX) or the «Создать» item. */
export type PickerGroup = { id: string; name: string };

/** Id prefix of the list item «Создать группу «…»» (never saved anywhere). */
export const CREATE_PREFIX = "create:";
/** Id prefix of a group typed into a form: it is created when the form is saved. */
export const NEW_PREFIX = "new:";

export function sortGroups<G extends { name: string }>(groups: G[]): G[] {
  return [...groups].sort(
    (a, b) =>
      normalizeGroupName(a.name).localeCompare(normalizeGroupName(b.name)) ||
      a.name.localeCompare(b.name),
  );
}

/** What the picker shows for the typed text: fitting groups, then «Создать группу «…»». */
export function pickerItems(query: string, groups: PickerGroup[]): PickerGroup[] {
  const { matches, createName } = groupSuggestions(query, groups);
  return createName
    ? [...matches, { id: `${CREATE_PREFIX}${createName}`, name: `Создать группу «${createName}»` }]
    : matches;
}

export function isCreateItem(item: PickerGroup): boolean {
  return item.id.startsWith(CREATE_PREFIX);
}

/** The name behind a «Создать группу «…»» item. */
export function createItemName(item: PickerGroup): string {
  return item.id.slice(CREATE_PREFIX.length);
}

export function isPendingGroup(item: PickerGroup): boolean {
  return item.id.startsWith(NEW_PREFIX);
}
