import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  assertMetadataStripped,
  encodeWithinBudget,
  validateSource,
} from "../../../scripts/generate-structured-content.mjs";

function fixture(width = 1280, height = 1600) {
  return sharp({
    create: { width, height, channels: 3, background: "#cccccc" },
  });
}

test("native encoder honors orientation, responsive dimensions, budgets and metadata removal", async () => {
  const source = await fixture(1600, 1280)
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Artist: "synthetic-test-fixture" } })
    .jpeg()
    .toBuffer();
  assert.ok((await sharp(source).metadata()).exif);
  await assert.rejects(assertMetadataStripped(source), /EXIF\/XMP\/IPTC/);
  assert.deepEqual(await validateSource(source, "image/jpeg", "product"), {
    width: 1280,
    height: 1600,
  });

  for (const [width, budget] of [
    [320, 30 * 1024],
    [640, 70 * 1024],
    [1280, 220 * 1024],
  ] as const) {
    for (const format of ["webp", "avif"] as const) {
      const { data, info } = await encodeWithinBudget(source, width, format, budget);
      assert.ok(data.length > 0 && data.length <= budget);
      assert.equal(info.width, width);
      assert.equal(info.height, (width * 5) / 4);
      const metadata = await sharp(data).metadata();
      assert.equal(metadata.format, format === "avif" ? "heif" : "webp");
      assert.equal(metadata.orientation, undefined);
      await assertMetadataStripped(data);
    }
  }
});

test("patched native decoder accepts each permitted raster format", async () => {
  for (const [format, mime] of [
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
    ["avif", "image/avif"],
  ] as const) {
    const bytes = await fixture().toFormat(format).toBuffer();
    assert.deepEqual(await validateSource(bytes, mime, "product"), {
      width: 1280,
      height: 1600,
    });
  }
});

test("native pipeline rejects MIME mismatch, markup, malformed and undersized sources", async () => {
  const valid = await fixture().png().toBuffer();
  await assert.rejects(validateSource(valid, "image/jpeg", "product"), /MIME/);
  await assert.rejects(
    validateSource(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      "image/png",
      "product",
    ),
    /magic bytes/,
  );
  await assert.rejects(validateSource(Buffer.from([0xff, 0xd8, 0xff]), "image/jpeg", "product"));
  const small = await fixture(640, 800).png().toBuffer();
  await assert.rejects(validateSource(small, "image/png", "product"), /narrower than 1280px/);
});

test("native encoder fails closed when output cannot meet its byte budget", async () => {
  const source = await fixture().png().toBuffer();
  await assert.rejects(encodeWithinBudget(source, 320, "webp", 1), /exceeds media byte budget/);
});
