// How many contacts a block on the home page ("Скоро день рождения", "Пора связаться") shows
// before «Показать всех (N)» is pressed.
// No server-only imports here: the block (a client component) uses it.

export const HOME_BLOCK_VISIBLE_AT_FIRST = 5;

/**
 * What a home page block shows: the first five contacts and «Показать всех (N)»
 * while there are more and the block is not expanded; everyone otherwise.
 */
export function homeBlockView<T>(
  items: T[],
  expanded: boolean,
): { visible: T[]; showAll: string | null } {
  if (expanded || items.length <= HOME_BLOCK_VISIBLE_AT_FIRST) {
    return { visible: items, showAll: null };
  }
  return {
    visible: items.slice(0, HOME_BLOCK_VISIBLE_AT_FIRST),
    showAll: `Показать всех (${items.length})`,
  };
}
