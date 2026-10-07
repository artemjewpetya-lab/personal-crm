import { SearchXIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AddContactDialog } from "@/components/add-contact-dialog";
import { contactRowId } from "@/components/contact-row-reveal";
import {
  ContactSearch,
  ContactSearchFallback,
} from "@/components/contact-search";
import { Skeleton } from "@/components/ui/skeleton";
import {
  countContacts,
  listContacts,
  type ContactListItem,
} from "@/lib/contacts/queries";
import { pluralize } from "@/lib/format";

const CONTACT_WORDS: [string, string, string] = ["контакт", "контакта", "контактов"];

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-10">
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-3 bg-background/95 px-4 pt-6 pb-4 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Контакты</h1>
          <AddContactDialog />
        </div>
        <Suspense fallback={<ContactSearchFallback />}>
          <ContactSearch />
        </Suspense>
      </div>
      <Suspense fallback={<ContactListSkeleton />}>
        <ContactList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ContactList({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim() : "";
  const [items, total] = await Promise.all([
    listContacts(search),
    countContacts(),
  ]);

  return (
    <section aria-label="Список контактов" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {search
          ? `Найдено: ${pluralize(items.length, CONTACT_WORDS)} из ${total.toLocaleString("ru-RU")}`
          : `Всего ${pluralize(total, CONTACT_WORDS)}`}
      </p>
      {items.length > 0 ? (
        <ContactTable items={items} />
      ) : (
        <EmptyState search={search} />
      )}
    </section>
  );
}

function ContactTable({ items }: { items: ContactListItem[] }) {
  // Styles are set once on the table (not on every cell): the list can hold
  // thousands of rows, and this keeps the page noticeably lighter.
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="w-full table-fixed text-sm [&_td]:border-t [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_tbody_tr]:relative [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/60 [&_tbody_tr:has(a:focus-visible)]:bg-muted [&_th]:h-10 [&_th]:px-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
        <thead className="bg-muted/40">
          <tr>
            <th scope="col" className="w-auto md:w-[28%]">
              Имя
            </th>
            <th scope="col" className="hidden md:table-cell">
              Кто это
            </th>
            <th scope="col" className="hidden w-44 sm:table-cell">
              Телефон
            </th>
            <th scope="col" className="hidden w-64 lg:table-cell">
              Почта
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((contact) => (
            <tr key={contact.id} id={contactRowId(contact.id)}>
              <td>
                <Link
                  href={`/contacts/${contact.id}`}
                  className="font-medium outline-none after:absolute after:inset-0"
                >
                  {contact.name}
                </Link>
                {contact.about && (
                  <div className="truncate text-muted-foreground md:hidden">
                    {contact.about}
                  </div>
                )}
              </td>
              <td className="hidden truncate text-muted-foreground md:table-cell">
                {contact.about}
              </td>
              <td className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                {contact.phone}
              </td>
              <td className="hidden truncate lg:table-cell">{contact.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ search }: { search: string }) {
  const Icon = search ? SearchXIcon : UsersIcon;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
      <Icon aria-hidden className="size-8 text-muted-foreground" />
      {search ? (
        <>
          <p className="font-medium">Никого не нашлось по запросу «{search}»</p>
          <p className="text-sm text-muted-foreground">
            Проверьте написание или поищите по части имени.
          </p>
        </>
      ) : (
        <>
          <p className="font-medium">Пока нет ни одного контакта</p>
          <p className="text-sm text-muted-foreground">
            Нажмите «Добавить контакт», чтобы записать первого человека.
          </p>
        </>
      )}
    </div>
  );
}

function ContactListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загрузка контактов">
      <Skeleton className="h-5 w-40" />
      <div className="flex flex-col gap-4 rounded-xl border p-4">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="flex gap-6">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="hidden h-4 flex-1 md:block" />
            <Skeleton className="hidden h-4 w-32 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
