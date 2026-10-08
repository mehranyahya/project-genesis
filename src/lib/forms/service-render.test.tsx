import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterContextProvider,
} from "@tanstack/react-router";
import { LocaleProvider } from "@/lib/i18n/react";
import { BASE_STATIC_PATHS, localizeRawPath, safeSwitchSearch } from "@/lib/i18n/locale";
import type { Locale } from "@/lib/i18n/locale";
import { translatorFor } from "@/lib/i18n/messages";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { RequestForm } from "@/components/request-form/request-form";
import { RequestFormFields } from "@/components/request-form/request-form-fields";
import { QuotePage } from "@/components/request-form/quote-page";
import { RequestSuccess } from "@/components/request-form/request-success";
import { BuildingStonePage } from "@/components/building-stone/building-stone-page";
import { BuildingStoneFields } from "@/components/building-stone/building-stone-fields";
import { GraveStoneListPage } from "@/components/grave-stones/grave-stone-list-page";
import { ProductDetailPage } from "@/components/product/product-detail-page";
import { CustomFunnelPage } from "@/components/custom-funnel/custom-funnel-page";
import { StoneworksPage } from "@/components/stoneworks/stoneworks-page";
import { EMPTY_REQUEST_FORM_VALUES, REQUEST_FIELD_ERRORS } from "@/lib/request-form";
import { EMPTY_BUILDING_STONE_VALUES, BUILDING_STONE_OTHER_HELPER } from "@/lib/building-stone";
import { buildGraveStoneListModel } from "@/lib/grave-stone-list";
import type { GraveStoneListModel } from "@/lib/grave-stone-list";
import type { ProductDetailModel } from "@/lib/product-detail";
import { STONEWORK_CATEGORIES } from "@/lib/stoneworks";
import { stoneworkNoteLimit } from "@/lib/stonework-request";
import { quoteRouteOptions } from "@/lib/route-defs/pages";

const ARABIC = /[\u0600-\u06FF]/;
const CONTACT = { kind: "contact" as const, portfolioReferenceId: null };

function renderUi(locale: Locale, children: ReactNode, entry?: string): string {
  const root = createRootRoute();
  const paths = [
    ...new Set(
      [...BASE_STATIC_PATHS, "/grave-stones/$slug"].flatMap((path) => [
        localizeRawPath(path, "fa"),
        localizeRawPath(path, "en"),
      ]),
    ),
  ];
  const router = createRouter({
    routeTree: root.addChildren(
      paths.map((path) => createRoute({ getParentRoute: () => root, path })),
    ),
    history: createMemoryHistory({ initialEntries: [entry ?? (locale === "en" ? "/en" : "/")] }),
  });
  return renderToStaticMarkup(
    <RouterContextProvider router={router}>
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </RouterContextProvider>,
  );
}

test("contact forms translate all labels and submission states, with autocomplete and a focusable contact group", () => {
  for (const locale of ["fa", "en"] as const) {
    const html = renderUi(
      locale,
      <RequestForm source={CONTACT} site={null} termsDocument={null} />,
    );
    assert.ok(html.includes('class="request-form"'));
    assert.ok(html.includes('id="request-preferredContact"'));
    assert.ok(/autocomplete="name"/i.test(html));
    assert.ok(/autocomplete="tel"/i.test(html));
    assert.ok(html.includes('href="' + localizeRawPath("/terms", locale) + '"'));
    if (locale === "en") {
      assert.equal(ARABIC.test(html), false);
      assert.ok(html.includes("Project location"));
    }
  }
});

