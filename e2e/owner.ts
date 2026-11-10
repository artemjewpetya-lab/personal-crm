// The owner of the app: the user with the email from OWNER_EMAIL (the same setting as in .env).
// Everything that existed before sign-in, and the demo data (pnpm db:seed), belongs to them.

export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

if (!OWNER_EMAIL) {
  throw new Error('OWNER_EMAIL is not set. Add it to .env (see README, "Первый запуск").');
}

/**
 * SQL for the id of the owner, for tests that write straight into the database. `param` is the
 * number of the query parameter that carries OWNER_EMAIL.
 */
export const ownerIdSql = (param: number) => `(select id from users where email = $${param})`;
