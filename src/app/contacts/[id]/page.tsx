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
import { Fragment, Suspense, type ReactNode } from "react";

import { AddNoteForm } from "@/components/add-note-form";
import { ContactAvatar } from "@/components/contact-avatar";
import { EditContactDialog } from "@/components/edit-contact-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getContact, listNotes } from "@/lib/contacts/queries";
import { formatDateParts, formatDateTime, phoneHref, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Карточка контакта",
};

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-2 pb-12 lg:pt-4">
      <Link
        href="/"
        className={buttonVariants({ variant: "ghost", className: "-ml-3.5 mb-3" })}
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

  const addedOn = formatDateParts(contact.createdAt);

  return (
    <div className="flex flex-col gap-8">
      {/* Same layout as the contact card on the landing: profile row and a 2x2 grid of tiles */}
      <div className="flex flex-col gap-2 rounded-card bg-card p-3 lg:gap-2.5 lg:p-4">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-1 pt-1 pb-1.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] lg:px-1.5 lg:pt-1.5 lg:pb-2">
          <ContactAvatar
            id={contact.id}
            name={contact.name}
            className="size-12.5 text-lg lg:size-15 lg:text-xl"
          />
          <div>
            <h1 className="font-heading text-h2 font-semibold break-words">
              {contact.name}
            </h1>
            {contact.about && (
              <p className="mt-1 text-muted-foreground">{contact.about}</p>
            )}
          </div>
          <div className="col-start-2 sm:col-start-3">
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
        </div>

        <dl className="grid grid-cols-2 gap-2 lg:gap-2.5">
          <Detail tone="ink" icon={HandshakeIcon} label="Откуда знакомы">
            {contact.howWeMet}
          </Detail>
          <Detail tone="dusty" icon={PhoneIcon} label="Телефон">
            {contact.phone && (
              <a href={phoneHref(contact.phone)} className="group tabular-nums">
                <BreakableText pieces={contact.phone.split(/\s+/)} separator=" " />
              </a>
            )}
          </Detail>
          <Detail tone="blush" icon={MailIcon} label="Почта">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="group">
                <BreakableText pieces={contact.email.split(/(?=[@.])/)} separator={<wbr />} />
              </a>
            )}
          </Detail>
          <Detail tone="ochre" icon={CalendarIcon} label="В списке с">
            <time
              dateTime={contact.createdAt.toISOString()}
              className="flex flex-col gap-0.5 lg:gap-1"
            >
              <span className="font-heading text-number font-bold">{addedOn.day}</span>
              <span>{addedOn.rest}</span>
            </time>
          </Detail>
        </dl>
      </div>

      <section aria-labelledby="notes-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="notes-heading" className="font-heading text-lg font-semibold">
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
          <ol className="flex flex-col gap-2.5">
            {notes.map((note) => (
              // A speech bubble, like the "talked about" phrases on the landing
              <li
                key={note.id}
                className="rounded-tile rounded-bl-bubble-tail bg-card px-5 py-4"
              >
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

// Tile colors from the landing's contact card
const TILE_TONES = {
  ink: { tile: "bg-ink text-paper", label: "text-on-navy-label", empty: "text-on-navy-muted" },
  ochre: { tile: "bg-ochre text-white", label: "text-white", empty: "text-white" },
  dusty: { tile: "bg-dusty", label: "text-plum", empty: "text-ink-soft" },
  blush: { tile: "bg-blush", label: "text-plum", empty: "text-muted-foreground" },
};

function Detail({
  tone,
  icon: Icon,
  label,
  children,
}: {
  tone: keyof typeof TILE_TONES;
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  const colors = TILE_TONES[tone];
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-between gap-3 rounded-tile p-3.5 lg:min-h-37.5 lg:gap-4 lg:p-5",
        colors.tile,
      )}
    >
      <dt
        className={cn(
          "flex items-center gap-1.5 text-label font-semibold uppercase lg:gap-2",
          colors.label,
        )}
      >
        <Icon aria-hidden className="size-3.5 shrink-0 lg:size-4" />
        {label}
      </dt>
      <dd className="text-tile font-medium break-words lg:text-tile-lg">
        {children || <span className={colors.empty}>не указано</span>}
      </dd>
    </div>
  );
}

/**
 * Narrow tiles wrap long values. Keeps each piece whole while it fits
 * ("+7 900" / "123-45-67", "anna.smirnova" / "@mail.ru") instead of breaking
 * at any hyphen or letter; a piece wider than the tile still wraps inside it.
 */
function BreakableText({ pieces, separator }: { pieces: string[]; separator: ReactNode }) {
  return pieces.map((piece, index) => (
    <Fragment key={index}>
      {index > 0 && separator}
      <span className="inline-block max-w-full group-hover:underline">{piece}</span>
    </Fragment>
  ));
}

function ContactSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Загрузка контакта">
      <div className="flex flex-col gap-2 rounded-card bg-card p-3 lg:gap-2.5 lg:p-4">
        <div className="flex items-center gap-4 px-1 pt-1 pb-1.5 lg:px-1.5 lg:pt-1.5 lg:pb-2">
          <Skeleton className="size-12.5 shrink-0 rounded-full lg:size-15" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:gap-2.5">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-tile lg:h-37.5" />
          ))}
        </div>
      </div>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-32 w-full rounded-card" />
    </div>
  );
}
