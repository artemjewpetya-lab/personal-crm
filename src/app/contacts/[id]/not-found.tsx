import { UserXIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-card px-6 py-16 text-center">
      <span className="mb-1 flex size-12 items-center justify-center rounded-icon-box bg-primary text-primary-foreground">
        <UserXIcon aria-hidden className="size-5.5" />
      </span>
      <p className="font-heading font-semibold">Такого контакта нет</p>
      <p className="text-sm text-muted-foreground">
        Возможно, ссылка неполная или контакт был удалён из базы.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        К списку контактов
      </Link>
    </div>
  );
}
