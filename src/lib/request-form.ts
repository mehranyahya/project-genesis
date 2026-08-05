/**
 * Pure shared request-form contract.
 *
 * No network, no storage, no navigation, no fixtures. Every value is derived
 * from the caller's inputs; nothing here mutates its arguments.
 */

import type { PriceType } from "./content/types";
import type { GraveStoneRequestDraft } from "./request-draft";

/* -------------------------------------------------------------------------- */
/* Sources                                                                     */
/* -------------------------------------------------------------------------- */

export interface GraveStoneRequestSource {
  readonly kind: "grave_stone";
  readonly draft: GraveStoneRequestDraft;
}

export interface ContactRequestSource {
  readonly kind: "contact";
  readonly portfolioReferenceId: string | null;
}

export type RequestSource = GraveStoneRequestSource | ContactRequestSource;

/** Reserved for Prompt 09. No runtime instance exists in this scaffold. */
export type BuildingStoneRequestKind = "building_stone";

export type RequestKind = RequestSource["kind"] | BuildingStoneRequestKind;

/* -------------------------------------------------------------------------- */
/* Terms document (M7)                                                         */
/* -------------------------------------------------------------------------- */

export interface RequestTermsDocument {
  readonly version: string;
  readonly contentHash: string;
}

export const TERMS_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isRequestTermsDocument(value: unknown): value is RequestTermsDocument {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { version?: unknown; contentHash?: unknown };
  if (typeof candidate.version !== "string" || typeof candidate.contentHash !== "string") {
    return false;
  }
  const version = candidate.version.trim();
  if (version.length < 1 || version.length > 80) return false;
  return TERMS_HASH_PATTERN.test(candidate.contentHash);
}

export const SUBMISSION_BLOCKED_TEXT =
  "ثبت آنلاین تا اتصال نسخهٔ نهایی شرایط و زیرساخت سفارش فعال نیست.";

/* -------------------------------------------------------------------------- */
/* Values                                                                      */
/* -------------------------------------------------------------------------- */

export type PreferredContact = "phone" | "whatsapp" | "telegram";

export const PREFERRED_CONTACT_OPTIONS: ReadonlyArray<{
  readonly value: PreferredContact;
  readonly label: string;
}> = [
  { value: "phone", label: "تماس تلفنی" },
  { value: "whatsapp", label: "واتساپ" },
  { value: "telegram", label: "تلگرام" },
];

export interface RequestFormValues {
  readonly customerName: string;
  readonly phone: string;
  readonly city: string;
  readonly locationText: string;
  readonly locationUnknown: boolean;
  readonly preferredContact: PreferredContact | null;
  readonly preferredContactTime: string;
  readonly customerNote: string;
  readonly termsAccepted: boolean;
}

export const EMPTY_REQUEST_FORM_VALUES: RequestFormValues = {
  customerName: "",
  phone: "",
  city: "",
  locationText: "",
  locationUnknown: false,
  preferredContact: null,
  preferredContactTime: "",
  customerNote: "",
  termsAccepted: false,
};

export const LOCATION_UNKNOWN_VALUE = "هنوز مشخص نیست";

export const REQUEST_FIELD_LABELS = {
  customerName: "نام و نام خانوادگی",
  phone: "شماره موبایل",
  city: "شهر",
  locationText: "آرامستان یا محل اجرا",
  preferredContact: "روش تماس ترجیحی",
  preferredContactTime: "زمان مناسب تماس",
  customerNote: "توضیح کوتاه",
  locationUnknown: LOCATION_UNKNOWN_VALUE,
  termsAccepted: "شرایط ثبت را خوانده‌ام و می‌پذیرم.",
} as const;

export type RequestFieldKey = keyof typeof REQUEST_FIELD_LABELS;

export const REQUEST_FIELD_ORDER: readonly RequestFieldKey[] = [
  "customerName",
  "phone",
  "city",
  "locationText",
  "preferredContact",
  "preferredContactTime",
  "customerNote",
  "termsAccepted",
];

export const REQUEST_FIELD_ERRORS = {
  customerName: "نام باید بین ۲ تا ۸۰ نویسه باشد.",
  phone: "شماره موبایل معتبر وارد کنید.",
  cityRequired: "شهر را وارد کنید.",
  cityLength: "نام شهر نباید بیشتر از ۵۰ نویسه باشد.",
  locationRequired: "محل اجرا را وارد کنید یا گزینهٔ هنوز مشخص نیست را انتخاب کنید.",
  locationLength: "محل اجرا نباید بیشتر از ۲۰۰ نویسه باشد.",
  preferredContact: "روش تماس ترجیحی را انتخاب کنید.",
  preferredContactTime: "زمان تماس نباید بیشتر از ۱۰۰ نویسه باشد.",
  customerNote: "توضیح نباید بیشتر از ۱۰۰۰ نویسه باشد.",
  termsAccepted: "پذیرش شرایط ثبت الزامی است.",
} as const;

