export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>بارگذاری صفحه انجام نشد — مهرآرا</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { font: 15px/1.9 system-ui, sans-serif; background: Canvas; color: CanvasText; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      main { max-width: 30rem; width: 100%; text-align: center; padding: 2rem; border: 1px solid GrayText; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: GrayText; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a { min-height: 2.75rem; padding: 0.5rem 1rem; border-radius: 2px; font: inherit; text-decoration: none; border: 1px solid GrayText; display: inline-flex; align-items: center; }
      a:focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
      .primary { background: ButtonText; color: ButtonFace; border-color: ButtonText; }
      .secondary { background: Canvas; color: CanvasText; }
    </style>
  </head>
  <body>
    <main>
      <h1>بارگذاری این صفحه انجام نشد</h1>
      <p>مشکلی پیش آمد. می‌توانید دوباره تلاش کنید یا به صفحهٔ اصلی برگردید.</p>
      <div class="actions">
        <a class="primary" href="">تلاش دوباره</a>
        <a class="secondary" href="/">بازگشت به خانه</a>
      </div>
    </main>
  </body>
</html>`;
}
