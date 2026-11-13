import "server-only";

import nodemailer from "nodemailer";

import { buildSignInEmail } from "./sign-in-email";
import { readSmtpSettings } from "./transport";

/** The sender's name is the same everywhere; the address comes from MAIL_FROM_ADDRESS. */
const SENDER_NAME = "Личная CRM";

/**
 * Sends the sign-in email through the mail server from the settings (SMTP_*).
 * Throws when the message was not handed over, for example when the mail server is down.
 */
export async function sendSignInEmail(to: string, url: string): Promise<void> {
  const address = process.env.MAIL_FROM_ADDRESS;
  if (!address) throw new Error("MAIL_FROM_ADDRESS is not set. Add it to .env (see README).");

  const transport = nodemailer.createTransport({
    ...readSmtpSettings(),
    // A dead mail server must not keep the person waiting on the sign-in page.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  // APP_ENV is set by the deploy scripts (deploy/common.sh): "staging" on the test stand.
  const { subject, html, text } = buildSignInEmail(url, {
    testStand: process.env.APP_ENV === "staging",
  });
  try {
    await transport.sendMail({
      from: { name: SENDER_NAME, address },
      to,
      subject,
      html,
      text,
    });
  } finally {
    transport.close();
  }
}
