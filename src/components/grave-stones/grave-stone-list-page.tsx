import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { GraveStoneCard } from "./grave-stone-card";
import { GraveStoneFilter } from "./grave-stone-filter";
import { GraveStoneCatalogEmpty, GraveStoneFilteredEmpty } from "./grave-stone-list-states";
import type { GraveStoneFilters, GraveStoneListModel } from "@/lib/grave-stone-list";
import {
  NEUTRAL_GRAVE_STONE_FILTERS,
  filterGraveStoneItems,
  hasActiveGraveStoneFilters,
} from "@/lib/grave-stone-list";

const SECTION =
  "mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12";
const FULL = "col-span-4 md:col-span-8 lg:col-span-12";
const RESULTS_ID = "grave-stone-results";

const numberFormatter = new Intl.NumberFormat("fa-IR");

const PATH_BUTTON =
  "inline-flex min-h-11 items-center justify-center border px-5 py-2 text-sm font-bold transition-colors duration-[180ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";
const PATH_IDLE = "border-border-control bg-surface text-text-primary hover:bg-surface-media";
const PATH_SELECTED = "border-action-primary bg-action-primary text-text-inverse";

export function GraveStoneListPage({ model }: { model: GraveStoneListModel }) {
  const [filters, setFilters] = useState<GraveStoneFilters>(NEUTRAL_GRAVE_STONE_FILTERS);

  const visible = useMemo(
    () => filterGraveStoneItems(model.items, filters),
    [model.items, filters],
  );
  const catalogEmpty = model.items.length === 0;
  const reset = () => setFilters(NEUTRAL_GRAVE_STONE_FILTERS);

  return (
    <section className={SECTION}>
      <div className={FULL}>
        <h1 className="text-2xl font-bold text-text-primary">فروشگاه سنگ مزار</h1>
        <p className="pt-3 text-sm text-text-secondary">
          محصولات فعال را بر اساس نوع اجرا، کد سنگ و اندازه بررسی کنید.
        </p>
      </div>

      <div className={`${FULL} flex flex-wrap gap-3`}>
        <button
          type="button"
          aria-controls={RESULTS_ID}
          aria-pressed={filters.type === "simple"}
          onClick={() => setFilters((prev) => ({ ...prev, type: "simple" }))}
          className={`${PATH_BUTTON} ${filters.type === "simple" ? PATH_SELECTED : PATH_IDLE}`}
        >
          سنگ مزار ساده
        </button>
        <button
          type="button"
          aria-controls={RESULTS_ID}
          aria-pressed={filters.type === "cnc_box"}
          onClick={() => setFilters((prev) => ({ ...prev, type: "cnc_box" }))}
          className={`${PATH_BUTTON} ${filters.type === "cnc_box" ? PATH_SELECTED : PATH_IDLE}`}
        >
          اجرای CNC
        </button>
        <Link to="/grave-stones/custom" className={`${PATH_BUTTON} ${PATH_IDLE}`}>
          سفارش سفارشی
        </Link>
      </div>

      {catalogEmpty ? (
        <GraveStoneCatalogEmpty />
      ) : (
        <>
          <GraveStoneFilter
            filters={filters}
            stoneCodes={model.stoneCodes}
            controlsId={RESULTS_ID}
            onChange={setFilters}
            onReset={reset}
            showReset={hasActiveGraveStoneFilters(filters)}
          />

          <p className={`${FULL} text-sm text-text-secondary`} aria-live="polite">
            {numberFormatter.format(visible.length)} محصول
          </p>

          <div id={RESULTS_ID} className={FULL}>
            {visible.length === 0 ? (
              <div className="grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12">
                <GraveStoneFilteredEmpty onReset={reset} />
              </div>
            ) : (
              <ul className="grid grid-cols-4 gap-4 md:grid-cols-8 lg:grid-cols-12">
                {visible.map((item) => (
                  <GraveStoneCard key={item.slug} item={item} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
