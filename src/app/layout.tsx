import { ContactRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
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
    <html lang="ru" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center px-4">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <ContactRoundIcon aria-hidden className="size-5" />
              Личная CRM
            </Link>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <Toaster theme="light" position="top-center" />
      </body>
    </html>
  );
}
