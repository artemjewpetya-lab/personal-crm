import type { Metadata } from "next";
import { Onest, Unbounded } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";

import { LogoMark } from "@/components/logo-mark";
import { Toaster } from "@/components/ui/sonner";
import { HeaderUser, HeaderUserLine } from "@/components/user-menu";

import "./globals.css";

// Same typefaces as the landing: Onest for text, Unbounded for headings
const onest = Onest({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const unbounded = Unbounded({
  variable: "--font-heading",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: {
    default: "Личная CRM",
    template: "%s · Личная CRM",
  },
  description: "Люди, которых я знаю лично, и контекст общения с ними",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${onest.variable} ${unbounded.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header>
          <div className="mx-auto w-full max-w-5xl px-5">
            <div className="flex h-16 items-center justify-between gap-3 lg:h-20">
              <Link
                href="/"
                className="flex shrink-0 items-center gap-2.5 rounded-logo font-heading text-logo font-semibold lg:gap-3 lg:text-logo-lg"
              >
                <span className="flex size-8.5 items-center justify-center rounded-logo bg-primary text-on-plum lg:size-10">
                  <LogoMark className="size-5 lg:size-5.5" />
                </span>
                Личная CRM
              </Link>
              {/* The address and "Выйти" read who is signed in, so they wait inside Suspense */}
              <Suspense>
                <HeaderUser />
              </Suspense>
            </div>
            <Suspense>
              <HeaderUserLine />
            </Suspense>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <Toaster theme="light" position="top-center" />
      </body>
    </html>
  );
}
