/**
 * Pure, side-effect free staged custom grave-stone funnel model.
 * Consumes official adapter output plus an explicit, typed option-role registry.
 * No fixtures, no fabricated products, options, prices or dates. Inputs are
 * never mutated. All price logic is delegated to the Prompt 05 resolver.
 */

import type { GraveStoneSizeCode, Product } from "./content/types";
import { isCatalogVersion } from "./content/types";
import type {
  ProductDetailModel,
  ProductDetailOption,
  ProductDetailVariant,
} from "./product-detail";
import { PRODUCT_SIZE_ORDER, buildProductDetailModel } from "./product-detail";
import type { GraveStoneRequestDraft } from "./request-draft";
import { buildGraveStoneRequestDraft } from "./request-draft";

/** Locked M5 order, re-exported read-only from the Prompt 05 contract. */
export const CUSTOM_FUNNEL_SIZE_ORDER = PRODUCT_SIZE_ORDER;

export const CUSTOM_FUNNEL_STEPS = [
  "سنگ",
  "اندازه",
  "دوری مجاز",
  "قطعه کتیبه",
  "حکاکی",
  "خلاصه",
] as const;

export type CustomFunnelStepIndex = 0 | 1 | 2 | 3 | 4 | 5;

export const CUSTOM_FUNNEL_LAST_STEP = 5;

export type CustomOptionRole = "dori" | "inscription_piece" | "engraving" | "excluded";

export type CustomOptionRoleKey = string & { readonly __brand: "CustomOptionRoleKey" };

export type CustomOptionRoleRegistry = Readonly<Record<string, CustomOptionRole>>;

/** Composite key so the same option id in different variants stays unambiguous. */
export function makeCustomOptionRoleKey(variantId: string, optionId: string): CustomOptionRoleKey {
  return `${variantId}::${optionId}` as CustomOptionRoleKey;
}

/**
 * Runtime registry. Intentionally empty: roles belong to real catalog options
 * and are never guessed from titles or identifier patterns.
 */
export const CUSTOM_FUNNEL_OPTION_ROLES: CustomOptionRoleRegistry = {};

/** Sizes on which a `dori` option may exist at all. */
export const DORI_SIZE_CODES: readonly GraveStoneSizeCode[] = ["160x60", "180x60"];

export interface CustomFunnelVariantChoice {
  readonly variantId: string;
  readonly sizeCode: GraveStoneSizeCode;
  readonly sizeLabel: string;
  readonly variant: ProductDetailVariant;
  readonly dori: readonly ProductDetailOption[];
  readonly inscriptionPiece: readonly ProductDetailOption[];
  readonly engraving: readonly ProductDetailOption[];
}

export interface CustomFunnelStoneChoice {
  readonly key: string;
  readonly productId: string;
  readonly productCode: string;
  readonly productTitle: string;
  readonly stoneCode: string;
  readonly sizes: readonly CustomFunnelVariantChoice[];
}

export interface CustomFunnelModel {
  readonly stones: readonly CustomFunnelStoneChoice[];
  readonly models: ReadonlyMap<string, ProductDetailModel>;
}

export interface CustomFunnelSelection {
  readonly stoneKey: string | null;
  readonly variantId: string | null;
  readonly doriIds: readonly string[];
  readonly inscriptionIds: readonly string[];
  readonly engravingIds: readonly string[];
}

export const EMPTY_CUSTOM_FUNNEL_SELECTION: CustomFunnelSelection = {
  stoneKey: null,
  variantId: null,
  doriIds: [],
  inscriptionIds: [],
  engravingIds: [],
};

export function makeCustomFunnelStoneKey(productId: string, stoneCode: string): string {
  return `${productId}::${stoneCode}`;
}

function roleOf(
  registry: CustomOptionRoleRegistry,
  variantId: string,
  optionId: string,
): CustomOptionRole | null {
  const role = registry[makeCustomOptionRoleKey(variantId, optionId)];
  return role === "dori" ||
    role === "inscription_piece" ||
    role === "engraving" ||
    role === "excluded"
    ? role
    : null;
}

