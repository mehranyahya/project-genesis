import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUSINESS_ROUTES,
  FOOTER_LEGAL_NAV,
  PRIMARY_CTA,
  PRIMARY_NAV,
  MAIN_CONTENT_ID,
  SKIP_LINK_LABEL,
  isBusinessRoute,
} from "./navigation";

const EXPECTED = [
  "/",
  "/grave-stones",
  "/grave-stones/$slug",
  "/grave-stones/custom",
  "/portfolio",
  "/building-stone",
  "/guides",
  "/guides/$slug",
  "/quote",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];

test("business route allowlist matches the master contract exactly", () => {
  assert.deepEqual([...BUSINESS_ROUTES], EXPECTED);
});

test("no reserved or forbidden route is a business route", () => {
  for (const route of [
    "/404",
    "/404.html",
    "/en",
    "/en/about",
    "/success",
    "/cart",
    "/checkout",
    "/account",
    "/login",
    "/admin",
  ]) {
    assert.equal(isBusinessRoute(route), false, `${route} must not be a business route`);
  }
});

test("primary navigation targets are allowed, static and public", () => {
  for (const item of PRIMARY_NAV) {
    assert.ok(isBusinessRoute(item.to), `${item.to} not in allowlist`);
    assert.equal(item.to.includes("$"), false, "navigation cannot target a dynamic route");
    assert.ok(item.label.trim().length > 0);
  }
  assert.deepEqual(
    PRIMARY_NAV.map((item) => item.to),
    [
      "/grave-stones",
      "/grave-stones/custom",
      "/portfolio",
      "/building-stone",
      "/guides",
      "/about",
      "/contact",
    ],
  );
});

test("legal routes live in the footer only", () => {
  assert.deepEqual(
    FOOTER_LEGAL_NAV.map((item) => item.to),
    ["/privacy", "/terms"],
  );
  for (const item of PRIMARY_NAV) {
    assert.equal(item.to === "/privacy" || item.to === "/terms", false);
  }
});

test("primary CTA label and destination are exact", () => {
  assert.equal(PRIMARY_CTA.label, "انتخاب و ثبت سفارش");
  assert.equal(PRIMARY_CTA.to, "/grave-stones");
  for (const stale of ["ثبت درخواست", "خرید آنلاین", "افزودن به سبد", "پرداخت"]) {
    assert.notEqual(PRIMARY_CTA.label, stale);
  }
});

test("skip link contract", () => {
  assert.equal(SKIP_LINK_LABEL, "رفتن به محتوای اصلی");
  assert.equal(MAIN_CONTENT_ID, "main-content");
});
