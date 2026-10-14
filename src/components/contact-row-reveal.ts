const REVEAL_TIMEOUT_MS = 3000;

export function contactRowId(contactId: string): string {
  return `contact-${contactId}`;
}

/**
 * Scrolls the contact list to a freshly added contact and briefly highlights it.
 * The row appears only after the list re-renders with new server data,
 * so keep looking for it for a short while.
 */
export function revealContactRow(contactId: string): void {
  const startedAt = performance.now();

  const tryReveal = () => {
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