function classifyVariant(
  variant: ProductDetailVariant,
  registry: CustomOptionRoleRegistry,
): CustomFunnelVariantChoice | null {
  const dori: ProductDetailOption[] = [];
  const inscriptionPiece: ProductDetailOption[] = [];
  const engraving: ProductDetailOption[] = [];

  for (const option of variant.options) {
    const role = roleOf(registry, variant.id, option.id);
    // An available but unclassified option makes the whole path undeliverable.
    if (role === null) return null;
    if (role === "excluded") continue;
    if (role === "dori") {
      if (!DORI_SIZE_CODES.includes(variant.sizeCode)) return null;
      dori.push(option);
      continue;
    }
    if (role === "inscription_piece") inscriptionPiece.push(option);
    else engraving.push(option);
  }

  return {
    variantId: variant.id,
    sizeCode: variant.sizeCode,
    sizeLabel: variant.sizeLabel,
    variant,
    dori,
    inscriptionPiece,
    engraving,
  };
}

/**
 * Builds the funnel model from real adapter products. Only active `simple`
 * products with a valid detail model and at least one fully classified variant
 * survive. `cnc_box` is removed entirely.
 */
export function buildCustomFunnelModel(input: {
  readonly products: readonly Product[] | null | undefined;
  readonly roles: CustomOptionRoleRegistry;
}): CustomFunnelModel {
  const { products, roles } = input;
  const stones: CustomFunnelStoneChoice[] = [];
  const models = new Map<string, ProductDetailModel>();
  const seenStone = new Set<string>();
  const seenTriple = new Set<string>();

  for (const product of products ?? []) {
    if (!product || product.isActive !== true) continue;
    if (product.type !== "simple") continue;

    const model = buildProductDetailModel(product, product.slug);
    if (model === null) continue;

    const perStone = new Map<string, CustomFunnelVariantChoice[]>();
    const stoneOrder: string[] = [];

    for (const variant of model.variants) {
      const choice = classifyVariant(variant, roles);
      if (choice === null) continue;

      const tripleKey = `${model.id}::${variant.stoneCode}::${variant.sizeCode}`;
      if (seenTriple.has(tripleKey)) continue;
      seenTriple.add(tripleKey);

      if (!perStone.has(variant.stoneCode)) {
        perStone.set(variant.stoneCode, []);
        stoneOrder.push(variant.stoneCode);
      }
      perStone.get(variant.stoneCode)!.push(choice);
    }

    let kept = false;
    for (const stoneCode of stoneOrder) {
      const key = makeCustomFunnelStoneKey(model.id, stoneCode);
      if (seenStone.has(key)) continue;
      const sizes = perStone.get(stoneCode) ?? [];
      if (sizes.length === 0) continue;
      seenStone.add(key);
      kept = true;
      stones.push({
        key,
        productId: model.id,
        productCode: model.code,
        productTitle: model.title,
        stoneCode,
        sizes,
      });
    }

    if (kept) models.set(model.id, model);
  }

  return { stones, models };
}

export function findStoneChoice(
  model: CustomFunnelModel,
  stoneKey: string | null,
): CustomFunnelStoneChoice | null {
  if (stoneKey === null) return null;
  return model.stones.find((stone) => stone.key === stoneKey) ?? null;
}

export function findVariantChoice(
  stone: CustomFunnelStoneChoice | null,
  variantId: string | null,
): CustomFunnelVariantChoice | null {
  if (stone === null || variantId === null) return null;
  return stone.sizes.find((size) => size.variantId === variantId) ?? null;
}

export type CustomFunnelAction =
  | { readonly kind: "selectStone"; readonly stoneKey: string }
  | { readonly kind: "selectSize"; readonly variantId: string }
  | { readonly kind: "toggleDori"; readonly optionId: string }
  | { readonly kind: "toggleInscription"; readonly optionId: string }
  | { readonly kind: "toggleEngraving"; readonly optionId: string };

export interface CustomFunnelReduction {
  readonly selection: CustomFunnelSelection;
  /** True only when a real change removed at least one downstream selection. */
  readonly clearedDownstream: boolean;
  readonly changed: boolean;
}

function toggle(ids: readonly string[], optionId: string): readonly string[] {
  return ids.includes(optionId) ? ids.filter((id) => id !== optionId) : [...ids, optionId];
}

