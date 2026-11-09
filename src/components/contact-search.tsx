"use client";

import { LoaderCircleIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resolveGroupFilter } from "@/lib/groups/filter";
import type { PickerGroup } from "@/lib/groups/picker";

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_PLACEHOLDER = "Имя, почта или телефон";

/** The search field and, next to it (under it on a phone), the choice of a group. */
export function ContactSearch({ groups }: { groups: PickerGroup[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const [isPending, startTransition] = useTransition();
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The URL can also change from outside (e.g. the header link resets the search).
  // Sync the input then, but ignore URL updates that this component made itself.
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const [lastPushedQuery, setLastPushedQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    if (urlQuery !== lastPushedQuery) setValue(urlQuery);
  }

  function pushQuery(query: string) {
    const params = new URLSearchParams(searchParams);
    if (query) params.set("q", query);
    else params.delete("q");
    const search = params.toString();

    setLastPushedQuery(query);
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    });
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(
      () => pushQuery(nextValue.trim()),
      SEARCH_DEBOUNCE_MS,
    );
  }

  function clear() {
    clearTimeout(debounceTimer.current);
    setValue("");
    pushQuery("");
  }

  const group = resolveGroupFilter(searchParams.get("group") ?? undefined, groups);

  function pushGroup(groupId: string) {
    const params = new URLSearchParams(searchParams);
    if (groupId) params.set("group", groupId);
    else params.delete("group");
    const search = params.toString();

    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
    <div className="relative w-full">
      {isPending ? (
        <LoaderCircleIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      ) : (
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
        />
      )}
      <Input
        type="search"
        aria-label="Поиск контактов"
        placeholder={SEARCH_PLACEHOLDER}
        autoComplete="off"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            clear();
          }
        }}
        className="h-12 rounded-button pr-12 pl-11 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Очистить поиск"
          onClick={clear}
          className="absolute top-1/2 right-2 -translate-y-1/2"
        >
          <XIcon />
        </Button>
      )}
    </div>
    <GroupFilter
      groups={groups}
      value={group ?? ""}
      onChange={pushGroup}
    />
    </div>
  );
}

const GROUP_FILTER_TRIGGER_CLASS =
  "h-12 w-full gap-2.5 rounded-button bg-card pr-3.5 pl-4 text-base data-[size=default]:h-12 sm:w-60 sm:shrink-0 md:text-sm";

function GroupFilter({
  groups,
  value,
  onChange,
}: {
  groups: PickerGroup[];
  value: string;
  onChange: (groupId: string) => void;
}) {
  const items = [
    { value: "", label: "Все группы" },
    ...groups.map((group) => ({ value: group.id, label: group.name })),
  ];
  return (
    <Select items={items} value={value} onValueChange={(next) => onChange(next ?? "")}>
      <SelectTrigger aria-label="Группа" className={GROUP_FILTER_TRIGGER_CLASS}>
        <UsersIcon aria-hidden className="size-4.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        align="end"
        className="min-w-60 rounded-button p-1 shadow-lg ring-border"
      >
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            className="h-10 rounded-lg pl-2.5 text-base data-selected:bg-muted data-selected:font-semibold md:text-sm [&_svg]:text-primary"
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ContactSearchFallback() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
    <div className="relative w-full">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Поиск контактов"
        placeholder={SEARCH_PLACEHOLDER}
        disabled
        className="h-12 rounded-button pl-11"
      />
    </div>
    <Select items={[{ value: "", label: "Все группы" }]} value="" disabled>
      <SelectTrigger aria-label="Группа" className={GROUP_FILTER_TRIGGER_CLASS}>
        <UsersIcon aria-hidden className="size-4.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
    </Select>
    </div>
  );
}
