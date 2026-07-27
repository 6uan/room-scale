import type { Metadata } from "next";
import Link from "next/link";
import { ProjectGate } from "@/components/project-gate";
import { RoomPlanner } from "@/components/room-planner";

export const metadata: Metadata = {
  title: "Room — RoomScale",
  description:
    "Describe a rectangular room in the unit you measure in, and see it to scale in plan.",
};

export default function PlanPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16 sm:px-8 sm:py-20">
      <header className="flex flex-col gap-4">
        <nav className="flex gap-4 text-xs uppercase tracking-[0.2em] opacity-60">
          <Link href="/">RoomScale</Link>
          <Link href="/furniture" className="underline underline-offset-4">
            Furniture
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          The room
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed opacity-80">
          Measure the room once. Type the dimensions in whichever unit you
          measured in — they are stored in meters either way, so switching units
          never changes the room, only how it reads.
        </p>
      </header>

      <ProjectGate>
        <RoomPlanner />
      </ProjectGate>
    </main>
  );
}
