import type { Translator } from "./i18n/messages";
import type { RequestFormValues } from "./request-form";
import type { StoneworkCategoryId } from "./stonework-category";

/** Public category context is separate from the editable brief and contact fields. */
export interface StoneworkRequestContext {
  readonly id: StoneworkCategoryId;
  readonly label: string;
}

export function stoneworkRequestIdentity(
  sourceIdentity: string,
  context: StoneworkRequestContext | null,
): string {
  return context ? `${sourceIdentity}~stoneworks=${context.id}` : sourceIdentity;
}

/** Use the existing note payload; never put dimensions or free text in search params. */
export function valuesForStoneworkRequest(
  values: RequestFormValues,
  context: StoneworkRequestContext | null,
  t: Translator,
): RequestFormValues {
  if (!context) return values;
  const category = t("درخواست ساخت: {category}", { category: context.label });
  return { ...values, customerNote: `${category}\n${values.customerNote}`.trim() };
}

/** The existing server note limit includes the category and its line break. */
export function stoneworkNoteLimit(context: StoneworkRequestContext, t: Translator): number {
  return 1000 - t("درخواست ساخت: {category}", { category: context.label }).length - 1;
}
