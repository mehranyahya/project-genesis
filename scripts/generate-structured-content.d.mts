import type { OutputInfo } from "sharp";

export function validateSource(
  bytes: Buffer,
  declaredMime: string,
  ownerKind: "product" | "portfolio" | "building",
): Promise<{ width: number; height: number }>;

export function encodeWithinBudget(
  input: Buffer,
  width: number,
  format: "webp" | "avif",
  budget: number,
): Promise<{ data: Buffer; info: OutputInfo }>;

export function assertMetadataStripped(buffer: Buffer): Promise<void>;
