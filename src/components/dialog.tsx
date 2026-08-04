"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { IconButton } from "@/components/icon-button";

export type DialogProps = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * A panel over the plan, read and dismissed.
 *
 * Both of the things that open this way — what the keys do, and the settings —
 * are asides to the work rather than part of it, and neither should cost the
 * plan any of its space to exist. Escape closes it, the backdrop closes it, and
 * focus moves inside so both of those are reachable from wherever the pointer
 * happened to be.
 */
export function Dialog({ title, onClose, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-black/10 bg-white p-5 shadow-xl outline-none dark:border-white/15 dark:bg-neutral-900"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <IconButton label="Close" icon={X} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

/** A titled band inside a dialog, so a panel of settings reads as groups. */
export function DialogSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-black/8 py-4 first:border-t-0 first:pt-0 last:pb-0 dark:border-white/12">
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-medium uppercase tracking-[0.15em] opacity-50">
          {title}
        </h3>
        {description === undefined ? null : (
          <p className="text-xs leading-relaxed opacity-60">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
