// Postgres error codes the app reacts to.
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// The driver error sits in `cause` when drizzle wraps it.
function errorCode(error: unknown): unknown {
  const cause = error instanceof Error && "cause" in error ? error.cause : error;
  return typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return errorCode(error) === UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return errorCode(error) === FOREIGN_KEY_VIOLATION;
}

// What goes to the server log when the database fails.
//
// Drizzle wraps a failed query in an error whose text holds the SQL and every value of the
// query (names, phones, notes, the sign-in session), and keeps them in its fields too. The error
// of Postgres has `detail` with the same values ("Key (...)=(...)", "Failing row contains ...").
// Only the error itself is logged: its code, its message, and where it happened.
//
// The errors are recognized by their fields, not by their class: Next.js builds parts of the
// server separately, so a class there may be another copy of the same one.

/** Drizzle's wrapper around a failed query. */
function isQueryWrapper(error: object): boolean {
  return "query" in error && typeof error.query === "string" && "params" in error;
}

/** An error reported by Postgres. */
function isPostgresError(error: object): boolean {
  return (
    "severity" in error &&
    typeof error.severity === "string" &&
    "code" in error &&
    typeof error.code === "string"
  );
}

/** The error and the errors that caused it, outermost first. */
function causeChain(error: unknown): object[] {
  const chain: object[] = [];
  let current = error;
  while (typeof current === "object" && current !== null && !chain.includes(current)) {
    chain.push(current);
    current = "cause" in current ? current.cause : undefined;
  }
  return chain;
}

function isDatabaseError(value: unknown): value is Error {
  return (
    value instanceof Error &&
    causeChain(value).some((link) => isQueryWrapper(link) || isPostgresError(link))
  );
}

function messageOf(error: object): string {
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  if (message) return message;
  // A failed connection to "localhost" is an AggregateError with an empty message:
  // one error for each address tried.
  const inner = "errors" in error && Array.isArray(error.errors) ? error.errors : [];
  return inner.map((item: unknown) => (item instanceof Error ? item.message : "")).join("; ");
}

/**
 * The stack lines of the error, without its message. The message comes first in the stack and
 * may span several lines (the SQL, the values with line breaks), so it is cut off as a whole.
 */
function stackLines(error: Error): string {
  const stack = error.stack ?? "";
  const head = String(error);
  return stack.startsWith(head) ? stack.slice(head.length) : "";
}

/** The database error for the log: the code and message of Postgres or the driver, and the stack. */
export function describeDatabaseError(error: unknown): string {
  const chain = causeChain(error);
  // The error itself is the deepest one: the one Postgres or the driver reported.
  const root = chain.at(-1);
  const code = root && "code" in root && typeof root.code === "string" ? ` ${root.code}` : "";
  const message = root ? messageOf(root) : "";
  const stack = error instanceof Error ? stackLines(error) : "";
  return `Database error${code}: ${message}${stack}`;
}

/** A value about to be logged: a database error becomes its description, the rest stays. */
export function withoutQueryValues(value: unknown): unknown {
  return isDatabaseError(value) ? describeDatabaseError(value) : value;
}

type LogTarget = { error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };

/**
 * From now on `target.error` and `target.warn` log database errors without the query and its
 * values. src/instrumentation.ts does it for `console` when the server starts: everything the
 * app, Next.js and Better Auth log passes through console.
 */
export function redactDatabaseErrors(target: LogTarget): void {
  for (const level of ["error", "warn"] as const) {
    const write = target[level];
    target[level] = (...args: unknown[]) => write.apply(target, args.map(withoutQueryValues));
  }
}
