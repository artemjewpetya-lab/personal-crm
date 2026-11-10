"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/auth";
import {
  INVALID_EMAIL,
  MAIL_NOT_SENT,
  SIGN_IN_ERROR_CODES,
  TOO_MANY_ADDRESSES,
  TOO_MANY_EMAILS,
} from "@/lib/auth/messages";
import { signInEmailSchema } from "@/lib/auth/validation";
import type { ActionResult } from "@/lib/contacts/validation";

// Texts that may be shown under the field, by the code of our own error.
const MESSAGES: Record<string, string> = {
  [SIGN_IN_ERROR_CODES.INVALID_EMAIL]: INVALID_EMAIL,
  [SIGN_IN_ERROR_CODES.TOO_MANY_EMAILS]: TOO_MANY_EMAILS,
  [SIGN_IN_ERROR_CODES.TOO_MANY_ADDRESSES]: TOO_MANY_ADDRESSES,
  [SIGN_IN_ERROR_CODES.MAIL_NOT_SENT]: MAIL_NOT_SENT,
};

/**
 * "Выйти": ends the sign-in on this device only (the other devices stay signed in) and opens
 * the sign-in page.
 */
export async function signOut(): Promise<never> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

/**
 * The sign-in form: asks for a link to be sent to the address. The answer is the same for an
 * address that has signed in before and for a new one. All problems come back as text under
 * the "Почта" field.
 */
export async function requestSignInLink(
  email: string,
): Promise<ActionResult<{ email: string }, "email">> {
  const parsed = signInEmailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, fieldErrors: { email: INVALID_EMAIL } };
  }

  try {
    await auth.api.signInMagicLink({
      body: { email: parsed.data, callbackURL: "/", errorCallbackURL: "/login/expired" },
      headers: await headers(),
    });
    return { ok: true, data: { email: parsed.data } };
  } catch (error) {
    const code = error instanceof APIError ? error.body?.code : undefined;
    if (code && MESSAGES[code]) {
      return { ok: false, fieldErrors: { email: MESSAGES[code] } };
    }
    console.error("Failed to request a sign-in link", error);
    return { ok: false, fieldErrors: { email: MAIL_NOT_SENT } };
  }
}
