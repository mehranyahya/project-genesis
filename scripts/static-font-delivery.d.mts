export function verifyStaticFontDelivery(input: {
  assetDirectory: string;
  sourceDirectory: string;
}): Promise<Array<{ family: string; url: string; bytes: number; sha256: string }>>;
