import type {
  Media,
  PortfolioItem,
  ServiceMediaItem,
  ServiceMediaReference,
} from "./content/types";
import { contentListForLocale } from "./i18n/content-gate";
import type { Locale } from "./i18n/locale";

const SRC = /^\/media\/([0-9a-f]{24})\/([0-9a-f]{16})-1280w\.webp$/;

/** Only the five encoded public fields are returned; no arbitrary URL is accepted. */
function publicMedia(image: Media, locale: Locale): Media | null {
  if (
    !image ||
    typeof image.src !== "string" ||
    typeof image.srcSet !== "string" ||
    typeof image.alt !== "string" ||
    !image.alt.trim() ||
    image.alt.length > 500 ||
    (locale === "en" && /[\u0600-\u06ff]/.test(image.alt)) ||
    !Number.isInteger(image.width) ||
    image.width !== 1280 ||
    !Number.isInteger(image.height) ||
    image.height <= 0 ||
    image.height > 2560
  )
    return null;
  const match = SRC.exec(image.src);
  if (!match) return null;
  const expected = [320, 640, 1280].map(
    (width) => `/media/${match[1]}/${match[2]}-${width}w.webp ${width}w`,
  );
  if (
    image.srcSet
      .split(",")
      .map((part) => part.trim())
      .join(",") !== expected.join(",")
  )
    return null;
  return {
    src: image.src,
    srcSet: image.srcSet,
    width: image.width,
    height: image.height,
    alt: image.alt,
  };
}

/** Explicit selection is atomic: stale, ambiguous or untranslated media hide the section. */
export function resolveServiceMedia(
  references: readonly ServiceMediaReference[] | undefined,
  slug: string,
  locale: Locale,
  building: readonly Media[],
  portfolio: readonly PortfolioItem[],
): ServiceMediaItem[] {
  if (
    !Array.isArray(references) ||
    references.length > 3 ||
    !["building-stone", "stoneworks"].includes(slug)
  )
    return [];
  const selected: ServiceMediaItem[] = [],
    used = new Set<string>();
  const localized = contentListForLocale(portfolio, locale);
  for (const ref of references) {
    if (
      !ref ||
      typeof ref.assetId !== "string" ||
      !/^[0-9a-f]{24}$/.test(ref.assetId) ||
      used.has(ref.assetId)
    )
      return [];
    used.add(ref.assetId);
    let images: readonly Media[],
      reference: string | null = null;
    if (ref.source === "building" && slug === "building-stone") images = building;
    else if (ref.source === "portfolio" && /^pf-[0-9]{4,}$/.test(ref.publicReferenceId)) {
      const matches = localized.filter((item) => item.publicReferenceId === ref.publicReferenceId);
      if (matches.length !== 1) return [];
      images = matches[0]!.media;
      reference = ref.publicReferenceId;
    } else return [];
    if (!Array.isArray(images)) return [];
    const matches = images.filter(
      (image) => typeof image?.src === "string" && SRC.exec(image.src)?.[1] === ref.assetId,
    );
    if (matches.length !== 1) return [];
    const media = publicMedia(matches[0]!, locale);
    if (!media) return [];
    selected.push({ media, portfolioReferenceId: reference });
  }
  return selected;
}
