// What a Next.js server action sees of the request it runs in. Next.js can only give this
// inside a live request, so tests replace `headers()` (test/setup.ts) with these values.

let current = new Headers();

/** The headers of the request the next server action call "arrives" in. */
export function setRequestHeaders(init: Record<string, string>): void {
  current = new Headers(init);
}

export function resetRequestHeaders(): void {
  current = new Headers();
}

export function currentRequestHeaders(): Headers {
  return new Headers(current);
}
