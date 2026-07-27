import type { Metadata } from "next";
import Link from "next/link";
import { ProjectChecklist } from "@/components/project-checklist";
import { ProjectGate } from "@/components/project-gate";

export const metadata: Metadata = {
  title: "Checklist — RoomScale",
  description:
    "What to buy for the room, what it costs, and what is still to pay for. Counted from the furniture actually placed in the plan.",
};

export default function ChecklistPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-16 sm:px-8 sm:py-20 print:py-0">
      <header className="flex flex-col gap-4">
        <nav className="flex gap-4 text-xs uppercase tracking-[0.2em] opacity-60 print:hidden">
          <Link href="/">RoomScale</Link>
          <Link href="/plan" className="underline underline-offset-4">
            Room
          </Link>
          <Link href="/furniture" className="underline underline-offset-4">
            Furniture
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          The list
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed opacity-80 print:hidden">
          Everything standing in the room, what it costs, and what is left to
          buy. Quantities are counted from the plan and the totals are worked
          out here, so neither can disagree with the room. Print this and take
          it with you.
        </p>
      </header>

      <ProjectGate>
        <ProjectChecklist />
      </ProjectGate>
    </main>
  );
}
