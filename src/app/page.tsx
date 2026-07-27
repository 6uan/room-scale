import Link from "next/link";
import { FeatureCard } from "@/components/feature-card";
import { formatLength, metersFromInches } from "@/domain/units";

const FEATURES = [
  {
    title: "Measure the room once",
    description:
      "Width, depth, ceiling, and where the doors, windows, and open passages are. Type inches or centimeters; it stores meters either way, so the two never disagree.",
  },
  {
    title: "Bring the furniture in from its page",
    description:
      "Paste the product page you are already looking at. RoomScale reads the name, price, and dimensions out of it, shows you the text each number came from, and stores nothing you have not confirmed.",
  },
  {
    title: "Arrange it at true size",
    description:
      "Every piece is drawn at the footprint the retailer published, and moved and turned by dragging, by typing a position, or with the arrow keys. Save more than one arrangement and compare them.",
  },
  {
    title: "Find out what does not fit",
    description:
      "Overlaps, wall crossings, blocked doorways, and routes narrowed below what you can walk through — reported in words, with the amount they are out by, in your unit.",
  },
  {
    title: "Keep the list and the total",
    description:
      "Every product with its quantity, price, link, and whether you have bought it yet. The total comes from what is actually placed in the room, so it cannot drift from the plan.",
  },
  {
    title: "It stays in your browser",
    description:
      "Projects live in IndexedDB on your own machine. No account, no server, no upload. Export to JSON or CSV whenever you want to take it elsewhere.",
  },
] as const;

const MINIMUM_WALKWAY_METERS = metersFromInches(36);
const PREFERRED_WALKWAY_METERS = metersFromInches(42);

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-16 sm:px-8 sm:py-24">
      <header className="flex flex-col gap-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] opacity-60">
          Open source · Nothing leaves your browser
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          RoomScale
        </h1>
        <p className="text-lg leading-relaxed opacity-80">
          You get one visit with a tape measure, and then you have to furnish
          the place. RoomScale works out what will fit in the apartment you are
          moving into — before you buy any of it, and without going back to
          measure again.
        </p>
        <p className="text-sm leading-relaxed opacity-60">
          Measure once, bring the furniture in from the listing pages you
          already have open, and find out what does not fit and by how much. A
          3D view of the same room comes last, not first: a render that looks
          right and measures wrong is the mistake this exists to prevent.
        </p>
      </header>

      <section className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold tracking-tight">What it does</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-black/10 p-6 dark:border-white/15">
        <h2 className="text-xl font-semibold tracking-tight">
          The clearance rule, in both units
        </h2>
        <p className="text-sm leading-relaxed opacity-80">
          A main walking route should stay at least{" "}
          <strong>{formatLength(MINIMUM_WALKWAY_METERS, "imperial")}</strong> (
          {formatLength(MINIMUM_WALKWAY_METERS, "metric")}) wide, and{" "}
          <strong>{formatLength(PREFERRED_WALKWAY_METERS, "imperial")}</strong>{" "}
          ({formatLength(PREFERRED_WALKWAY_METERS, "metric")}) is more
          comfortable. RoomScale stores one meter value and shows you whichever
          unit you prefer.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Project status</h2>
        <p className="text-sm leading-relaxed opacity-80">
          Steps 1 to 10 of 16 are done. A rectangular room can be measured and
          seen to scale{" "}
          <Link href="/plan" className="underline underline-offset-4">
            in plan
          </Link>
          , and furniture can be entered at its exact dimensions with prices and
          links{" "}
          <Link href="/furniture" className="underline underline-offset-4">
            in the catalogue
          </Link>
          . Furniture can be placed in the room at its true footprint, moved and
          turned by dragging or by typing, and anything that overlaps, crosses a
          wall, or sits outside the room is reported in words with the amount.
          It is all saved in your browser, and what it all costs is in the{" "}
          <Link href="/checklist" className="underline underline-offset-4">
            checklist
          </Link>
          . Protected walkways are next. See{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
            ROADMAP.md
          </code>{" "}
          for what comes next and{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
            docs/adr
          </code>{" "}
          for the decisions already made.
        </p>
      </section>

      <footer className="mt-auto border-t border-black/10 pt-6 text-xs opacity-60 dark:border-white/15">
        MIT licensed. Contributions welcome — start with CONTRIBUTING.md.
      </footer>
    </main>
  );
}
