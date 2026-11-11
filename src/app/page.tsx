import { SearchXIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AddContactButtonFallback, AddContactDialog } from "@/components/add-contact-dialog";
import { ContactAvatar } from "@/components/contact-avatar";
import { contactRowId } from "@/components/contact-row-reveal";
import { ContactSearch, ContactSearchFallback } from "@/components/contact-search";
import { KeepInTouchList, type KeepInTouchItem } from "@/components/keep-in-touch-list";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  countContacts,
  listContacts,
  listDueContacts,
  type ContactListItem,
  type DueContact,
} from "@/lib/contacts/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatDate, formatOverdue, pluralize } from "@/lib/format";
import { resolveGroupFilter } from "@/lib/groups/filter";
import { listGroups } from "@/lib/groups/queries";

const CONTACT_WORDS: [string, string, string] = ["контакт", "контакта", "контактов"];

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 pb-12">
      <div className="sticky top-0 z-10 -mx-5 flex flex-col gap-4 bg-background/95 px-5 pt-4 pb-4 backdrop-blur supports-backdrop-filter:bg-background/80 lg:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h1 className="font-heading text-h2 font-semibold md:text-h1">Контакты</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/groups"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className:
                  "max-sm:h-10 max-sm:gap-2 max-sm:rounded-lg max-sm:px-3.5 max-sm:text-sm max-sm:[&_svg:not([class*='size-'])]:size-4",
              })}
            >
              <UsersIcon data-icon="inline-start" />
              Группы
            </Link>
            <Suspense fallback={<AddContactButtonFallback />}>
              <AddContact />
            </Suspense>
          </div>
        </div>
        <Suspense fallback={<ContactSearchFallback />}>
          <ContactFilters />
        </Suspense>
      </div>
      <Suspense fallback={<ContactListSkeleton />}>
        <ContactList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// The groups are read here, inside Suspense, so the page shell does not wait for them.
// Everything below asks who is signed in first: the id of the person decides what is read.
async function AddContact() {
  const user = await getCurrentUser();
  return <AddContactDialog groups={await listGroups(user.id)} />;
}

async function ContactFilters() {
  const user = await getCurrentUser();
  return <ContactSearch groups={await listGroups(user.id)} />;
}

async function ContactList({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const [user, { q, group }] = await Promise.all([getCurrentUser(), searchParams]);
  const search = typeof q === "string" ? q.trim() : "";
  // "Пора связаться" is hidden while searching, so it is not even read then.
  // The group filter does not touch it. A group that does not exist filters nothing.
  const [items, total, due, groups] = await Promise.all([
    listContacts(user.id, search, typeof group === "string" ? group : null),
    countContacts(user.id),
    search ? [] : listDueContacts(user.id),
    listGroups(user.id),
  ]);
  const groupId = resolveGroupFilter(group, groups);
  const groupName = groups.find((item) => item.id === groupId)?.name ?? null;

  return (
    <>
      {due.length > 0 && (
        // The data is already here, so this boundary never shows a fallback. It lets
        // React make the block clickable on its own, without waiting for the long
        // contact list below it: a click on a not-yet-ready part of the page is
        // otherwise lost.
        <Suspense>
          <KeepInTouchList items={due.map(toKeepInTouchItem)} />
        </Suspense>
      )}
      <ContactListSection search={search} groupName={groupName} items={items} total={total} />
    </>
  );
}

function toKeepInTouchItem(contact: DueContact): KeepInTouchItem {
  return {
    id: contact.id,
    name: contact.name,
    overdue: formatOverdue(contact.overdueDays),
    lastNote: contact.lastNoteAt
      ? `(последняя заметка ${formatDate(contact.lastNoteAt)})`
      : "(заметок нет)",
    snippet: contact.lastNoteSnippet || null,
  };
}

function ContactListSection({
  search,
  groupName,
  items,
  total,
}: {
  search: string;
  groupName: string | null;
  items: ContactListItem[];
  total: number;
}) {
  return (
    <section aria-label="Список контактов" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {search || groupName
          ? `Найдено: ${pluralize(items.length, CONTACT_WORDS)} из ${total.toLocaleString("ru-RU")}`
          : `Всего ${pluralize(total, CONTACT_WORDS)}`}
      </p>
      {items.length > 0 ? (
        <ContactTable items={items} />
      ) : (
        <EmptyState search={search} groupName={groupName} />
      )}
    </section>
  );
}

function ContactTable({ items }: { items: ContactListItem[] }) {
  // Styles are set once on the table (not on every cell): the list can hold
  // thousands of rows, and this keeps the page noticeably lighter.
  return (
    <div className="overflow-hidden rounded-card bg-card">
      <table className="w-full table-fixed text-sm [&_td]:border-t [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_tbody_tr]:relative [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted [&_tbody_tr:has(a:focus-visible)]:bg-dusty/60 [&_th]:h-12 [&_th]:px-3 [&_th]:text-left [&_th]:text-label [&_th]:font-semibold [&_th]:text-muted-foreground [&_th]:uppercase [&_th:first-child]:pl-5 [&_th:last-child]:pr-5 [&_ul]:mt-1 [&_ul]:flex [&_ul]:flex-wrap [&_ul]:gap-1 [&_li]:rounded-full [&_li]:bg-secondary [&_li]:px-2 [&_li]:text-xs [&_li]:leading-5 [&_li]:font-medium [&_li]:text-secondary-foreground">
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
                  <ContactAvatar id={contact.id} name={contact.name} className="size-9 text-xs" />
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
                    {contact.groups.length > 0 && (
                      <ul aria-label="Группы">
                        {contact.groups.map((group) => (
                          <li key={group.id}>{group.name}</li>
                        ))}
                      </ul>
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

function EmptyState({ search, groupName }: { search: string; groupName: string | null }) {
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
      ) : groupName ? (
        <p className="font-heading font-semibold break-words">
          В группе «{groupName}» пока никого нет
        </p>
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
