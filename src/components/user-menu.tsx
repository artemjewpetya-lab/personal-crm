import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { findCurrentUser } from "@/lib/auth/current-user";

// The signed-in person in the header: their address and "Выйти". Without a sign-in (the sign-in
// page) both draw nothing. They read the request, so the layout puts them inside <Suspense>.

/** Desktop: the address and the button on the right of the logo row. */
export async function HeaderUser() {
  const user = await findCurrentUser();
  if (!user) return null;

  return (
    <div className="flex min-w-0 items-center gap-3 lg:gap-4">
      <span title={user.email} className="hidden min-w-0 truncate text-meta text-ink-soft sm:block">
        {user.email}
      </span>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Выйти
        </Button>
      </form>
    </div>
  );
}

/** Phone: the address on its own line under the logo row, so a long one cannot break the row. */
export async function HeaderUserLine() {
  const user = await findCurrentUser();
  if (!user) return null;

  return (
    <p title={user.email} className="truncate pb-2 text-meta text-ink-soft sm:hidden">
      {user.email}
    </p>
  );
}
