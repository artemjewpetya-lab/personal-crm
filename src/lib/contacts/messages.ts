// Texts of the contact actions, shown to the user. Kept apart from actions.ts:
// a "use server" file may export only server actions, and the "Связались"
// button needs SAVE_FAILED in the browser too, for a request that never arrived.

export const SAVE_FAILED =
  "Не удалось сохранить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
export const DELETE_FAILED =
  "Не удалось удалить. Проверьте, что база данных запущена, и попробуйте ещё раз.";
export const CONTACT_NOT_FOUND = "Контакт не найден — возможно, его уже нет в базе.";

/** The note the "Связались" button saves */
export const CONTACTED_NOTE_BODY = "Связались";

export const UNDO_CONTACTED_FAILED =
  "Не удалось отменить: заметка «Связались» осталась. Проверьте, что база данных запущена.";
