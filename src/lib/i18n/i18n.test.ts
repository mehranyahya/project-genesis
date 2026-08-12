import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  alternatePathname,
  basePathFromPathname,
  htmlDir,
  htmlLang,
  localeFromPathname,
  localizePath,
  safeSwitchSearch,
} from "./locale";
import { translate } from "./messages";
import { contentForLocale, contentListForLocale, siteForLocale } from "./content-gate";
import {
  formatMoney,
  formatOptionPriceLabel,
  formatPriceLabel,
  priceTypeLabel,
} from "../product-detail";
import { formatSubmitPrice } from "../../components/request-form/request-form-state";
import { productShareText } from "../../components/product/product-share";
import { successTextParts } from "../../components/request-form/request-success";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ARABIC = /[\u0600-\u06FF]/;

/* --------------------------------------------------------- translator */

test("translator falls back to the Persian source string for unknown keys", () => {
  assert.equal(translate("fa", "هر متن دلخواه"), "هر متن دلخواه");
  assert.equal(translate("en", "یک کلید ترجمه‌نشده"), "یک کلید ترجمه‌نشده");
  assert.equal(translate("en", "سنگ مزار"), "Memorial Stones");
});

test("translator interpolates named placeholders in both locales", () => {
  assert.equal(translate("fa", "{amount} تومان", { amount: "۱۰۰" }), "۱۰۰ تومان");
  assert.equal(translate("en", "{amount} تومان", { amount: "100" }), "100 toman");
  assert.equal(
    translate("en", "کد پیگیری: {code}", { code: "REQ-1001" }),
    "Tracking code: REQ-1001",
  );
});

/* ------------------------------------------------------ locale routing */

test("locale is derived only from the URL prefix", () => {
  assert.equal(localeFromPathname("/"), "fa");
  assert.equal(localeFromPathname("/grave-stones/x"), "fa");
  assert.equal(localeFromPathname("/en"), "en");
  assert.equal(localeFromPathname("/en/grave-stones/x"), "en");
  assert.equal(localeFromPathname("/entrance"), "fa");
});

test("path mapping is reciprocal and keeps dynamic slugs stable", () => {
  assert.equal(localizePath("/grave-stones", "en"), "/en/grave-stones");
  assert.equal(localizePath("/stoneworks", "en"), "/en/stoneworks");
  assert.equal(basePathFromPathname("/en/stoneworks"), "/stoneworks");
  assert.equal(alternatePathname("/stoneworks", "en"), "/en/stoneworks");
  assert.equal(alternatePathname("/en/stoneworks", "fa"), "/stoneworks");
  assert.equal(localizePath("/", "en"), "/en");
  assert.equal(localizePath("/", "fa"), "/");
  assert.equal(basePathFromPathname("/en/guides/how-to"), "/guides/how-to");
  assert.equal(alternatePathname("/grave-stones/model-a", "en"), "/en/grave-stones/model-a");
  assert.equal(alternatePathname("/en/grave-stones/model-a", "fa"), "/grave-stones/model-a");
});

test("only the approved portfolio referral pair survives a language switch", () => {
  assert.deepEqual(safeSwitchSearch({ source: "portfolio", reference: "pf-1234" }), {
    source: "portfolio",
    reference: "pf-1234",
  });
  assert.deepEqual(safeSwitchSearch({ source: "portfolio", reference: "pf-1" }), {});
  assert.deepEqual(safeSwitchSearch({ name: "علی", phone: "09120000000" }), {});
  assert.deepEqual(safeSwitchSearch(undefined), {});
});

test("lang and dir follow the locale", () => {
  assert.equal(htmlLang("fa"), "fa");
  assert.equal(htmlDir("fa"), "rtl");
  assert.equal(htmlLang("en"), "en");
  assert.equal(htmlDir("en"), "ltr");
});

/* --------------------------------------------------------- content gate */

test("absent-locale content is Persian and never surfaces on English routes", () => {
  const persian = { slug: "a", title: "راهنما", locale: null };
  const english = { slug: "a", locale: "en", title: "Guide" };

  assert.equal(contentForLocale(persian, "fa"), persian);
  assert.equal(contentForLocale(persian, "en"), null);
  assert.equal(contentForLocale(english, "en"), english);
  assert.equal(contentForLocale(english, "fa"), null);

  assert.deepEqual(contentListForLocale([persian, english], "fa"), [persian]);
  assert.deepEqual(contentListForLocale([persian, english], "en"), [english]);
  assert.deepEqual(contentListForLocale(null, "en"), []);
});

