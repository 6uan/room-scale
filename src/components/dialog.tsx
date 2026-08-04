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
  return (
    <Overlay
      title={title}
      onClose={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]"
      panelClassName="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-black/10 bg-white p-5 shadow-xl outline-none dark:border-white/15 dark:bg-neutral-900"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <IconButton label="Close" icon={X} onClick={onClose} />
      </div>
      {children}
    </Overlay>
  );
}

/**
 * A sheet down the right-hand edge, over the plan rather than beside it.
 *
 * The difference from `Dialog` is what it holds: a dialog is a few controls
 * read once, and this is a document consulted while the plan is still the thing
 * being worked on. So it takes the edge rather than the middle, and it is wide
 * — a shopping list is a table with five columns in it, and squeezing that into
 * a settings box would be the same mistake as squeezing it into the inspector.
 *
 * `footer` holds the actions that belong to the document, at the end of it.
 * Nothing but Close goes in the header: the top-right corner of a sheet is
 * where a hand goes to dismiss it, and anything sharing that corner gets
 * pressed by somebody who meant to shut the thing. It is also the wrong place
 * to read them — an action on a document is decided after the document, not
 * before it.
 */
export function Drawer({
  title,
  onClose,
  footer,
  children,
}: DialogProps & { footer?: React.ReactNode }) {
  return (
    <Overlay
      title={title}
      onClose={onClose}
      className="fixed inset-0 z-50 bg-black/25"
      panelClassName="absolute inset-y-0 right-0 flex w-[34rem] max-w-full flex-col overflow-y-auto border-l border-black/10 bg-white shadow-2xl outline-none dark:border-white/15 dark:bg-neutral-900"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-black/10 bg-white/85 px-5 py-3 backdrop-blur dark:border-white/15 dark:bg-neutral-900/85">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <IconButton label="Close" icon={X} onClick={onClose} />
      </div>
      <div className="p-5">{children}</div>
      {footer === undefined ? null : (
        <div className="mt-auto flex justify-end gap-2 border-t border-black/10 px-5 py-3 dark:border-white/15">
          {footer}
        </div>
      )}
    </Overlay>
  );
}

/**
 * The part both shapes share: a scrim that closes, a labelled panel that does
 * not, Escape from inside it, and focus moved in so Escape is reachable from
 * wherever the pointer happened to be.
 */
function Overlay({
  title,
  onClose,
  className,
  panelClassName,
  children,
}: DialogProps & { className: string; panelClassName: string }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div className={className} onClick={onClose}>
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
        className={panelClassName}
      >
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
