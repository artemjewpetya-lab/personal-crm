export type SmtpSettings = {
  host: string;
  port: number;
  /** Encrypted from the first byte: that is what port 465 means. */
  secure: boolean;
  /** Absent when SMTP_USER is empty (the local mail catcher needs no login). */
  auth?: { user: string; pass: string };
};

/**
 * Where the app hands over its emails. Only the settings decide: the mail catcher (Mailpit) on
 * the owner's computer and in tests, the real mail service on the server. The code has no
 * "if server" branch.
 */
export function readSmtpSettings(
  env: Record<string, string | undefined> = process.env,
): SmtpSettings {
  const host = env.SMTP_HOST?.trim();
  if (!host) throw new Error("SMTP_HOST is not set. Add it to .env (see README).");

  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_PORT is not set or is not a port number. Add it to .env (see README).");
  }

  const settings: SmtpSettings = { host, port, secure: port === 465 };
  if (env.SMTP_USER) {
    settings.auth = { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" };
  }
  return settings;
}
