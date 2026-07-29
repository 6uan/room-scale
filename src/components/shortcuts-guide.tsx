"use client";

import { useEffect, useRef } from "react";
import { shortcutGroups } from "@/components/shortcuts";
import type { DisplayUnit } from "@/domain/units";

export type ShortcutsGuideProps = {
  unit: DisplayUnit;
  onClose: () => void;
};

/**
 * What every key and gesture does, printed from the table that binds them.
 *
 * Nothing in here is written by hand — `shortcuts.ts` owns both the matching
 * and the wording, so a key that stops working stops being listed. The
 * distances read in the reader's own unit, which the sentence this replaced
 * did not: it told somebody working in inches about centimeters.
 *
 * A dialog rather than a panel, because it is read once and dismissed, and it
 * should not cost the plan any of its space to exist.
 */
export function ShortcutsGuide({ unit, onClose }: ShortcutsGuideProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Moved into the dialog, so Escape and the close button are reachable from
  // wherever the pointer or the keyboard happened to be.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="What the keys do"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-black/10 bg-white p-5 shadow-xl outline-none dark:border-white/15 dark:bg-neutral-900"
      >
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-tight">
            What the keys do
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {shortcutGroups().map(({ group, shortcuts }) => (
            <section key={group}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider opacity-50">
                {group}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {shortcuts.map((one) => (
                  <div key={one.id} className="flex items-baseline gap-3">
                    <dt className="flex shrink-0 gap-1">
                      {one.keys.map((cap, index) => (
                        <kbd
                          key={`${one.id}-${index}`}
                          className="rounded border border-black/15 bg-black/[0.04] px-1.5 py-0.5 font-mono text-[11px] dark:border-white/20 dark:bg-white/10"
                        >
                          {cap}
                        </kbd>
                      ))}
                    </dt>
                    <dd className="text-xs leading-relaxed opacity-70">
                      {one.describe(unit)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <p className="mt-5 text-xs leading-relaxed opacity-50">
          Every one of these is also a number you can type. The keys are a
          faster way to the same value, never the only way to it.
        </p>
      </div>
    </div>
  );
}
