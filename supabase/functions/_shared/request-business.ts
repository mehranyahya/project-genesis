import { CURRENT_TERMS_RELEASE } from "./terms-registry.generated.ts";
import type {
  BotVerification,
  BuildingStonePayload,
  ContactPayload,
  GraveStonePayload,
  RequestPayload,
  RiskFlag,
} from "./request-contract.ts";
import { supabaseRest, supabaseRpc } from "./supabase-rest.ts";
import type { SupabaseServerConfig } from "./supabase-rest.ts";

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const TRACKING_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

type PriceType = "fixed" | "estimate" | "review";

interface ProductRow {
  readonly id: string;
  readonly code: string;
  readonly is_active: boolean;
}

interface VariantRow {
  readonly id: string;
  readonly product_id: string;
  readonly stone_code: string;
  readonly size_code: "120x60" | "160x60" | "180x60" | "custom";
  readonly price_type: PriceType;
  readonly amount_toman: number | null;
  readonly includes: readonly string[];
  readonly excludes: readonly string[];
  readonly is_available: boolean;
}

interface OptionRow {
  readonly id: string;
  readonly variant_id: string;
  readonly title: string;
  readonly price_type: PriceType;
  readonly amount_toman: number | null;
  readonly is_available: boolean;
  readonly compatible_size_codes: readonly string[];
  readonly sort_order: number;
}

interface PortfolioRow {
  readonly public_reference_id: string;
  readonly is_active: boolean;
}

export interface StorageInput extends Readonly<Record<string, unknown>> {
  readonly p_submission_id: string;
  readonly p_request_fingerprint: string;
  readonly p_request_fingerprint_key_id: string;
  readonly p_request_type: RequestPayload["request_type"];
  readonly p_client_catalog_version: string | null;
  readonly p_server_catalog_version: string | null;
  readonly p_configuration_snapshot: Readonly<Record<string, unknown>>;
  readonly p_price_snapshot: Readonly<Record<string, unknown>> | null;
  readonly p_customer_name: string;
  readonly p_phone_normalized: string;
  readonly p_city: string | null;
  readonly p_location_text: string | null;
  readonly p_preferred_contact: RequestPayload["preferred_contact"];
  readonly p_preferred_contact_time: string | null;
  readonly p_customer_note: string | null;
  readonly p_terms_version: string;
  readonly p_terms_content_hash: string;
  readonly p_bot_verification: BotVerification;
  readonly p_risk_flags: readonly RiskFlag[];
  readonly p_ip_hash: string | null;
  readonly p_tracking_code_prefix: string;
}

export type BusinessResult =
  | {
      readonly ok: true;
      readonly storage: StorageInput;
    }
  | {
      readonly ok: false;
      readonly status: 409 | 503;
      readonly body:
        | { readonly code: "SELECTION_UNAVAILABLE" }
        | {
            readonly code: "PRICE_CHANGED";
            readonly price: {
              readonly price_type: PriceType;
              readonly amount_toman: number | null;
            };
          }
        | {
            readonly code: "TERMS_UPDATED";
            readonly terms: { readonly version: string; readonly content_hash: string };
          }
        | { readonly code: "TEMPORARILY_UNAVAILABLE" };
    };

function temporaryUnavailable(): BusinessResult {
  return { ok: false, status: 503, body: { code: "TEMPORARILY_UNAVAILABLE" } };
}

function selectionUnavailable(): BusinessResult {
  return { ok: false, status: 409, body: { code: "SELECTION_UNAVAILABLE" } };
}

function commonStorage(
  request: RequestPayload,
  input: {
    fingerprint: string;
    fingerprintKeyId: string;
    botVerification: BotVerification;
    riskFlags: readonly RiskFlag[];
    ipHash: string | null;
    trackingCodePrefix: string;
  },
): Pick<
  StorageInput,
  | "p_submission_id"
  | "p_request_fingerprint"
  | "p_request_fingerprint_key_id"
  | "p_request_type"
  | "p_customer_name"
  | "p_phone_normalized"
  | "p_city"
  | "p_location_text"
  | "p_preferred_contact"
  | "p_preferred_contact_time"
  | "p_customer_note"
  | "p_terms_version"
  | "p_terms_content_hash"
  | "p_bot_verification"
  | "p_risk_flags"
  | "p_ip_hash"
  | "p_tracking_code_prefix"
