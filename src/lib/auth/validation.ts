import { z } from "zod";

import { INVALID_EMAIL } from "./messages";

/**
 * The one rule for an address typed into the sign-in form: spaces at the ends are removed,
 * capital letters become small ones, and what is left must look like an address.
 * The form action and the Better Auth hook both use it, so a request that skips the form
 * gets the same answer.
 */
export const signInEmailSchema = z
  .string(INVALID_EMAIL)
  .trim()
  .toLowerCase()
  .pipe(z.email(INVALID_EMAIL));
