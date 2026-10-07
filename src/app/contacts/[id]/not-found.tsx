import { UserXIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
      <UserXIcon aria-hidden className="size-8 text-muted-foreground" />
      <p className="font-medium">Такого контакта нет</p>
      <p className="text-sm text-muted-foreground">
        Возможно, ссылка неполная или контакт был удалён из базы.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        К списку контактов
      </Link>
    </div>
  );
}
