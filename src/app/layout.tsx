import type { Metadata } from "next";
import { Onest, Unbounded } from "next/font/google";
import Link from "next/link";

import { LogoMark } from "@/components/logo-mark";
import { Toaster } from "@/components/ui/sonner";

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
    <html
      lang="ru"
      className={`${onest.variable} ${unbounded.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header>
          <div className="mx-auto flex h-16 w-full max-w-5xl items-center px-5 lg:h-20">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-logo font-heading text-logo font-semibold lg:gap-3 lg:text-logo-lg"
            >
              <span className="flex size-8.5 items-center justify-center rounded-logo bg-primary text-on-plum lg:size-10">
                <LogoMark className="size-5 lg:size-5.5" />
              </span>
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
