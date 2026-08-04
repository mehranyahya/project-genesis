import type { ReactNode } from "react";

/**
 * Neutral structural skeleton for a route that has no real content yet.
 * Static blocks only — no motion, no placeholder copy, no fake loading.
 */
export function RouteSkeleton({ title, blocks = 3 }: { title: string; blocks?: number }) {
  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
      </div>
      <div
        aria-hidden="true"
        className="col-span-4 grid grid-cols-4 gap-4 md:col-span-8 md:grid-cols-8 lg:col-span-12 lg:grid-cols-12"
      >
        {Array.from({ length: blocks }, (_, index) => (
          <div
            key={index}
            className="col-span-4 h-24 border border-border-subtle bg-surface-media md:col-span-4 lg:col-span-4"
          />
        ))}
      </div>
    </section>
  );
}

export function RouteSection({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 px-4 pb-10 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">{children}</div>
    </section>
  );
}
