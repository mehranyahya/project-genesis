import { Link } from "@tanstack/react-router";

import { MobileNavigation } from "./mobile-navigation";
import { PRIMARY_CTA, PRIMARY_NAV } from "@/lib/navigation";

/** Solid Limestone header. No transparency, no glass, no elevation. */
export function SiteHeader() {
  return (
    <header className="border-b border-border-subtle bg-surface">
      <div className="mx-auto grid w-full max-w-[80rem] grid-cols-4 items-center gap-x-4 px-4 py-3 md:grid-cols-8 lg:grid-cols-12">
        <div className="col-span-3 flex items-center md:col-span-4 lg:col-span-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center text-lg font-bold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            مهرآرا
          </Link>
        </div>

        <nav
          aria-label="ناوبری اصلی"
          className="col-span-6 hidden lg:col-span-6 lg:flex lg:flex-wrap lg:items-center lg:gap-x-4"
        >
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="inline-flex min-h-11 items-center px-1 text-sm text-text-secondary transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
              activeProps={{
                className: "font-bold text-action-primary",
                "aria-current": "page",
              }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="col-span-1 flex items-center justify-end md:col-span-4 lg:col-span-3">
          <Link
            to={PRIMARY_CTA.to}
            className="hidden min-h-11 items-center border border-action-primary bg-action-primary px-5 text-sm font-bold text-text-inverse transition-colors duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none lg:inline-flex"
          >
            {PRIMARY_CTA.label}
          </Link>
          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}
