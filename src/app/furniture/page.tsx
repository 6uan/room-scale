import type { Metadata } from "next";
import Link from "next/link";
import { ProjectGate } from "@/components/project-gate";
import { FurnitureCatalog } from "@/components/furniture-catalog";

export const metadata: Metadata = {
  title: "Furniture — RoomScale",
  description:
    "Enter furniture at its exact product dimensions, with price, retailer, and link.",
};

export default function FurniturePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-6 py-16 sm:px-8 sm:py-20">
      <header className="flex flex-col gap-4">
        <nav className="flex gap-4 text-xs uppercase tracking-[0.2em] opacity-60">
          <Link href="/">RoomScale</Link>
          <Link href="/plan" className="underline underline-offset-4">
            Room
          </Link>
          <Link href="/checklist" className="underline underline-offset-4">
            Checklist
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          The furniture
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed opacity-80">
          Copy each piece from the page you are buying it on: the exact
          dimensions, the price, and the link. Nothing here is placed in the
          room yet — this is what you are considering, and what it would cost.
        </p>
      </header>

      <ProjectGate>
        <FurnitureCatalog />
      </ProjectGate>
    </main>
  );
}
