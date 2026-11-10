import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Ссылка устарела",
};

// Where every link that did not work leads: used, expired, replaced by a newer one or damaged.
// The person cannot do anything about the reason, so there is one screen and one way out.
export default function ExpiredLinkPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-5 py-16 text-center sm:py-24">
      <h1 className="font-heading text-h2 font-semibold">Ссылка устарела, запросите новую</h1>
      <Link href="/login" className={buttonVariants({ size: "lg", className: "max-sm:w-full" })}>
        Запросить новую ссылку
      </Link>
    </main>
  );
}
