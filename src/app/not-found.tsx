import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-5 py-24 text-center">
      <h1 className="font-heading text-h2 font-semibold">Страница не найдена</h1>
      <p className="text-muted-foreground">Проверьте адрес или вернитесь к списку контактов.</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        К списку контактов
      </Link>
    </main>
  );
}