/* -------------------------------------------------------------------------- */
/* Normalization                                                               */
/* -------------------------------------------------------------------------- */

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const PHONE_PATTERN = /^\+989[0-9]{9}$/;

export function toLatinDigits(value: string): string {
  let out = "";
  for (const char of value) {
    const persian = PERSIAN_DIGITS.indexOf(char);
    if (persian >= 0) {
      out += String(persian);
      continue;
    }
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (arabic >= 0) {
      out += String(arabic);
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * Returns the canonical `+989xxxxxxxxx` form, or null when unusable.
 *
 * Exactly three shapes are accepted: `09xxxxxxxxx`, `989xxxxxxxxx` and
 * `+989xxxxxxxxx`. An international `00` prefix is rejected outright.
 */
export function normalizePhone(value: string): string | null {
  if (typeof value !== "string") return null;
  const compact = toLatinDigits(value).replace(/[\s\-()]/g, "");
  if (compact.length === 0) return null;
  if (compact.startsWith("00")) return null;

  let candidate: string;
  if (/^09[0-9]{9}$/.test(compact)) candidate = `+98${compact.slice(1)}`;
  else if (/^989[0-9]{9}$/.test(compact)) candidate = `+${compact}`;
  else if (/^\+989[0-9]{9}$/.test(compact)) candidate = compact;
  else return null;

  return PHONE_PATTERN.test(candidate) ? candidate : null;
}

function trimmed(value: string): string {
  return value.trim();
}

function optionalText(value: string): string | null {
  const text = value.trim();
  return text.length > 0 ? text : null;
}

/* -------------------------------------------------------------------------- */
/* Extension point (Prompt 09)                                                 */
/* -------------------------------------------------------------------------- */

export interface RequestFormExtensionFieldSlot {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
}

export interface RequestFormExtension<TValues, TPayload> {
  readonly kind: BuildingStoneRequestKind;
  readonly fields: readonly RequestFormExtensionFieldSlot[];
  readonly initialValues: TValues;
  readonly validate: (values: TValues) => Readonly<Record<string, string>>;
  readonly buildPayload: (values: TValues) => TPayload | null;
  readonly resolvePrice?: (values: TValues) => {
    readonly priceType: PriceType;
    readonly amountToman: number | null;
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export interface NormalizedRequestFields {
  readonly customer_name: string;
  readonly phone: string;
  readonly city: string | null;
  readonly location_text: string | null;
  readonly preferred_contact: PreferredContact;
  readonly preferred_contact_time: string | null;
  readonly customer_note: string | null;
}

export type RequestFieldErrors = Readonly<Partial<Record<RequestFieldKey, string>>>;

export interface RequestFormValidation {
  readonly valid: boolean;
  readonly errors: RequestFieldErrors;
  readonly firstInvalidField: RequestFieldKey | null;
  readonly fields: NormalizedRequestFields | null;
}

export function validateRequestForm(input: {
  readonly values: RequestFormValues;
  readonly source: RequestSource;
}): RequestFormValidation {
  const { values, source } = input;
  const errors: Partial<Record<RequestFieldKey, string>> = {};

  const name = trimmed(values.customerName);
  if (name.length < 2 || name.length > 80) errors.customerName = REQUEST_FIELD_ERRORS.customerName;

  const phone = normalizePhone(values.phone);
  if (phone === null) errors.phone = REQUEST_FIELD_ERRORS.phone;

  const graveStone = source.kind === "grave_stone";

  const city = optionalText(values.city);
  if (graveStone && city === null) errors.city = REQUEST_FIELD_ERRORS.cityRequired;
  else if (city !== null && city.length > 50) errors.city = REQUEST_FIELD_ERRORS.cityLength;

  const unknownLocation = graveStone && values.locationUnknown;
  const location = unknownLocation ? LOCATION_UNKNOWN_VALUE : optionalText(values.locationText);
  if (graveStone && location === null) errors.locationText = REQUEST_FIELD_ERRORS.locationRequired;
  else if (location !== null && location.length > 200) {
    errors.locationText = REQUEST_FIELD_ERRORS.locationLength;
  }

  const preferredContact = values.preferredContact;
  if (preferredContact === null) errors.preferredContact = REQUEST_FIELD_ERRORS.preferredContact;

  const contactTime = optionalText(values.preferredContactTime);
  if (contactTime !== null && contactTime.length > 100) {
    errors.preferredContactTime = REQUEST_FIELD_ERRORS.preferredContactTime;
  }

  const note = optionalText(values.customerNote);
  if (note !== null && note.length > 1000) errors.customerNote = REQUEST_FIELD_ERRORS.customerNote;

  if (values.termsAccepted !== true) errors.termsAccepted = REQUEST_FIELD_ERRORS.termsAccepted;

  const firstInvalidField = REQUEST_FIELD_ORDER.find((key) => errors[key] !== undefined) ?? null;
  const valid = firstInvalidField === null;

  return {
    valid,
    errors,
    firstInvalidField,
    fields:
      valid && phone !== null && preferredContact !== null
        ? {
            customer_name: name,
            phone,
            city,
            location_text: location,
            preferred_contact: preferredContact,
            preferred_contact_time: contactTime,
            customer_note: note,
          }
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Payload                                                                     */
/* -------------------------------------------------------------------------- */

interface TermsPayloadFields {
  readonly terms_version: string;
  readonly terms_content_hash: string;
  readonly terms_accepted: true;
}

export interface GraveStoneRequestPayload extends NormalizedRequestFields, TermsPayloadFields {
  readonly submission_id: string;
  readonly request_type: "grave_stone";
  readonly client_catalog_version: string;
  readonly product_id: string;
  readonly product_code: string;
  readonly variant_id: string;
  readonly stone_code: string;
  readonly size_code: string;
  readonly option_ids: readonly string[];
  readonly client_price_type: PriceType;
  readonly client_displayed_price: number | null;
}

export interface ContactRequestPayload extends NormalizedRequestFields, TermsPayloadFields {
  readonly submission_id: string;
  readonly request_type: "contact";
  readonly source_type?: "portfolio";
  readonly portfolio_reference_id?: string;
}

export type RequestPayload = GraveStoneRequestPayload | ContactRequestPayload;

export interface PriceRevision {
  readonly priceType: PriceType;
  readonly amountToman: number | null;
}

function isDisplayableAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Resolves the client-side displayed price, or null when the combination is
 * not a valid client price. An invalid amount is never downgraded to review.
 */
export function resolveClientPrice(
  snapshotPriceType: PriceType,
  snapshotAmount: number | null,
  revision?: PriceRevision | null,
): PriceRevision | null {
  const priceType = revision ? revision.priceType : snapshotPriceType;
  const amount = revision ? revision.amountToman : snapshotAmount;
  if (priceType === "review") {
    return amount === null ? { priceType: "review", amountToman: null } : null;
  }
  if (priceType !== "fixed" && priceType !== "estimate") return null;
  return isDisplayableAmount(amount) ? { priceType, amountToman: amount } : null;
}

export function buildRequestPayload(input: {
  readonly submissionId: string;
  readonly source: RequestSource;
  readonly values: RequestFormValues;
  readonly termsDocument: RequestTermsDocument | null;
  readonly priceRevision?: PriceRevision | null;
}): RequestPayload | null {
  const { submissionId, source, values, termsDocument, priceRevision } = input;

  if (typeof submissionId !== "string" || submissionId.trim().length === 0) return null;
  if (!isRequestTermsDocument(termsDocument)) return null;

  const validation = validateRequestForm({ values, source });
  if (!validation.valid || validation.fields === null) return null;

  const terms: TermsPayloadFields = {
    terms_version: termsDocument.version.trim(),
    terms_content_hash: termsDocument.contentHash,
    terms_accepted: true,
  };

  if (source.kind === "grave_stone") {
    const draft = source.draft;
    const snapshot = draft.displaySnapshot;
    const price = resolveClientPrice(snapshot.priceType, snapshot.amountToman, priceRevision);
    if (price === null) return null;
    return {
      submission_id: submissionId,
      request_type: "grave_stone",
      client_catalog_version: draft.catalogVersion,
      product_id: draft.productId,
      product_code: draft.productCode,
      variant_id: draft.variantId,
      stone_code: draft.stoneCode,
      size_code: draft.sizeCode,
      option_ids: [...draft.optionIds],
      client_price_type: price.priceType,
      client_displayed_price: price.amountToman,
      ...validation.fields,
      ...terms,
    };
  }

  const reference = normalizePortfolioReference(source.portfolioReferenceId);
  const referral =
    reference === null
      ? {}
      : { source_type: "portfolio" as const, portfolio_reference_id: reference };

  return {
    submission_id: submissionId,
    request_type: "contact",
    ...referral,
    ...validation.fields,
    ...terms,
  };
}
