import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";

import { PRIMARY_CTA, PRIMARY_NAV } from "@/lib/navigation";

/**
 * Keyboard-operable mobile navigation. Solid surface panel, no overlay effects,
 * no third-party package, motion capped at the 250ms panel token.
 */
export function MobileNavigation() {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-border-control bg-surface px-4 text-sm font-bold text-text-primary transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
      >
        {open ? "بستن منو" : "منوی ناوبری"}
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-0 z-10 border-y border-border-subtle bg-surface px-4 py-2"
        >
          <nav aria-label="ناوبری موبایل">
            <ul className="grid grid-cols-4 gap-x-4 md:grid-cols-8">
              {PRIMARY_NAV.map((item) => (
                <li key={item.to} className="col-span-4 md:col-span-8">
                  <Link
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center border-b border-border-subtle text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    activeProps={{ className: "font-bold text-action-primary" }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="col-span-4 py-2 md:col-span-8">
                <Link
                  to={PRIMARY_CTA.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center justify-center border border-action-primary bg-action-primary px-5 text-sm font-bold text-text-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {PRIMARY_CTA.label}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
