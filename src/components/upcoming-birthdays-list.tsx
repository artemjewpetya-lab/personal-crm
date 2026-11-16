"use client";

import { CakeIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ContactAvatar } from "@/components/contact-avatar";
import { Button } from "@/components/ui/button";
import { HOME_BLOCK_VISIBLE_AT_FIRST, homeBlockView } from "@/lib/home-block";

// Texts come ready from the server (`formatBirthdayRow`): "today" is counted there, in Moscow
// time, so the browser's time zone cannot change them.
export type UpcomingBirthdayItem = {
  id: string;
  name: string;
  /** "20 ноября, " */
  before: string;
  /** "через 4 дня" - the part that is highlighted */
  when: string;
  /** " · исполнится 36", or empty when the year is not known */
  after: string;
};

export function UpcomingBirthdaysList({ items }: { items: UpcomingBirthdayItem[] }) {
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [expanded, setExpanded] = useState(false);
  const { visible, showAll } = homeBlockView(items, expanded);

  // The button disappears once pressed: move focus to the first revealed
  // contact, so keyboard users continue from where the list grew.
  useEffect(() => {
    if (!expanded) return;
    listRef.current?.querySelectorAll("a")[HOME_BLOCK_VISIBLE_AT_FIRST]?.focus();
  }, [expanded]);

  return (
    <section aria-labelledby={headingId} className="mb-6 overflow-hidden rounded-card bg-card">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-icon-box bg-primary text-primary-foreground">
          <CakeIcon aria-hidden className="size-4.5" />
        </span>
        <h2 id={headingId} className="font-heading text-lg font-semibold">
          Скоро день рождения
        </h2>
      </div>
      <ul ref={listRef}>
        {visible.map((item) => (
          <UpcomingBirthdayRow key={item.id} item={item} />
        ))}
      </ul>
      {showAll && (
        <div className="border-t px-2.5 pt-2 pb-2.5">
          <Button
            variant="ghost"
            className="h-11 px-3.5 text-primary hover:text-primary"
            onClick={() => setExpanded(true)}
          >
            {showAll}
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </div>
      )}
    </section>
  );
}

// Avatar, then the name with the date line under it. Like in the contact list and in
// "Пора связаться", the name link covers the whole row (an invisible layer); there is
// nothing else to press in the row.
function UpcomingBirthdayRow({ item }: { item: UpcomingBirthdayItem }) {
  return (
    <li className="relative flex items-center gap-3 border-t px-4 pt-3 pb-3.5 transition-colors hover:bg-muted has-[a:focus-visible]:outline-3 has-[a:focus-visible]:-outline-offset-3 has-[a:focus-visible]:outline-ring md:min-h-18 md:gap-4 md:px-5 md:py-3">
      <ContactAvatar id={item.id} name={item.name} className="size-10 text-meta" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/contacts/${item.id}`}
          className="block truncate text-row-title font-semibold outline-none after:absolute after:inset-0"
        >
          {item.name}
        </Link>
        <p className="mt-0.5 text-meta text-muted-foreground">
          {item.before}
          <span className="font-semibold text-primary">{item.when}</span>
          {item.after}
        </p>
      </div>
    </li>
  );
}
