import { useEffect, useId, useRef, useState } from "react";
import { LocaleLink, useT } from "@/lib/i18n/react";
import { PRIMARY_CTA, PRIMARY_NAV, SECONDARY_NAV } from "@/lib/navigation";

/** Disclosure, not a modal: normal tab order and Escape returns to its trigger. */
export function MobileNavigation() {
  const t = useT();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className="lg:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          trigger.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-12 min-w-12 items-center justify-center border border-border-control bg-surface px-3 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {open ? t("بستن منو") : t("منو")}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border-control bg-surface"
      >
        <nav aria-label={t("ناوبری موبایل")} className="site-container py-4">
          <ul>
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
              <li key={item.to}>
                <LocaleLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center border-b border-border-subtle text-base text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  activeProps={{
                    className: "text-action-primary underline",
                    "aria-current": "page",
                  }}
                >
                  {t(item.label)}
                </LocaleLink>
              </li>
            ))}
            <li className="pt-4">
              <LocaleLink
                to={PRIMARY_CTA.to}
                onClick={() => setOpen(false)}
                className="ui-action w-full"
              >
                {t(PRIMARY_CTA.label)}
              </LocaleLink>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
