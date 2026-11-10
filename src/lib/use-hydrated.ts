import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False while the page is drawn on the server and until React has taken it over in the
 * browser, true afterwards. A submit button is kept disabled until then: pressed earlier, the
 * browser would send the form on its own (and put the typed address into the page address).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
