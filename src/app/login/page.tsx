import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/components/sign-in-form";
import { findCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center px-5 pt-4 pb-12 sm:pt-14">
      <div className="flex w-full max-w-120 flex-col gap-6 rounded-card border border-border bg-card px-5 py-7 sm:gap-7 sm:px-9 sm:py-10">
        <h1 className="font-heading text-h2 font-semibold sm:text-h1">Вход в Личную CRM</h1>
        <SignInForm />
      </div>
      {/* Somebody who is signed in already has nothing to do here */}
      <Suspense>
        <LeaveIfSignedIn />
      </Suspense>
    </main>
  );
}

async function LeaveIfSignedIn() {
  if (await findCurrentUser()) redirect("/");
  return null;
}
