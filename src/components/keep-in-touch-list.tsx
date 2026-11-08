"use client";

import { ChevronDownIcon, MessageCircleIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ContactAvatar } from "@/components/contact-avatar";
import { MarkContactedButton } from "@/components/mark-contacted-button";
import { Button } from "@/components/ui/button";

// Texts come ready from the server: dates are formatted there, the same way
// as in the contact card, so the browser's time zone cannot change them.
export type KeepInTouchItem = {
  id: string;
  name: string;
  /** "Просрочено на 24 дня" or "Пора сегодня" */
  overdue: string;
  /** "(последняя заметка 15 сентября 2026 г.)" or "(заметок нет)" */
  lastNote: string;
  /** First line of the last note */
  snippet: string | null;
};

const VISIBLE_AT_FIRST = 5;

export function KeepInTouchList({ items }: { items: KeepInTouchItem[] }) {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, VISIBLE_AT_FIRST);

  // The button disappears once pressed: move focus to the first revealed
  // contact, so keyboard users continue from where the list grew.
  useEffect(() => {
    if (!expanded) return;
    listRef.current?.querySelectorAll("a")[VISIBLE_AT_FIRST]?.focus();
  }, [expanded]);

  return (
    <section aria-labelledby={headingId} className="mb-6 overflow-hidden rounded-card bg-card">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-icon-box bg-primary text-primary-foreground">
          <MessageCircleIcon aria-hidden className="size-4.5" />
        </span>
        <h2 id={headingId} className="font-heading text-lg font-semibold">
          Пора связаться
        </h2>
      </div>
      <ul ref={listRef}>
        {visible.map((item) => (
          <KeepInTouchRow key={item.id} item={item} />
        ))}
      </ul>
      {!expanded && items.length > VISIBLE_AT_FIRST && (
        <div className="border-t px-2.5 pt-2 pb-2.5">
          <Button
            variant="ghost"
            className="h-11 px-3.5 text-primary hover:text-primary"
            onClick={() => setExpanded(true)}
          >
            Показать всех ({items.length})
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </div>
      )}
    </section>
  );
}

// Phones: avatar, name and button in the first line, then the overdue line and
// the note below. Wider screens: everything in one line, as in the mockup.
// Like in the contact list, the name link covers the whole row (an invisible
// layer); the button sits above that layer, so pressing it does not open the card.
function KeepInTouchRow({ item }: { item: KeepInTouchItem }) {
  return (
    <li className="relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] content-center items-center gap-x-3 border-t px-4 pt-3 pb-3.5 transition-colors [grid-template-areas:'avatar_name_action'_'._meta_meta'_'._note_note'] hover:bg-muted has-[a:focus-visible]:outline-3 has-[a:focus-visible]:-outline-offset-3 has-[a:focus-visible]:outline-ring md:min-h-18 md:grid-cols-[2.5rem_minmax(0,22.5rem)_minmax(0,1fr)_auto] md:gap-x-4 md:px-5 md:py-3 md:[grid-template-areas:'avatar_name_note_action'_'avatar_meta_note_action']">
      <ContactAvatar
        id={item.id}
        name={item.name}
        className="size-10 text-meta [grid-area:avatar]"
      />
      <Link
        href={`/contacts/${item.id}`}
        className="truncate text-row-title font-semibold outline-none [grid-area:name] after:absolute after:inset-0"
      >
        {item.name}
      </Link>
      <MarkContactedButton contactId={item.id} className="relative z-10 [grid-area:action]" />
      <p className="mt-0.5 text-meta text-muted-foreground [grid-area:meta] md:mt-0">
        <span className="font-semibold text-primary">{item.overdue}</span> {item.lastNote}
      </p>
      {item.snippet && (
        // A speech bubble, like the notes in the contact card
        <p className="mt-1.5 w-fit max-w-full justify-self-start truncate rounded-tile rounded-bl-bubble-tail border bg-background px-3 py-1.5 text-sm text-ink-soft [grid-area:note] md:mt-0 md:px-3.5 md:py-1.75">
          {item.snippet}
        </p>
      )}
    </li>
  );
}
