import { DEFAULT_LOCALE, type Locale } from "./i18n/locale";

export function renderErrorPage(locale: Locale = DEFAULT_LOCALE): string {
  const english = locale === "en";
  const title = english ? "Page could not be loaded" : "بارگذاری صفحه انجام نشد";
  const heading = english ? "This page could not be loaded" : "بارگذاری این صفحه انجام نشد";
  const message = english
    ? "Something went wrong. You can try again or return to the home page."
    : "مشکلی پیش آمد. می‌توانید دوباره تلاش کنید یا به صفحهٔ اصلی برگردید.";
  const retry = english ? "Try again" : "تلاش دوباره";
  const home = english ? "Return home" : "بازگشت به خانه";
  return `<!doctype html>
<html lang="${english ? "en" : "fa"}" dir="${english ? "ltr" : "rtl"}">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { font: 15px/1.9 system-ui, sans-serif; background: Canvas; color: CanvasText; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      main { max-width: 30rem; width: 100%; text-align: center; padding: 2rem; border: 1px solid GrayText; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: GrayText; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a { min-height: 3rem; padding: 0.5rem 1rem; border-radius: 2px; font: inherit; text-decoration: none; border: 1px solid GrayText; display: inline-flex; align-items: center; }
      a:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
      .primary { background: ButtonText; color: ButtonFace; border-color: ButtonText; }
      .secondary { background: Canvas; color: CanvasText; }
    </style>
  </head>
  <body>
    <main>
      <h1>${heading}</h1>
      <p>${message}</p>
      <div class="actions">
        <a class="primary" href="">${retry}</a>
        <a class="secondary" href="${english ? "/en" : "/"}">${home}</a>
      </div>
    </main>
  </body>
</html>`;
}
