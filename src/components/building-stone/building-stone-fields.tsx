import type { ReactNode } from "react";

import type { BuildingStoneApplication, BuildingStoneType } from "@/lib/content/types";
import type { BuildingStoneValues } from "@/lib/building-stone";
import {
  BUILDING_STONE_APPLICATION_OPTIONS,
  BUILDING_STONE_FIELD_LABELS,
  BUILDING_STONE_LEGENDS,
  BUILDING_STONE_OTHER_HELPER,
  BUILDING_STONE_TYPE_OPTIONS,
  buildingStoneErrorId,
  buildingStoneFieldId,
} from "@/lib/building-stone";
import { useT } from "@/lib/i18n/react";

const CONTROL =
  "min-h-11 w-full border border-border-control bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-45";
const ROW =
  "flex min-h-11 items-start gap-3 border border-border-subtle bg-surface p-3 has-[:checked]:border-2 has-[:checked]:border-action-primary";
const CHOICE =
  "mt-1 h-5 w-5 shrink-0 accent-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  const t = useT();
  if (message === undefined) return null;
  return (
    <p id={id} role="alert" className="text-sm text-status-error">
      {t("خطا")}: {t(message)}
    </p>
  );
}

function RadioGroup<TValue extends string>({
  fieldKey,
  legend,
  options,
  value,
  error,
  disabled,
  onSelect,
}: {
  fieldKey: string;
  legend: string;
  options: readonly { readonly value: TValue; readonly label: string }[];
  value: TValue | null;
  error: string | undefined;
  disabled: boolean;
  onSelect: (next: TValue) => void;
}) {
  const errId = buildingStoneErrorId(fieldKey);
  return (
    <fieldset className="border border-border-subtle p-4">
      <legend className="px-2 text-sm font-bold text-text-primary">{legend}</legend>
      <div className="flex flex-col gap-3 pt-2">
        {options.map((option, index) => {
          // The first control carries the group id so focus lands on the group.
          const id =
            index === 0
              ? buildingStoneFieldId(fieldKey)
              : `${buildingStoneFieldId(fieldKey)}-${option.value}`;
          return (
            <label key={option.value} className={ROW} htmlFor={id}>
              <input
                id={id}
                type="radio"
                name={`building-stone-${fieldKey}`}
                className={CHOICE}
                value={option.value}
                checked={value === option.value}
                disabled={disabled}
                aria-invalid={error ? true : undefined}
                aria-errormessage={error ? errId : undefined}
                onChange={() => onSelect(option.value)}
              />
              <span className="text-sm text-text-primary">{t(option.label)}</span>
            </label>
          );
        })}
      </div>
      <FieldError id={errId} message={error} />
    </fieldset>
  );
}

/**
 * The building-stone extension fields. They render inside the shared form, so
 * there is no nested form and no independent submit here.
 */
export function BuildingStoneFields({
  values,
  errors,
  disabled,
  onChange,
}: {
  values: BuildingStoneValues;
  errors: Readonly<Record<string, string>>;
  disabled: boolean;
  onChange: (next: Partial<BuildingStoneValues>) => void;
}): ReactNode {
  const areaId = buildingStoneFieldId("areaM2");
  const areaErrorId = buildingStoneErrorId("areaM2");
  const areaError = errors["areaM2"];

  return (
    <div className="flex flex-col gap-5">
      <RadioGroup<BuildingStoneType>
        fieldKey="stoneType"
        legend={BUILDING_STONE_LEGENDS.stoneType}
        options={BUILDING_STONE_TYPE_OPTIONS}
        value={values.stoneType}
        error={errors["stoneType"]}
        disabled={disabled}
        onSelect={(stoneType) => onChange({ stoneType })}
      />

      <RadioGroup<BuildingStoneApplication>
        fieldKey="application"
        legend={BUILDING_STONE_LEGENDS.application}
        options={BUILDING_STONE_APPLICATION_OPTIONS}
        value={values.application}
        error={errors["application"]}
        disabled={disabled}
        onSelect={(application) => onChange({ application })}
      />

      {values.application === "other" ? (
        <p className="text-sm text-text-secondary">{BUILDING_STONE_OTHER_HELPER}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={areaId} className="text-sm font-bold text-text-primary">
          {BUILDING_STONE_FIELD_LABELS.areaM2}
        </label>
        <input
          id={areaId}
          type="text"
          inputMode="decimal"
          dir="ltr"
          className={CONTROL}
          value={values.areaM2Input}
          disabled={disabled}
          aria-invalid={areaError ? true : undefined}
          aria-errormessage={areaError ? areaErrorId : undefined}
          onChange={(event) => onChange({ areaM2Input: event.currentTarget.value })}
        />
        <FieldError id={areaErrorId} message={areaError} />
      </div>
    </div>
  );
}
