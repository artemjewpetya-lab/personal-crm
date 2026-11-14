// Runs once when the server starts, before it answers any request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // A failed database query is logged without the query and its values: names, phones,
    // notes and sign-in sessions stay out of the server log. Covers what the app, Next.js
    // (a page that failed to load) and Better Auth (the sign-in check) log.
    const { redactDatabaseErrors } = await import("@/db/errors");
    redactDatabaseErrors(console);
  }
}
