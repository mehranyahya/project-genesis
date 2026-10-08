import type { Media } from "@/lib/content/types";
import type { ReactEventHandler } from "react";

export type PublicMediaFit = "contain" | "cover";

function avifCandidate(candidate: string): string {
  const trimmed = candidate.trim();
  const match =
    /^(\/media\/[a-f0-9]{24}\/[a-f0-9]{16}-(320|640|1280)w)\.webp\s+(320|640|1280)w$/.exec(trimmed);
  if (!match || match[2] !== match[3]) return "";
  return `${match[1]}.avif ${match[3]}w`;
}

export function toAvifSrcSet(srcSet: string): string {
  const candidates = srcSet.split(",").map(avifCandidate);
  return candidates.every(Boolean) ? candidates.join(", ") : "";
}

export interface PublicMediaProps {
  media: Media;
  mobileMedia?: Media;
  alt?: string;
  className?: string;
  sizes?: string;
  fit?: PublicMediaFit;
  priority?: boolean;
  eager?: boolean;
  onLoad?: ReactEventHandler<HTMLImageElement>;
  onError?: ReactEventHandler<HTMLImageElement>;
}

/**
 * Browser-facing media renderer. It receives only the sanitized public DTO;
 * private Storage identifiers and review/consent metadata cannot reach here.
 */
export function PublicMedia({
  media,
  mobileMedia,
  alt = media.alt,
  className,
  sizes,
  fit = "cover",
  priority = false,
  eager = false,
  onLoad,
  onError,
}: PublicMediaProps) {
  const avifSrcSet = toAvifSrcSet(media.srcSet);
  const mobileAvifSrcSet = mobileMedia ? toAvifSrcSet(mobileMedia.srcSet) : "";
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  return (
    <picture className={className}>
      {mobileMedia ? (
        <>
          {mobileAvifSrcSet ? (
            <source
              media="(max-width: 1023px)"
              type="image/avif"
              srcSet={mobileAvifSrcSet}
              sizes={sizes}
            />
          ) : null}
          <source
            media="(max-width: 1023px)"
            type="image/webp"
            srcSet={mobileMedia.srcSet}
            sizes={sizes}
          />
        </>
      ) : null}
      {avifSrcSet ? <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} /> : null}
      <img
        src={media.src}
        srcSet={media.srcSet}
        sizes={sizes}
        width={media.width}
        height={media.height}
        alt={alt}
        loading={priority || eager ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={onLoad}
        onError={onError}
        className={`h-full w-full ${fitClass}`}
      />
    </picture>
  );
}
