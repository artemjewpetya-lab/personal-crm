// Reading the mail catcher (Mailpit) from tests. No test-framework imports, so Vitest and
// Playwright both use it. The address comes from MAILPIT_URL (see .env.example).

export type CaughtMessage = {
  id: string;
  subject: string;
  from: { name: string; address: string };
  to: string[];
  html: string;
  text: string;
};

function baseUrl(): string {
  const url = process.env.MAILPIT_URL;
  if (!url)
    throw new Error('MAILPIT_URL is not set. Add it to .env (see README, "Первый запуск").');
  return url.replace(/\/+$/, "");
}

function searchFor(address: string): string {
  return `to:"${address.replaceAll('"', "")}"`;
}

/** Deletes every caught message sent to the address, so a test cannot pick up an old link. */
export async function deleteMessagesTo(address: string): Promise<void> {
  const response = await fetch(
    `${baseUrl()}/api/v1/search?query=${encodeURIComponent(searchFor(address))}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error(`Mailpit: cannot delete messages (${response.status})`);
}

/** Every caught message sent to the address, the newest first. */
export async function messagesTo(address: string): Promise<CaughtMessage[]> {
  const response = await fetch(
    `${baseUrl()}/api/v1/search?query=${encodeURIComponent(searchFor(address))}`,
  );
  if (!response.ok) throw new Error(`Mailpit: cannot search (${response.status})`);
  const { messages } = (await response.json()) as { messages: { ID: string }[] };

  return Promise.all(
    messages.map(async ({ ID }) => {
      const detail = await fetch(`${baseUrl()}/api/v1/message/${ID}`);
      if (!detail.ok) throw new Error(`Mailpit: cannot read message ${ID} (${detail.status})`);
      const body = (await detail.json()) as {
        Subject: string;
        From: { Name: string; Address: string };
        To: { Address: string }[];
        HTML: string;
        Text: string;
      };
      return {
        id: ID,
        subject: body.Subject,
        from: { name: body.From.Name, address: body.From.Address },
        to: body.To.map((recipient) => recipient.Address),
        html: body.HTML,
        text: body.Text,
      };
    }),
  );
}

/** Waits until `count` messages for the address have arrived and returns the newest one. */
export async function waitForMessageTo(address: string, count = 1): Promise<CaughtMessage> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const messages = await messagesTo(address);
    if (messages.length >= count) return messages[0];
    if (Date.now() > deadline) {
      throw new Error(`No message to ${address} reached Mailpit in 10 seconds`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** The sign-in link of a caught message (taken from the text version). */
export function signInLinkOf(message: CaughtMessage): string {
  const match = message.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("The message has no link in its text");
  return match[0];
}
