import { redirect } from "next/navigation";

// A stand-in for "@/lib/auth/current-user" in tests of the server actions: the test chooses
// who is signed in, A or B. Use it with
//   vi.mock("@/lib/auth/current-user", () => import("<path>/test/current-user"));
// The real getCurrentUser and Better Auth have tests of their own (src/lib/auth).

export type TestUser = { id: string; email: string };

let signedIn: TestUser | null = null;

/** From now on the actions run as this user. */
export function actAs(user: TestUser): void {
  signedIn = user;
}

/** From now on nobody is signed in. */
export function actAsNobody(): void {
  signedIn = null;
}

// Same behavior as the real ones: without a sign-in the person is sent to /login.
export async function getCurrentUser(): Promise<TestUser> {
  if (!signedIn) redirect("/login");
  return signedIn;
}

export async function findCurrentUser(): Promise<TestUser | null> {
  return signedIn;
}
