import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ProjectChecklist } from "@/components/project-checklist";
import { ProjectGate } from "@/components/project-gate";

export const metadata: Metadata = {
  title: "Overview — RoomScale",
  description:
    "What to buy for the apartment, what it costs, and what is still to pay for. Counted from the furniture actually placed in the plan.",
};

/** What you leave with: the list, the prices, and the total, ready to print. */
export default function OverviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-16 sm:px-8 sm:py-20 print:py-0">
      <header className="flex flex-col gap-4">
        <nav className="flex gap-4 text-xs uppercase tracking-[0.2em] opacity-60 print:hidden">
          <Link
            href="/"
            className="inline-flex items-center gap-2 underline underline-offset-4"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Back to the plan
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          The list
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed opacity-80 print:hidden">
          Everything standing in the apartment, what it costs, and what is left
          to buy. Quantities are counted from the plan and the totals are worked
          out here, so neither can disagree with the room. Print this and take
          it with you.
        </p>
      </header>

      {/*
        The list, and nothing else. Saving and opening project files used to sit
        under it, which made a page meant for printing into a page with controls
        on it — they are behind the gear on the plan now.
      */}
      <ProjectGate>
        <ProjectChecklist />
      </ProjectGate>
    </main>
  );
}
