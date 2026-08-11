import { useRef, useState } from "react";

export const SHARE_BUTTON_LABEL = "اشتراک‌گذاری مدل";
export const COPY_BUTTON_LABEL = "کپی لینک";
export const COPY_SUCCESS_TEXT = "لینک مدل کپی شد.";
export const COPY_FAILURE_TEXT = "کپی لینک انجام نشد. لطفاً نشانی صفحه را دستی کپی کنید.";
export const SHARE_FAILURE_TEXT = "اشتراک‌گذاری انجام نشد.";

const ACTION =
  "inline-flex min-h-11 items-center justify-center border border-border-strong bg-surface px-5 py-2 text-sm font-bold text-text-primary transition-colors duration-[180ms] hover:border-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none";

/**
 * Share identity is derived from the stable public route key (slug) only.
 * Product.code is display text and never part of the URL.
 */
export function productShareUrl(slug: string, origin: string): string {
  return new URL(`/grave-stones/${encodeURIComponent(slug)}`, origin).toString();
}

/** Title and display code only — no price, selection, PII, media key or secret. */
export function productShareText(title: string, code: string): string {
  return `${title} — کد ${code}`;
}

export function ProductShare({ slug, title, code }: { slug: string; title: string; code: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const busy = useRef(false);

  const currentUrl = (): string | null => {
    if (typeof window === "undefined") return null;
    return productShareUrl(slug, window.location.origin);
  };

  const copyLink = async () => {
    const url = currentUrl();
    if (url === null || busy.current) return;
    busy.current = true;
    try {
      await navigator.clipboard.writeText(url);
      setStatus(COPY_SUCCESS_TEXT);
    } catch {
      setStatus(COPY_FAILURE_TEXT);
    } finally {
      busy.current = false;
    }
  };

  const share = async () => {
    const url = currentUrl();
    if (url === null || busy.current) return;
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      await copyLink();
      return;
    }
    busy.current = true;
    try {
      await navigator.share({ title, text: productShareText(title, code), url });
      setStatus(null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStatus(SHARE_FAILURE_TEXT);
      }
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        <button type="button" className={ACTION} onClick={share}>
          {SHARE_BUTTON_LABEL}
        </button>
        <button type="button" className={ACTION} onClick={copyLink}>
          {COPY_BUTTON_LABEL}
        </button>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-text-secondary">
        {status}
      </p>
    </div>
  );
}
