import type { Media } from "@/lib/content/types";
import { isPublicMedia } from "@/lib/content/media";
import { cn } from "@/lib/utils";

export type ResponsiveImageFit = "contain" | "cover";

export function ResponsiveImage({
  media,
  fit,
  sizes,
  priority = false,
  className,
}: {
  media: Media;
  fit: ResponsiveImageFit;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!isPublicMedia(media)) return null;

  return (
    <picture className={cn("block h-full w-full overflow-hidden", className)}>
      <source type="image/avif" srcSet={media.srcSet.avif} sizes={sizes} />
      <source type="image/webp" srcSet={media.srcSet.webp} sizes={sizes} />
      <img
        src={media.src}
        srcSet={media.srcSet.webp}
        sizes={sizes}
        width={media.width}
        height={media.height}
        alt={media.alt}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className={cn("h-full w-full", fit === "contain" ? "object-contain" : "object-cover")}
      />
    </picture>
  );
}
