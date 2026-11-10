import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/auth";

// The link from the email (/api/auth/magic-link/verify) and every other request to Better Auth.
export const { GET, POST } = toNextJsHandler(auth);
