"use client";

import { LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_PLACEHOLDER = "Имя, почта или телефон";

export function ContactSearch() {
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

  return (
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
  );
}

export function ContactSearchFallback() {
  return (
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
  );
}
