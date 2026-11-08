// The whole list is sent again after a contact is added. On a slow connection
// or a busy server it can arrive tens of seconds after the "added" message.
const REVEAL_TIMEOUT_MS = 60_000;

export function contactRowId(contactId: string): string {
  return `contact-${contactId}`;
}

/**
 * Scrolls the contact list to a freshly added contact and briefly highlights it.
 * The row appears only after the list re-renders with new server data,
 * so keep looking for it until it shows up. Stop if the user leaves the list:
 * coming back to it later should not jump to the row.
 */
export function revealContactRow(contactId: string): void {
  const startedAt = performance.now();
  const startedOn = location.pathname;

  const tryReveal = () => {
    if (location.pathname !== startedOn) return;
    const row = document.getElementById(contactRowId(contactId));
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      // The color is a design token from globals.css
      const highlight = getComputedStyle(row).getPropertyValue("--highlight");
      row.animate(
        [{ backgroundColor: highlight }, { backgroundColor: "transparent" }],
        { duration: 2500, easing: "ease-out" },
      );
      return;
    }
    if (performance.now() - startedAt < REVEAL_TIMEOUT_MS) {
      requestAnimationFrame(tryReveal);
    }
  };

  requestAnimationFrame(tryReveal);
}