> {
  return {
    p_submission_id: request.submission_id,
    p_request_fingerprint: input.fingerprint,
    p_request_fingerprint_key_id: input.fingerprintKeyId,
    p_request_type: request.request_type,
    p_customer_name: request.customer_name,
    p_phone_normalized: request.phone,
    p_city: request.city,
    p_location_text: request.location_text,
    p_preferred_contact: request.preferred_contact,
    p_preferred_contact_time: request.preferred_contact_time,
    p_customer_note: request.customer_note,
    p_terms_version: request.terms_version,
    p_terms_content_hash: request.terms_content_hash,
    p_bot_verification: input.botVerification,
    p_risk_flags: input.riskFlags,
    p_ip_hash: input.ipHash,
    p_tracking_code_prefix: input.trackingCodePrefix,
  };
}

function validateTerms(request: RequestPayload): BusinessResult | null {
  const current = CURRENT_TERMS_RELEASE;
  if (current === null) return temporaryUnavailable();
  if (
    current.version.trim() === "" ||
    !HASH_PATTERN.test(current.currentContentHash) ||
    current.allowedContentHashes.length === 0 ||
    !current.allowedContentHashes.every((hash) => HASH_PATTERN.test(hash)) ||
    !current.allowedContentHashes.includes(current.currentContentHash)
  ) {
    return temporaryUnavailable();
  }
  if (
    request.terms_version !== current.version ||
    !current.allowedContentHashes.includes(request.terms_content_hash)
  ) {
    return {
      ok: false,
      status: 409,
      body: {
        code: "TERMS_UPDATED",
        terms: { version: current.version, content_hash: current.currentContentHash },
      },
    };
  }
  return null;
}

function safeAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function prepareGraveStone(
  config: SupabaseServerConfig,
  request: GraveStonePayload,
  common: ReturnType<typeof commonStorage>,
  nowIso: string,
): Promise<BusinessResult> {
  const productParams = new URLSearchParams({
    select: "id,code,is_active",
    id: `eq.${request.product_id}`,
    code: `eq.${request.product_code}`,
    is_active: "eq.true",
    limit: "1",
  });
  const products = await supabaseRest<ProductRow[]>(config, `products?${productParams}`);
  const product = products[0];
  if (!product) return selectionUnavailable();

  const variantParams = new URLSearchParams({
    select:
      "id,product_id,stone_code,size_code,price_type,amount_toman,includes,excludes,is_available",
    id: `eq.${request.variant_id}`,
    product_id: `eq.${product.id}`,
    stone_code: `eq.${request.stone_code}`,
    size_code: `eq.${request.size_code}`,
    is_available: "eq.true",
    limit: "1",
  });
  const variants = await supabaseRest<VariantRow[]>(config, `product_variants?${variantParams}`);
  const variant = variants[0];
  if (!variant) return selectionUnavailable();

  const optionParams = new URLSearchParams({
    select:
      "id,variant_id,title,price_type,amount_toman,is_available,compatible_size_codes,sort_order",
    variant_id: `eq.${variant.id}`,
    order: "sort_order.asc,id.asc",
  });
  const availableOptionRows = await supabaseRest<OptionRow[]>(
    config,
    `product_options?${optionParams}`,
  );
  const requestedIds = [...request.option_ids];
  if (new Set(requestedIds).size !== requestedIds.length) return selectionUnavailable();

  const selected: OptionRow[] = [];
  for (const optionId of requestedIds) {
    const option = availableOptionRows.find((candidate) => candidate.id === optionId);
    if (
      !option ||
      !option.is_available ||
      !option.compatible_size_codes.includes(variant.size_code)
    ) {
      return selectionUnavailable();
    }
    selected.push(option);
  }
  selected.sort(
    (left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id),
  );

  const hasReview = selected.some((option) => option.price_type === "review");
  const hasEstimate = selected.some((option) => option.price_type === "estimate");
  let priceType: PriceType;
  let amountToman: number | null;
  if (variant.size_code === "custom" || variant.price_type === "review" || hasReview) {
    priceType = "review";
    amountToman = null;
  } else {
    const base = safeAmount(variant.amount_toman);
    if (base === null) return temporaryUnavailable();
    let total = base;
    for (const option of selected) {
      const amount = safeAmount(option.amount_toman);
      if (amount === null) return temporaryUnavailable();
      total += amount;
      if (!Number.isSafeInteger(total) || total <= 0) return temporaryUnavailable();
    }
    priceType = variant.price_type === "estimate" || hasEstimate ? "estimate" : "fixed";
    amountToman = total;
  }

  if (request.client_price_type !== priceType || request.client_displayed_price !== amountToman) {
    return {
      ok: false,
      status: 409,
      body: {
        code: "PRICE_CHANGED",
        price: { price_type: priceType, amount_toman: amountToman },
      },
    };
  }

  const serverCatalogVersion = await supabaseRpc<string>(
    config,
    "compute_operational_catalog_version",
    {},
  );
  if (!HASH_PATTERN.test(serverCatalogVersion)) return temporaryUnavailable();

  const configurationSnapshot = {
    content_schema_version: 1,
    tracking_code_prefix: common.p_tracking_code_prefix,
    product_id: product.id,
    product_code: product.code,
    variant_id: variant.id,
    stone_code: variant.stone_code,
    size_code: variant.size_code,
    selected_option_ids: selected.map((option) => option.id),
    selected_options: selected.map((option) => ({ id: option.id, title: option.title })),
  };
  const priceSnapshot = {
    client_displayed_price: amountToman,
    server_calculated_price: amountToman,
    price_type: priceType,
    includes: variant.includes,
    excludes: variant.excludes,
    calculated_at: nowIso,
  };

  return {
    ok: true,
    storage: {
      ...common,
      p_client_catalog_version: request.client_catalog_version,
      p_server_catalog_version: serverCatalogVersion,
      p_configuration_snapshot: configurationSnapshot,
      p_price_snapshot: priceSnapshot,
    },
  };
}

