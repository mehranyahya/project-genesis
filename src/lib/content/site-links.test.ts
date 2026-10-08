import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSiteLink } from "../../../scripts/site-links.mjs";

const kinds = ["telegram", "instagram", "website", "map", "whatsapp"] as const;

test("missing operational links remain absent instead of being invented", () => {
  for (const kind of kinds) {
    assert.equal(validateSiteLink(null, kind), null);
    assert.equal(validateSiteLink(undefined, kind), null);
    assert.equal(validateSiteLink("", kind), null);
  }
});

test("site links reject dangerous schemes, credentials, ports, controls, backslashes and non-public hosts", () => {
  for (const kind of kinds)
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,test",
      "//t.me/stone_brand",
      "http://t.me/stone_brand",
      "https://user:synthetic-password@t.me/stone_brand",
      "https://t.me:444/stone_brand",
      "https://t.me/stone_\nbrand",
      "https://t.me\\@evil.example/stone_brand",
      "https://localhost/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://studio.internal/",
    ])
      assert.throws(() => validateSiteLink(value, kind));
});

test("Telegram and Instagram links allow public profiles and reject redirects or private actions", () => {
  assert.equal(
    validateSiteLink("https://t.me/stone_brand", "telegram"),
    "https://t.me/stone_brand",
  );
  assert.equal(
    validateSiteLink("https://www.instagram.com/stone.brand/", "instagram"),
    "https://www.instagram.com/stone.brand/",
  );
  for (const value of [
    "https://t.me/share/url?url=https://evil.example",
    "https://t.me/+private",
    "https://t.me.evil.example/stone_brand",
    "https://t.me/stone_brand?next=evil",
  ]) {
    assert.throws(() => validateSiteLink(value, "telegram"));
  }
  for (const value of [
    "https://instagram.com/accounts/",
    "https://instagram.com/stone.brand/?next=evil",
    "https://instagram.com/../accounts/",
  ]) {
    assert.throws(() => validateSiteLink(value, "instagram"));
  }
});

test("website links accept a clean public HTTPS site without carrying query or fragment data", () => {
  assert.equal(
    validateSiteLink("https://stone.example/en/", "website"),
    "https://stone.example/en/",
  );
  for (const value of [
    "https://stone.example/?phone=synthetic",
    "https://stone.example/#token=synthetic",
  ]) {
    assert.throws(() => validateSiteLink(value, "website"));
  }
});

test("map links allow location pages from named providers and reject generic redirects", () => {
  for (const value of [
    "https://www.google.com/maps/search/?api=1&query=35.7,51.4",
    "https://maps.app.goo.gl/Example123",
    "https://goo.gl/maps/Example123",
    "https://www.openstreetmap.org/?mlat=35.7&mlon=51.4#map=16/35.7/51.4",
    "https://neshan.org/maps/share/35.7,51.4",
    "https://balad.ir/p/example-place",
  ])
    assert.equal(validateSiteLink(value, "map"), new URL(value).toString());
  for (const value of [
    "https://google.com/url?q=evil",
    "https://evil.example/maps/",
    "https://neshan.org/account",
    "https://www.google.com/maps?redirect=https://evil.example",
  ]) {
    assert.throws(() => validateSiteLink(value, "map"));
  }
});

test("WhatsApp retains the existing public phone contract and rejects duplicate or foreign parameters", () => {
  assert.equal(
    validateSiteLink("https://wa.me/989121234567", "whatsapp"),
    "https://wa.me/989121234567",
  );
  assert.ok(
    validateSiteLink("https://api.whatsapp.com/send?phone=989121234567&text=Stone", "whatsapp"),
  );
  for (const value of [
    "https://wa.me/09121234567",
    "https://api.whatsapp.com/send?phone=989121234567&phone=989111111111",
    "https://wa.me/989121234567?next=evil",
  ]) {
    assert.throws(() => validateSiteLink(value, "whatsapp"));
  }
});
