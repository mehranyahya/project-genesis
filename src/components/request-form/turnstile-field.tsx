import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useT } from "@/lib/i18n/react";

const SCRIPT_ID = "app-turnstile-script";
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
      execution: "execute";
      appearance: "interaction-only";
      language: "fa";
      "refresh-expired": "auto";
      callback: (token: string) => void;
      "error-callback": () => boolean;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    },
  ): string;
  execute(container: HTMLElement): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface PendingExecution {
  readonly promise: Promise<string | null>;
  readonly resolve: (token: string | null) => void;
}

let loader: Promise<TurnstileApi> | null = null;

function siteKey(): string | null {
  const value = import.meta.env["VITE_TURNSTILE_SITE_KEY"];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function documentCspNonce(): string | null {
  if (typeof document === "undefined") return null;
  const trustedScript = document.querySelector<HTMLScriptElement>("script[nonce]");
  const nonce = trustedScript?.nonce?.trim() ?? "";
  return nonce.length > 0 ? nonce : null;
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
    const nonce = documentCspNonce();
    if (nonce !== null) script.nonce = nonce;
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
  readonly execute: () => Promise<string | null>;
  readonly reset: () => void;
}

export const TurnstileField = forwardRef<TurnstileFieldHandle>(function TurnstileField(_, ref) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<TurnstileApi | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingExecution | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "verifying" | "unavailable">("loading");

  const settlePending = (token: string | null) => {
    const pending = pendingRef.current;
    if (pending === null) return;
    pendingRef.current = null;
    pending.resolve(token);
  };

  useImperativeHandle(ref, () => ({
    execute: () => {
      if (pendingRef.current !== null) return pendingRef.current.promise;

      const api = apiRef.current;
      const container = containerRef.current;
      if (api === null || container === null || widgetIdRef.current === null) {
        return Promise.resolve(null);
      }

      let resolvePending!: (token: string | null) => void;
      const promise = new Promise<string | null>((resolve) => {
        resolvePending = resolve;
      });
      pendingRef.current = { promise, resolve: resolvePending };
      setState("verifying");

      try {
        api.execute(container);
      } catch {
        settlePending(null);
        setState("unavailable");
      }
      return promise;
    },
    reset: () => {
      settlePending(null);
      if (apiRef.current !== null && widgetIdRef.current !== null) {
        apiRef.current.reset(widgetIdRef.current);
        setState("ready");
      }
    },
  }));

  useEffect(() => {
    const key = siteKey();
    const container = containerRef.current;
    if (key === null || container === null) {
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
          execution: "execute",
          appearance: "interaction-only",
          language: "fa",
          "refresh-expired": "auto",
          callback: (token) => {
            if (cancelled) return;
            settlePending(token);
            setState("ready");
          },
          "error-callback": () => {
            if (!cancelled) {
              settlePending(null);
              setState("unavailable");
            }
            return true;
          },
          "expired-callback": () => {
            if (!cancelled) {
              settlePending(null);
              setState("ready");
            }
          },
          "timeout-callback": () => {
            if (!cancelled) {
              settlePending(null);
              setState("unavailable");
            }
          },
        });
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          settlePending(null);
          setState("unavailable");
        }
      });

    return () => {
      cancelled = true;
      settlePending(null);
      if (apiRef.current !== null && widgetIdRef.current !== null) {
        apiRef.current.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
      apiRef.current = null;
    };
  }, []);

  return (
    <div className="flex min-h-11 flex-col gap-2" aria-live="polite">
      <div ref={containerRef} className="min-h-11 w-full" />
      {state === "loading" ? (
        <p className="text-sm text-text-secondary">{t("در حال آماده‌سازی تأیید امنیتی…")}</p>
      ) : null}
      {state === "verifying" ? (
        <p className="text-sm text-text-secondary">{t("در حال انجام تأیید امنیتی…")}</p>
      ) : null}
      {state === "unavailable" ? (
        <p role="alert" className="text-sm text-text-secondary">{t("تأیید امنیتی در دسترس نیست؛ ارسال درخواست همچنان ممکن است.")}</p>
      ) : null}
    </div>
  );
});
