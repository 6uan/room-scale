"use client";

import { cn } from "@/components/cn";

/**
 * One band of a side panel: a name, the one thing it adds, and its rows.
 *
 * The panel was laid out a row at a time and ended up with six text sizes,
 * nine spacings and no two groups on the same rhythm. This owns the rhythm so
 * a row cannot invent one: 16px between rows inside a section, 24px between
 * sections, and a hairline above every section but the first.
 *
 * A section never draws its own divider from the inside. That was how the
 * panel ended up with a rule above the openings, none above the corners, and
 * two above the wall thickness.
 */
export function PanelSection({
  title,
  action,
  first = false,
  children,
}: {
  title: string;
  /** The one thing this section adds, drawn beside its name. */
  action?: React.ReactNode;
  /** The first section carries no divider, having nothing above it. */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-col gap-4 py-6",
        first ? "pt-0" : "border-t border-black/10 dark:border-white/15",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