test("bespoke enquiry shows the selected category and an accessible dimensions field without populating private text or remounting the form", () => {
  for (const locale of ["fa", "en"] as const) {
    const t = translatorFor(locale);
    const category = STONEWORK_CATEGORIES[0]!;
    const html = renderUi(
      locale,
      <QuotePage
        portfolioReferenceId={null}
        stoneworkCategoryId={category.id}
        site={null}
        termsDocument={null}
      />,
    );
    assert.ok(html.includes(t(category.label)));
    assert.ok(html.includes(t("ابعاد و شرح ایده")));
    assert.ok(html.includes('id="request-customerNote-hint"'));
    assert.ok(/<textarea[^>]*aria-describedby="request-customerNote-hint"/.test(html));
    assert.ok(
      html.includes(
        'maxLength="' + stoneworkNoteLimit({ id: category.id, label: t(category.label) }, t) + '"',
      ),
    );
    assert.ok(/<textarea[^>]*><\/textarea>/.test(html));
    if (locale === "en") assert.equal(ARABIC.test(html), false);
  }
  const quote = readFileSync(
    new URL("../../components/request-form/quote-page.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(
    quote.includes("onSuccess={clearReference}"),
    false,
    "automatic navigation must not erase the success screen",
  );
  assert.equal(
    /<RequestForm\s+key=/.test(quote),
    false,
    "removing context must not erase the editable contact fields",
  );
});

test("architectural fields and their other-application helper and errors are translated and described", () => {
  const fields = renderUi(
    "en",
    <BuildingStoneFields
      values={{ ...EMPTY_BUILDING_STONE_VALUES, application: "other" }}
      errors={{ stoneType: "نوع سنگ را انتخاب کنید." }}
      disabled={false}
      onChange={() => {}}
    />,
  );
  assert.equal(ARABIC.test(fields), false);
  assert.ok(fields.includes(translatorFor("en")(BUILDING_STONE_OTHER_HELPER)));
  assert.ok(/aria-describedby="building-stone-stoneType-error"/.test(fields));
  assert.ok(/inputMode="decimal"/i.test(fields));
  const page = renderUi("en", <BuildingStonePage site={null} termsDocument={null} />);
  assert.equal((page.match(/<h1\b/g) ?? []).length, 1);
  assert.equal((page.match(/<form\b/g) ?? []).length, 1);
  assert.equal(ARABIC.test(page), false);
});

test("English memorial catalogues translate counts, execution type and dimensions and keep a usable empty state", () => {
  const model: GraveStoneListModel = {
    stoneCodes: ["G-1"],
    items: [
      {
        slug: "honed-granite",
        title: "Honed granite",
        summary: null,
        type: "simple",
        leadMedia: null,
        stoneCodes: ["G-1"],
        sizeCodes: ["160x60"],
        variantPairs: [{ stoneCode: "G-1", sizeCode: "160x60" }],
      },
    ],
  };
  const html = renderUi("en", <GraveStoneListPage model={model} />);
  assert.equal(ARABIC.test(html), false);
  assert.ok(html.includes("1 model"));
  assert.ok(html.includes("160×60"));
  assert.ok(html.includes('href="/en/grave-stones/honed-granite"'));
  const empty = renderUi("en", <GraveStoneListPage model={buildGraveStoneListModel([])} />);
  assert.equal(ARABIC.test(empty), false);
  assert.ok(empty.includes('href="/en/grave-stones/custom"'));
  assert.equal(empty.includes("<img"), false);
});

test("English product selection and the memorial custom entry stay localized without real media or a catalog version", () => {
  const model: ProductDetailModel = {
    id: "test-product",
    slug: "honed-granite",
    code: "G-1",
    type: "simple",
    typeLabel: "سنگ مزار ساده",
    title: "Honed granite",
    summary: null,
    description: null,
    media: [],
    variants: [
      {
        id: "test-variant",
        stoneCode: "G-1",
        sizeCode: "160x60",
        sizeLabel: "۱۶۰×۶۰",
        priceType: "review",
        amountToman: null,
        priceUpdatedAt: null,
        includes: [],
        excludes: [],
        options: [],
      },
    ],
  };
  const detail = renderUi(
    "en",
    <ProductDetailPage model={model} catalogVersion={null} site={null} termsDocument={null} />,
  );
  assert.equal(ARABIC.test(detail), false);
  assert.equal((detail.match(/<h1\b/g) ?? []).length, 1);
  assert.ok(detail.includes("160×60"));
  assert.equal(detail.includes("<img"), false);
  const custom = renderUi(
    "en",
    <CustomFunnelPage products={[]} catalogVersion={null} termsDocument={null} />,
  );
  assert.equal(ARABIC.test(custom), false);
  assert.equal((custom.match(/<h1\b/g) ?? []).length, 1);
});

test("each of the five bespoke cards carries its own safe category to the correct-language quote route", () => {
  for (const locale of ["fa", "en"] as const) {
    const html = renderUi(locale, <StoneworksPage />);
    assert.equal((html.match(/<article\b/g) ?? []).length, 5);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    for (const category of STONEWORK_CATEGORIES)
      assert.ok(
        html.includes(
          'href="' +
            localizeRawPath("/quote", locale) +
            "?source=stoneworks&amp;category=" +
            category.id +
            '"',
        ),
      );
    if (locale === "en") assert.equal(ARABIC.test(html), false);
  }
});

test("both quote routes and the real language switch accept only approved categories or portfolio references", () => {
  for (const locale of ["fa", "en"] as const) {
    const route = quoteRouteOptions(locale);
    for (const category of STONEWORK_CATEGORIES) {
      const raw = {
        source: "stoneworks",
        category: category.id,
        reference: "pf-1234",
        customerNote: "private",
        dimensions: "private",
        phone: "private",
      };
      const expected = { source: "stoneworks", category: category.id };
      assert.deepEqual(route.validateSearch(raw), expected);
      assert.deepEqual(safeSwitchSearch(raw), expected);
      assert.deepEqual(route.loaderDeps({ search: route.validateSearch(raw) }), {
        reference: null,
        category: category.id,
      });
    }
    for (const category of [
      "unknown",
      "sculpture_art ",
      "SCULPTURE_ART",
      ["sculpture_art"],
      null,
      1,
    ]) {
      const raw = { source: "stoneworks", category };
      assert.deepEqual(route.validateSearch(raw), {});
      assert.deepEqual(safeSwitchSearch(raw), {});
    }
    assert.deepEqual(
      route.validateSearch({
        source: "portfolio",
        reference: "pf-1234",
        category: "sculpture_art",
      }),
      { source: "portfolio", reference: "pf-1234" },
    );
    const html = renderUi(
      locale,
      <LanguageSwitcher />,
      localizeRawPath("/quote", locale) +
        "?source=stoneworks&category=sculpture_art&phone=private&dimensions=private",
    );
    const target = localizeRawPath("/quote", locale === "fa" ? "en" : "fa");
    assert.ok(html.includes('href="' + target + '?source=stoneworks&amp;category=sculpture_art"'));
    assert.equal(html.includes("private"), false);
  }
});

test("field errors are associated with the actual focus targets and the success view keeps an isolated tracking code", () => {
  const html = renderUi(
    "en",
    <RequestFormFields
      values={EMPTY_REQUEST_FORM_VALUES}
      source={CONTACT}
      disabled={false}
      errors={{
        phone: REQUEST_FIELD_ERRORS.phone,
        preferredContact: REQUEST_FIELD_ERRORS.preferredContact,
      }}
      onChange={() => {}}
    />,
  );
  assert.ok(/id="request-phone"[^>]*aria-describedby="request-phone-error"/.test(html));
  assert.ok(
    /id="request-preferredContact"[^>]*aria-describedby="request-preferredContact-error"/.test(
      html,
    ),
  );
  assert.ok(html.includes('id="request-preferredContact-error"'));
  assert.equal(ARABIC.test(html), false);
  const success = renderUi("en", <RequestSuccess trackingCode="REQ-1001" site={null} />);
  assert.ok(success.includes('<bdi dir="ltr">REQ-1001</bdi>'));
  assert.equal(ARABIC.test(success), false);
  assert.equal(success.includes('href="tel:'), false);
});
