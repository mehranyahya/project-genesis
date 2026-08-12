import type {
  GraveStoneFilters,
  GraveStoneSizeFilter,
  GraveStoneTypeFilter,
} from "@/lib/grave-stone-list";
import { NEUTRAL_FILTER_VALUE } from "@/lib/grave-stone-list";
import { useT } from "@/lib/i18n/react";

export const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "همه نوع‌ها" },
  { value: "simple", label: "سنگ مزار ساده" },
  { value: "cnc_box", label: "اجرای CNC" },
] as const;

export const SIZE_FILTER_OPTIONS = [
  { value: "all", label: "همه اندازه‌ها" },
  { value: "120x60", label: "۱۲۰×۶۰" },
  { value: "160x60", label: "۱۶۰×۶۰" },
  { value: "180x60", label: "۱۸۰×۶۰" },
  { value: "custom", label: "سفارشی" },
] as const;

export const STONE_NEUTRAL_LABEL = "همه سنگ‌ها";
export const RESET_LABEL = "پاک‌کردن فیلترها";

const CONTROL =
  "min-h-11 w-full border border-border-control bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const LABEL = "block pb-2 text-sm text-text-secondary";

export function GraveStoneFilter({
  filters,
  stoneCodes,
  controlsId,
  onChange,
  onReset,
  showReset,
}: {
  const t = useT();
  filters: GraveStoneFilters;
  stoneCodes: readonly string[];
  controlsId: string;
  onChange: (next: GraveStoneFilters) => void;
  onReset: () => void;
  showReset: boolean;
}) {
  return (
    <fieldset className="col-span-4 grid grid-cols-4 gap-4 border border-border-subtle bg-surface p-4 md:col-span-8 md:grid-cols-8 lg:col-span-12 lg:grid-cols-12">
      <legend className="px-1 text-sm font-bold text-text-primary">{t("فیلتر محصولات")}</legend>

      <div className="col-span-4 md:col-span-4 lg:col-span-4">
        <label className={LABEL} htmlFor="grave-stone-filter-type">{t("نوع اجرا")}</label>
        <select
          id="grave-stone-filter-type"
          className={CONTROL}
          value={filters.type}
          aria-controls={controlsId}
          onChange={(event) =>
            onChange({ ...filters, type: event.target.value as GraveStoneTypeFilter })
          }
        >
          {TYPE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-4 md:col-span-4 lg:col-span-4">
        <label className={LABEL} htmlFor="grave-stone-filter-stone">{t("سنگ")}</label>
        <select
          id="grave-stone-filter-stone"
          className={CONTROL}
          value={filters.stoneCode}
          aria-controls={controlsId}
          onChange={(event) => onChange({ ...filters, stoneCode: event.target.value })}
        >
          <option value={NEUTRAL_FILTER_VALUE}>{STONE_NEUTRAL_LABEL}</option>
          {stoneCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      <div className="col-span-4 md:col-span-4 lg:col-span-4">
        <label className={LABEL} htmlFor="grave-stone-filter-size">{t("اندازه")}</label>
        <select
          id="grave-stone-filter-size"
          className={CONTROL}
          value={filters.sizeCode}
          aria-controls={controlsId}
          onChange={(event) =>
            onChange({ ...filters, sizeCode: event.target.value as GraveStoneSizeFilter })
          }
        >
          {SIZE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {showReset ? (
        <div className="col-span-4 md:col-span-8 lg:col-span-12">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-11 items-center border border-border-control bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:bg-surface-media focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
          >
            {RESET_LABEL}
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}
