// Texts of the group screens and actions, shown to the user. In a separate file
// because a "use server" file may export only server actions, and the browser
// needs these texts too.

export const GROUP_NAME_REQUIRED = "Укажите название группы";
export const GROUP_NAME_TOO_LONG = "Название слишком длинное — не больше 50 символов";
export const GROUP_NOT_FOUND = "Группа не найдена — возможно, её уже удалили.";
export const GROUP_DELETED = "Группа удалена";

/** `name` is spelled as the existing group is, not as the user typed it. */
export function groupAlreadyExists(name: string): string {
  return `Группа «${name}» уже есть`;
}
