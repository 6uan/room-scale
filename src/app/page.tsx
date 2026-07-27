import Link from "next/link";
import { FeatureCard } from "@/components/feature-card";
import { formatLength, metersFromInches } from "@/domain/units";

const FEATURES = [
  {
    title: "Measure the room once",
    description:
      "Enter a rectangular room with its doors, windows, and open passages. Every length is stored in meters, so imperial and metric input agree to the millimeter.",
  },
  {
    title: "Place real products",
    description:
      "Furniture carries the exact dimensions from the product page, plus price, retailer link, and purchase status. A product is separate from the copies you place.",
  },
  {
    title: "Protect the walkways",
    description:
      "Draw the paths that must stay clear. RoomScale flags overlaps, wall intersections, blocked doorways, and anything that narrows a route below its minimum.",
  },
  {
    title: "Compare layouts",
    description:
      "Save several arrangements of the same room, switch between them, and see which one survives validation without losing the layout you started from.",
  },
  {
    title: "See it in plan or in 3D",
    description:
      "A top-down plan view and a perspective view of the same data. Everything is also editable with numbers and the keyboard — the canvas is never the only way in.",
  },
  {
    title: "Keep your data",
    description:
      "Projects live in your browser's IndexedDB. No account, no server, no upload. Export to JSON or CSV whenever you want to take it elsewhere.",
  },
] as const;

const MINIMUM_WALKWAY_METERS = metersFromInches(36);
const PREFERRED_WALKWAY_METERS = metersFromInches(42);

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-16 sm:px-8 sm:py-24">
      <header className="flex flex-col gap-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] opacity-60">
          Open source · Local first
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          RoomScale
        </h1>
        <p className="text-lg leading-relaxed opacity-80">
          Find out whether the furniture actually fits — before it is delivered.
          RoomScale checks real product dimensions against a room you have
          measured, and keeps the walkways you need clear.
        </p>
        <p className="text-sm leading-relaxed opacity-60">
          Dimensional correctness over photorealism. A sofa that renders
          beautifully but blocks the hallway is a bad answer.
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
          Steps 1 to 7 of 15 are done. A rectangular room can be measured and
          seen to scale{" "}
          <Link href="/plan" className="underline underline-offset-4">
            in plan
          </Link>
          , and furniture can be entered at its exact dimensions with prices and
          links{" "}
          <Link href="/furniture" className="underline underline-offset-4">
            in the catalogue
          </Link>
          . Furniture can be placed in the room at its true footprint, and it is
          all saved in your browser. Moving and rotating what you placed is
          next. See{" "}
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
