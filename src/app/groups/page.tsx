import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { GroupsManager } from "@/components/groups-manager";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listGroups } from "@/lib/groups/queries";

export const metadata: Metadata = {
  title: "Группы",
};

export default function GroupsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-2 pb-12 lg:pt-4">
      <Link href="/" className={buttonVariants({ variant: "ghost", className: "-ml-3.5 mb-3" })}>
        <ArrowLeftIcon data-icon="inline-start" />
        Все контакты
      </Link>
      <Suspense fallback={<GroupsSkeleton />}>
        <GroupsContent />
      </Suspense>
    </main>
  );
}

async function GroupsContent() {
  return <GroupsManager groups={await listGroups()} />;
}

function GroupsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка групп">
      <h1 className="mb-4 font-heading text-h2 font-semibold md:text-h1">Группы</h1>
      <div className="flex flex-col gap-5 rounded-card bg-card p-5">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}
