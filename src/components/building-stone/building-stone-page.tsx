import { useState } from "react";

import { BuildingStoneFields } from "./building-stone-fields";
import { BuildingStoneSummary } from "./building-stone-summary";
import { RequestForm } from "@/components/request-form/request-form";
import type { BuildingStoneFormBinding } from "@/components/request-form/request-form";
import type { BuildingStoneValues } from "@/lib/building-stone";
import {
  EMPTY_BUILDING_STONE_VALUES,
  buildingStoneExtension,
  buildingStoneFieldId,
} from "@/lib/building-stone";
import type { Site } from "@/lib/content/types";
import type { RequestTermsDocument } from "@/lib/request-form";

export const BUILDING_STONE_HEADING = "درخواست بررسی سنگ ساختمانی";
export const BUILDING_STONE_INTRO =
  "نوع سنگ و کاربرد موردنظر را انتخاب کنید و در صورت مشخص‌بودن، مساحت را به متر مربع وارد کنید. پس از بررسی امکان تأمین و اجرا، برای هماهنگی با شما تماس می‌گیریم.";
export const BUILDING_STONE_SECTION_HEADING = "مشخصات درخواست";

export function BuildingStonePage({
  site,
  termsDocument,
}: {
  site: Site | null;
  termsDocument: RequestTermsDocument | null;
}) {
  const [selection, setSelection] = useState<BuildingStoneValues>(
    buildingStoneExtension.initialValues ?? EMPTY_BUILDING_STONE_VALUES,
  );

  // The page binds the pure extension contract, its current values and its
  // renderer together; the shared form owns validation, payload and price.
  const binding: BuildingStoneFormBinding = {
    kind: "building_stone",
    contract: buildingStoneExtension,
    values: selection,
    fieldId: buildingStoneFieldId,
    renderExtensionFields: ({ errors, disabled }) => (
      <BuildingStoneFields
        values={selection}
        errors={errors}
        disabled={disabled}
        onChange={(next) => setSelection((current) => ({ ...current, ...next }))}
      />
    ),
  };

  return (
    <section className="mx-auto grid w-full max-w-[80rem] grid-cols-4 gap-x-4 gap-y-6 px-4 py-10 md:grid-cols-8 lg:grid-cols-12">
      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h1 className="text-2xl font-bold text-text-primary">{BUILDING_STONE_HEADING}</h1>
        <p className="pt-2 text-sm text-text-secondary">{BUILDING_STONE_INTRO}</p>
      </div>

      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <BuildingStoneSummary values={selection} />
      </div>

      <div className="col-span-4 md:col-span-8 lg:col-span-12">
        <h2 className="pb-4 text-lg font-bold text-text-primary">
          {BUILDING_STONE_SECTION_HEADING}
        </h2>
        <RequestForm
          source={{ kind: "building_stone", selection }}
          site={site}
          termsDocument={termsDocument}
          extension={binding}
        />
      </div>
    </section>
  );
}
