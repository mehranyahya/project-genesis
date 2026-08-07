import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const SCRIPT_ID = "mehrara-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const ACTION = "submit_request";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light";
      size: "flexible";
      appearance: "interaction-only";
      language: "fa";
      callback: (token: string) => void;
      "error-callback": () => boolean;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi> | null = null;

function siteKey(): string | null {
  const value = import.meta.env["VITE_TURNSTILE_SITE_KEY"];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("Turnstile requires a browser"));
  }
  if (window.turnstile !== undefined) return Promise.resolve(window.turnstile);
  if (loader !== null) return loader;

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const ready = () => {
      if (window.turnstile === undefined) {
        reject(new Error("Turnstile API unavailable"));
        return;
      }
      resolve(window.turnstile);
    };

    const failed = () => reject(new Error("Turnstile script failed"));
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing !== null) {
      existing.addEventListener("load", ready, { once: true });
      existing.addEventListener("error", failed, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", failed, { once: true });
    document.head.append(script);
  }).catch((error: unknown) => {
    loader = null;
    throw error;
  });

  return loader;
}

export interface TurnstileFieldHandle {
  readonly reset: () => void;
}

export const TurnstileField = forwardRef<
  TurnstileFieldHandle,
  { readonly onTokenChange: (token: string | null) => void }
>(function TurnstileField({ onTokenChange }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        onTokenChange(null);
        setState("loading");
        if (apiRef.current !== null && widgetIdRef.current !== null) {
          apiRef.current.reset(widgetIdRef.current);
        }
      },
    }),
    [onTokenChange],
  );

  useEffect(() => {
    const key = siteKey();
    const container = containerRef.current;
    if (key === null || container === null) {
      onTokenChange(null);
      setState("unavailable");
      return;
    }

    let cancelled = false;

    void loadTurnstile()
      .then((api) => {
        if (cancelled || containerRef.current === null) return;
        apiRef.current = api;
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: key,
          action: ACTION,
          theme: "light",
          size: "flexible",
          appearance: "interaction-only",
          language: "fa",
          callback: (token) => {
            if (cancelled) return;
            onTokenChange(token);
            setState("ready");
          },
          "error-callback": () => {
            if (!cancelled) {
              onTokenChange(null);
              setState("unavailable");
            }
            return true;
          },
          "expired-callback": () => {
            if (!cancelled) {
              onTokenChange(null);
              setState("loading");
            }
          },
          "timeout-callback": () => {
            if (!cancelled) {
              onTokenChange(null);
              setState("loading");
            }
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          onTokenChange(null);
          setState("unavailable");
        }
      });

    return () => {
      cancelled = true;
      onTokenChange(null);
      if (apiRef.current !== null && widgetIdRef.current !== null) {
        apiRef.current.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
      apiRef.current = null;
    };
  }, [onTokenChange]);

  return (
    <div className="flex min-h-11 flex-col gap-2" aria-live="polite">
      <div ref={containerRef} className="min-h-11 w-full" />
      {state === "loading" ? (
        <p className="text-sm text-text-secondary">در حال آماده‌سازی تأیید امنیتی…</p>
      ) : null}
      {state === "unavailable" ? (
        <p role="alert" className="text-sm text-text-secondary">
          تأیید امنیتی در دسترس نیست؛ ارسال درخواست همچنان ممکن است.
        </p>
      ) : null}
    </div>
  );
});
