"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-5 py-24 text-center">
      <TriangleAlertIcon aria-hidden className="size-8 text-destructive" />
      <h1 className="font-heading text-h2 font-semibold">Не удалось загрузить данные</h1>
      <p className="text-muted-foreground">
        Чаще всего это значит, что база данных не запущена. Запустите Docker Desktop,
        выполните в папке проекта <code className="rounded bg-muted px-1">docker compose up -d</code>{" "}
        и попробуйте ещё раз.
      </p>
      <Button onClick={() => retry()}>Попробовать ещё раз</Button>
    </main>
  );
}
