"use client";

import { Printer, ReceiptText, X } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { IconButton, LabelledButton } from "@/components/icon-button";
import { ProjectChecklist } from "@/components/project-checklist";

/**
 * The three ways the shopping list could open, side by side in one frame.
 *
 * Throwaway. This exists to be looked at and argued with, and to be deleted
 * once one of them is chosen — it is wired to the real project, so the list in
 * each variation holds whatever is actually in the plan rather than a fixture
 * that flatters the layout.
 *
 * The plan behind it is drawn rather than real: the question is how much of the
 * workspace each variation costs you, and a grey rectangle answers that as well
 * as a canvas would.
 */
type Variant = "drawer" | "tab" | "page";

const VARIANTS: readonly { id: Variant; name: string; note: string }[] = [
  {
    id: "drawer",
    name: "Drawer over the plan",
    note: "Slides in from the right, Esc closes it, the plan stays where it was. Printing is a button inside it that opens the page.",
  },
  {
    id: "tab",
    name: "Tab in the inspector",
    note: "The right column becomes the list. Nothing overlays anything, but the totals live in a 20rem column.",
  },
  {
    id: "page",
    name: "Its own page",
    note: "What happens today: the workspace goes away and a document arrives. Best to print, worst to glance at.",
  },
];

export function ListVariants() {
  const [variant, setVariant] = useState<Variant>("drawer");
  const [open, setOpen] = useState(true);
  const chosen = VARIANTS.find((one) => one.id === variant);

  return (
    <div className="grid h-dvh grid-rows-[auto_auto_minmax(0,1fr)] bg-black/[0.02] dark:bg-white/[0.02]">
      <header className="flex flex-wrap items-center gap-3 border-b border-black/10 px-4 py-2 dark:border-white/15">
        <h1 className="text-sm font-semibold tracking-tight">
          Where should the list open?
        </h1>
        <div className="flex gap-1 rounded-lg bg-black/[0.05] p-0.5 dark:bg-white/[0.07]">
          {VARIANTS.map((one) => (
            <button
              key={one.id}
              type="button"
              aria-pressed={variant === one.id}
              onClick={() => {
                setVariant(one.id);
                setOpen(true);
              }}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                variant === one.id
                  ? "bg-white font-medium shadow-sm dark:bg-neutral-700"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              {one.name}
            </button>
          ))}
        </div>
        {open ? null : (
          <LabelledButton
            label="Open the list again"
            icon={ReceiptText}
            onClick={() => setOpen(true)}
          />
        )}
      </header>

      <p className="border-b border-black/10 px-4 py-2 text-xs leading-relaxed opacity-60 dark:border-white/15">
        {chosen?.note}
      </p>

      <div className="relative grid min-h-0 grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,20rem)]">
        <FakePanel side="left" />
        <FakePlan />

        {variant === "tab" && open ? (
          <aside className="min-h-0 overflow-y-auto border-l border-black/10 dark:border-white/15">
            <div className="flex items-center gap-1 border-b border-black/10 px-2 dark:border-white/15">
              <FakeTab>Inspector</FakeTab>
              <FakeTab current>The list</FakeTab>
              <span className="ml-auto">
                <IconButton
                  label="Close the list"
                  icon={X}
                  size="small"
                  onClick={() => setOpen(false)}
                />
              </span>
            </div>
            <div className="p-4 text-xs">
              <ProjectChecklist />
            </div>
          </aside>
        ) : (
          <FakePanel side="right" />
        )}

        {variant === "drawer" && open ? (
          <>
            <div
              className="absolute inset-0 bg-black/25"
              onClick={() => setOpen(false)}
            />
            <aside
              aria-label="The list"
              className="absolute inset-y-0 right-0 flex w-[30rem] max-w-full flex-col overflow-y-auto border-l border-black/10 bg-white shadow-2xl dark:border-white/15 dark:bg-neutral-900"
            >
              <div className="flex items-center justify-between gap-4 border-b border-black/10 px-5 py-3 dark:border-white/15">
                <h2 className="text-sm font-semibold tracking-tight">
                  The list
                </h2>
                <div className="flex items-center gap-2">
                  <LabelledButton
                    label="Print this list"
                    icon={Printer}
                    onClick={() => {}}
                  />
                  <IconButton
                    label="Close the list"
                    icon={X}
                    onClick={() => setOpen(false)}
                  />
                </div>
              </div>
              <div className="p-5">
                <ProjectChecklist />
              </div>
            </aside>
          </>
        ) : null}

        {variant === "page" && open ? (
          <Dialog title="Its own page" onClose={() => setOpen(false)}>
            <p className="mb-4 text-xs leading-relaxed opacity-60">
              Standing in for a full navigation: the workspace behind this is
              gone entirely, and coming back is a second navigation.
            </p>
            <ProjectChecklist />
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}

function FakeTab({
  children,
  current = false,
}: {
  children: React.ReactNode;
  current?: boolean;
}) {
  return (
    <span
      className={`border-b-2 px-2 py-2 text-xs ${
        current ? "border-current font-medium" : "border-transparent opacity-50"
      }`}
    >
      {children}
    </span>
  );
}

/** A side panel, drawn rather than rendered — it is only here for its width. */
function FakePanel({ side }: { side: "left" | "right" }) {
  return (
    <div
      className={`flex min-h-0 flex-col gap-3 overflow-hidden p-4 ${
        side === "left"
          ? "border-r border-black/10 dark:border-white/15"
          : "border-l border-black/10 dark:border-white/15"
      }`}
    >
      <div className="h-2.5 w-24 rounded bg-current opacity-15" />
      {Array.from({ length: side === "left" ? 9 : 5 }, (_, row) => (
        <div
          key={row}
          className="h-3 rounded bg-current opacity-[0.07]"
          style={{ width: `${55 + ((row * 37) % 40)}%` }}
        />
      ))}
    </div>
  );
}

function FakePlan() {
  return (
    <div className="relative min-h-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute inset-12 rounded border-8 border-current opacity-15" />
      <p className="absolute inset-x-0 top-1/2 text-center text-xs opacity-40">
        the plan
      </p>
    </div>
  );
}