function prepareBuildingStone(
  request: BuildingStonePayload,
  common: ReturnType<typeof commonStorage>,
  nowIso: string,
): BusinessResult {
  return {
    ok: true,
    storage: {
      ...common,
      p_client_catalog_version: null,
      p_server_catalog_version: null,
      p_configuration_snapshot: {
        content_schema_version: 1,
        tracking_code_prefix: common.p_tracking_code_prefix,
        stone_type_code: request.stone_type,
        application: request.application,
        area_m2: request.area_m2,
      },
      p_price_snapshot: {
        client_displayed_price: null,
        server_calculated_price: null,
        price_type: "review",
        includes: [],
        excludes: [],
        calculated_at: nowIso,
      },
    },
  };
}

async function prepareContact(
  config: SupabaseServerConfig,
  request: ContactPayload,
  common: ReturnType<typeof commonStorage>,
): Promise<BusinessResult> {
  const snapshot: Record<string, unknown> = {
    content_schema_version: 1,
    tracking_code_prefix: common.p_tracking_code_prefix,
  };
  if (request.source_type === "portfolio" && request.portfolio_reference_id !== undefined) {
    const params = new URLSearchParams({
      select: "public_reference_id,is_active",
      public_reference_id: `eq.${request.portfolio_reference_id}`,
      is_active: "eq.true",
      limit: "1",
    });
    const rows = await supabaseRest<PortfolioRow[]>(config, `portfolio_items?${params}`);
    if (!rows[0]) return selectionUnavailable();
    snapshot.source_type = "portfolio";
    snapshot.portfolio_reference_id = request.portfolio_reference_id;
  }

  return {
    ok: true,
    storage: {
      ...common,
      p_client_catalog_version: null,
      p_server_catalog_version: null,
      p_configuration_snapshot: snapshot,
      p_price_snapshot: null,
    },
  };
}

export async function prepareBusinessRequest(input: {
  readonly config: SupabaseServerConfig;
  readonly request: RequestPayload;
  readonly fingerprint: string;
  readonly fingerprintKeyId: string;
  readonly botVerification: BotVerification;
  readonly riskFlags: readonly RiskFlag[];
  readonly ipHash: string | null;
  readonly trackingCodePrefix: string;
  readonly nowIso: string;
}): Promise<BusinessResult> {
  if (!TRACKING_PREFIX_PATTERN.test(input.trackingCodePrefix)) return temporaryUnavailable();
  const termsFailure = validateTerms(input.request);
  if (termsFailure !== null) return termsFailure;

  const common = commonStorage(input.request, input);
  if (input.request.request_type === "grave_stone") {
    return prepareGraveStone(input.config, input.request, common, input.nowIso);
  }
  if (input.request.request_type === "building_stone") {
    return prepareBuildingStone(input.request, common, input.nowIso);
  }
  return prepareContact(input.config, input.request, common);
}
