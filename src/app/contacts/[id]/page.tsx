import {
  ArrowLeftIcon,
  CalendarIcon,
  HandshakeIcon,
  MailIcon,
  PhoneIcon,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AddNoteForm } from "@/components/add-note-form";
import { EditContactDialog } from "@/components/edit-contact-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, listNotes } from "@/lib/contacts/queries";
import { formatDate, formatDateTime, phoneHref, pluralize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Карточка контакта",
};

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link
        href="/"
        className={buttonVariants({ variant: "ghost", className: "-ml-2.5 mb-4" })}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Все контакты
      </Link>
      <Suspense fallback={<ContactSkeleton />}>
        <ContactDetails params={params} />
      </Suspense>
    </main>
  );
}

async function ContactDetails({
  params,
}: Pick<PageProps<"/contacts/[id]">, "params">) {
  const { id } = await params;
  const [contact, notes] = await Promise.all([getContact(id), listNotes(id)]);
  if (!contact) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {contact.name}
          </h1>
          {contact.about && (
            <p className="mt-1 text-muted-foreground">{contact.about}</p>
          )}
        </div>
        <EditContactDialog
          contactId={contact.id}
          defaultValues={{
            name: contact.name,
            about: contact.about,
            howWeMet: contact.howWeMet,
            phone: contact.phone,
            email: contact.email,
          }}
        />
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail icon={HandshakeIcon} label="Откуда знакомы">
              {contact.howWeMet}
            </Detail>
            <Detail icon={PhoneIcon} label="Телефон">
              {contact.phone && (
                <a href={phoneHref(contact.phone)} className="tabular-nums hover:underline">
                  {contact.phone}
                </a>
              )}
            </Detail>
            <Detail icon={MailIcon} label="Почта">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="break-all hover:underline">
                  {contact.email}
                </a>
              )}
            </Detail>
            <Detail icon={CalendarIcon} label="В списке с">
              {formatDate(contact.createdAt)}
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="notes-heading" className="text-lg font-semibold tracking-tight">
            Заметки
          </h2>
          <span className="text-sm text-muted-foreground">
            {pluralize(notes.length, ["заметка", "заметки", "заметок"])}
          </span>
        </div>

        <Card>
          <CardContent>
            <AddNoteForm key={contact.id} contactId={contact.id} />
          </CardContent>
        </Card>

        {notes.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border bg-card px-4 py-3">
                <time
                  dateTime={note.createdAt.toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  {formatDateTime(note.createdAt)}
                </time>
                <p className="mt-1 whitespace-pre-wrap break-words">{note.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Заметок пока нет. Запишите, о чём говорили и о чём договорились.
          </p>
        )}
      </section>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5">
          {children || <span className="text-muted-foreground">не указано</span>}
        </dd>
      </div>
    </div>
  );
}

function ContactSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Загрузка контакта">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