/** Pure cascade reducer. Repeating the same value never resets or announces. */
export function reduceCustomFunnel(
  selection: CustomFunnelSelection,
  action: CustomFunnelAction,
): CustomFunnelReduction {
  const unchanged: CustomFunnelReduction = { selection, clearedDownstream: false, changed: false };

  switch (action.kind) {
    case "selectStone": {
      if (selection.stoneKey === action.stoneKey) return unchanged;
      const cleared =
        selection.variantId !== null ||
        selection.doriIds.length > 0 ||
        selection.inscriptionIds.length > 0 ||
        selection.engravingIds.length > 0;
      return {
        selection: { ...EMPTY_CUSTOM_FUNNEL_SELECTION, stoneKey: action.stoneKey },
        clearedDownstream: cleared,
        changed: true,
      };
    }
    case "selectSize": {
      if (selection.variantId === action.variantId) return unchanged;
      const cleared =
        selection.doriIds.length > 0 ||
        selection.inscriptionIds.length > 0 ||
        selection.engravingIds.length > 0;
      return {
        selection: {
          stoneKey: selection.stoneKey,
          variantId: action.variantId,
          doriIds: [],
          inscriptionIds: [],
          engravingIds: [],
        },
        clearedDownstream: cleared,
        changed: true,
      };
    }
    case "toggleDori": {
      const cleared = selection.inscriptionIds.length > 0 || selection.engravingIds.length > 0;
      return {
        selection: {
          ...selection,
          doriIds: toggle(selection.doriIds, action.optionId),
          inscriptionIds: [],
          engravingIds: [],
        },
        clearedDownstream: cleared,
        changed: true,
      };
    }
    case "toggleInscription": {
      const cleared = selection.engravingIds.length > 0;
      return {
        selection: {
          ...selection,
          inscriptionIds: toggle(selection.inscriptionIds, action.optionId),
          engravingIds: [],
        },
        clearedDownstream: cleared,
        changed: true,
      };
    }
    case "toggleEngraving": {
      return {
        selection: {
          ...selection,
          engravingIds: toggle(selection.engravingIds, action.optionId),
        },
        clearedDownstream: false,
        changed: true,
      };
    }
  }
}

/**
 * Rebuilds and revalidates the selection, then delegates to the official
 * Prompt 05 draft builder. Returns null whenever anything is invalid.
 */
export function buildCustomFunnelDraft(input: {
  readonly model: CustomFunnelModel;
  readonly catalogVersion: string | null | undefined;
  readonly selection: CustomFunnelSelection;
}): GraveStoneRequestDraft | null {
  const { model, catalogVersion, selection } = input;

  if (typeof catalogVersion !== "string" || !isCatalogVersion(catalogVersion)) return null;

  const stone = findStoneChoice(model, selection.stoneKey);
  const size = findVariantChoice(stone, selection.variantId);
  if (stone === null || size === null) return null;

  const detailModel = model.models.get(stone.productId);
  if (!detailModel) return null;

  const allowed = new Map<string, "dori" | "inscription_piece" | "engraving">();
  for (const option of size.dori) allowed.set(option.id, "dori");
  for (const option of size.inscriptionPiece) allowed.set(option.id, "inscription_piece");
  for (const option of size.engraving) allowed.set(option.id, "engraving");

  const requested = new Set<string>();
  const groups: readonly (readonly [
    readonly string[],
    "dori" | "inscription_piece" | "engraving",
  ])[] = [
    [selection.doriIds, "dori"],
    [selection.inscriptionIds, "inscription_piece"],
    [selection.engravingIds, "engraving"],
  ];

  for (const [ids, role] of groups) {
    for (const id of ids) {
      if (requested.has(id)) return null;
      if (allowed.get(id) !== role) return null;
      requested.add(id);
    }
  }

  // Adapter order, never selection order.
  const orderedIds = size.variant.options
    .filter((option) => requested.has(option.id))
    .map((option) => option.id);
  if (orderedIds.length !== requested.size) return null;

  return buildGraveStoneRequestDraft({
    model: detailModel,
    catalogVersion,
    variantId: size.variantId,
    optionIds: orderedIds,
  });
}