test("site prose never leaks across locales while neutral values remain", () => {
  const site = {
    displayName: "نام برند",
    latinName: "Brand",
    phone: "02100000000",
    whatsappUrl: "https://wa.me/1",
    telegram: "@brand",
    address: "نشانی فارسی",
    workingHours: "شنبه تا چهارشنبه",
    links: { instagram: null, website: null, map: null },
  };

  const fa = siteForLocale(site, "fa");
  assert.equal(fa?.displayName, "نام برند");
  assert.equal(fa?.address, "نشانی فارسی");

  const en = siteForLocale(site, "en");
  assert.equal(en?.displayName, "Brand");
  assert.equal(en?.address, null);
  assert.equal(en?.workingHours, null);
  assert.equal(en?.phone, "02100000000");
  assert.equal(en?.links.instagram, null);
  assert.equal(siteForLocale(null, "en"), null);
});

/* -------------------------------------------------- dynamic English UI */

test("prices, price states and dates render in the active language", () => {
  assert.equal(formatMoney(1500000, "en"), "1,500,000 toman");
  assert.ok(!ARABIC.test(formatMoney(1500000, "en")));
  assert.equal(priceTypeLabel("review", "en"), "Requires review");
  assert.equal(priceTypeLabel("estimate", "en"), "Estimate");
  assert.equal(
    formatPriceLabel({ priceType: "estimate", amountToman: 1000 }, "en"),
    "Estimate: 1,000 toman",
  );
  assert.equal(
    formatPriceLabel({ priceType: "review", amountToman: null }, "en"),
    "Requires review",
  );
  assert.ok(ARABIC.test(formatPriceLabel({ priceType: "review", amountToman: null }, "fa")));
});

test("option rows and submitted prices are localized", () => {
  const option = {
    id: "o1",
    title: "Extra",
    priceType: "fixed" as const,
    amountToman: 2000,
    priceUpdatedAt: "2026-01-01",
    isAvailable: true,
    compatibleSizeCodes: [],
  };
  assert.equal(formatOptionPriceLabel(option, "en"), "Price: 2,000 toman");
  assert.equal(
    formatSubmitPrice({ priceType: "estimate", amountToman: 3000 }, "en"),
    "Estimate: 3,000 toman",
  );
  assert.equal(
    formatSubmitPrice({ priceType: "review", amountToman: null }, "en"),
    "Requires review",
  );
});

test("share text and success copy carry no Persian in English", () => {
  const share = productShareText("Granite model", "GS-001", (value, params) =>
    translate("en", value, params),
  );
  assert.ok(!ARABIC.test(share));
  assert.ok(share.includes("GS-001"));

  const parts = successTextParts((value, params) => translate("en", value, params));
  const joined = `${parts.before}REQ-1001${parts.after}`;
  assert.ok(!ARABIC.test(joined));
  assert.ok(joined.includes("REQ-1001"));
  // Natural spacing around the tracking code in both languages.
  assert.ok(!joined.includes("  "));
  const fa = successTextParts((value, params) => translate("fa", value, params));
  assert.ok(ARABIC.test(`${fa.before}${fa.after}`));
  assert.ok(!`${fa.before}REQ-1001${fa.after}`.includes("  "));
});

/* ----------------------------------------------------- English routes */

test("English route wrappers contain no Persian source text", () => {
  const dir = path.join(SRC, "routes/en");
  const files = (readdirSync(dir, { recursive: true }) as string[]).filter((file) =>
    /\.tsx?$/.test(file),
  );
  assert.ok(files.length >= 14);
  for (const file of files) {
    const source = readFileSync(path.join(dir, file), "utf8");
    assert.equal(ARABIC.test(source), false, `${file} must not contain Persian text`);
  }
});

test("the language switcher is the only place that renders a Persian label in English chrome", () => {
  const switcher = readFileSync(path.join(SRC, "components/layout/language-switcher.tsx"), "utf8");
  assert.ok(switcher.includes("فارسی"));
  assert.ok(switcher.includes("English"));
});
