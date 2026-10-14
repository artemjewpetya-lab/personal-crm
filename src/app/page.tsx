import { SearchXIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AddContactDialog } from "@/components/add-contact-dialog";
import { ContactAvatar } from "@/components/contact-avatar";
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
    <main className="mx-auto w-full max-w-5xl px-5 pb-12">
      <div className="sticky top-0 z-10 -mx-5 flex flex-col gap-4 bg-background/95 px-5 pt-4 pb-4 backdrop-blur supports-backdrop-filter:bg-background/80 lg:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h1 className="font-heading text-h2 font-semibold md:text-h1">Контакты</h1>
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
    <div className="overflow-hidden rounded-card bg-card">
      <table className="w-full table-fixed text-sm [&_td]:border-t [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_tbody_tr]:relative [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted [&_tbody_tr:has(a:focus-visible)]:bg-dusty/60 [&_th]:h-12 [&_th]:px-3 [&_th]:text-left [&_th]:text-label [&_th]:font-semibold [&_th]:text-muted-foreground [&_th]:uppercase [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
        <thead>
          <tr>
            <th scope="col" className="w-auto md:w-[34%]">
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
                <div className="flex items-center gap-3">
                  <ContactAvatar
                    id={contact.id}
                    name={contact.name}
                    className="size-9 text-xs"
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="font-semibold decoration-ochre decoration-2 underline-offset-4 outline-none after:absolute after:inset-0 focus-visible:underline"
                    >
                      {contact.name}
                    </Link>
                    {contact.about && (
                      <div className="truncate text-muted-foreground md:hidden">
                        {contact.about}
                      </div>
                    )}
                  </div>
                </div>
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
    <div className="flex flex-col items-center gap-2 rounded-card bg-card px-6 py-16 text-center">
      <span className="mb-2 flex size-12 items-center justify-center rounded-icon-box bg-primary text-primary-foreground">
        <Icon aria-hidden className="size-5.5" />
      </span>
      {search ? (
        <>
          <p className="font-heading font-semibold break-words">
            Никого не нашлось по запросу «{search}»
          </p>
          <p className="text-sm text-muted-foreground">
            Проверьте написание или поищите по части имени.
          </p>
        </>
      ) : (
        <>
          <p className="font-heading font-semibold">Пока нет ни одного контакта</p>
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
      <div className="flex flex-col gap-5 rounded-card bg-card p-5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="hidden h-4 flex-1 md:block" />
            <Skeleton className="hidden h-4 w-32 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
