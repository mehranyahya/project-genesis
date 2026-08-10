const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 4_096;
const NUMBER_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;

function hasValidUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

class JsonStructureScanner {
  private index = 0;
  private nodes = 0;

  constructor(private readonly source: string) {}

  scan(): boolean {
    try {
      this.skipWhitespace();
      this.scanValue(0);
      this.skipWhitespace();
      return this.index === this.source.length;
    } catch {
      return false;
    }
  }

  private fail(): never {
    throw new Error("Invalid JSON structure");
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) break;
      this.index += 1;
    }
  }

  private scanValue(depth: number): void {
    if (depth > MAX_JSON_DEPTH || (this.nodes += 1) > MAX_JSON_NODES) this.fail();
    this.skipWhitespace();
    const character = this.source[this.index];
    if (character === "{") return this.scanObject(depth + 1);
    if (character === "[") return this.scanArray(depth + 1);
    if (character === '"') {
      this.scanString();
      return;
    }
    if (character === "t") return this.scanLiteral("true");
    if (character === "f") return this.scanLiteral("false");
    if (character === "n") return this.scanLiteral("null");
    this.scanNumber();
  }

  private scanObject(depth: number): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return;
    }

    const keys = new Set<string>();
    while (true) {
      this.skipWhitespace();
      if (this.source[this.index] !== '"') this.fail();
      const key = this.scanString();
      if (keys.has(key)) this.fail();
      keys.add(key);
      this.skipWhitespace();
      if (this.source[this.index] !== ":") this.fail();
      this.index += 1;
      this.scanValue(depth);
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === "}") {
        this.index += 1;
        return;
      }
      if (separator !== ",") this.fail();
      this.index += 1;
    }
  }

  private scanArray(depth: number): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return;
    }
    while (true) {
      this.scanValue(depth);
      this.skipWhitespace();
      const separator = this.source[this.index];
      if (separator === "]") {
        this.index += 1;
        return;
      }
      if (separator !== ",") this.fail();
      this.index += 1;
    }
  }

  private scanString(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (code === 0x22) {
        this.index += 1;
        const value = JSON.parse(this.source.slice(start, this.index)) as unknown;
        if (typeof value !== "string" || !hasValidUtf16(value)) this.fail();
        return value;
      }
      if (code < 0x20) this.fail();
      if (code === 0x5c) {
        this.index += 1;
        const escape = this.source[this.index];
        if (escape === "u") {
          const hex = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail();
          this.index += 5;
          continue;
        }
        if (!['"', "\\", "/", "b", "f", "n", "r", "t"].includes(escape ?? "")) {
          this.fail();
        }
      }
      this.index += 1;
    }
    this.fail();
  }

  private scanLiteral(literal: string): void {
    if (this.source.slice(this.index, this.index + literal.length) !== literal) this.fail();
    this.index += literal.length;
  }

  private scanNumber(): void {
    const match = NUMBER_PATTERN.exec(this.source.slice(this.index));
    if (match === null) this.fail();
    this.index += match[0].length;
  }
}

function validateStrings(value: unknown, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH) return false;
  if (typeof value === "string") return hasValidUtf16(value);
  if (Array.isArray(value)) return value.every((item) => validateStrings(item, depth + 1));
  if (value === null || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, item]) => hasValidUtf16(key) && validateStrings(item, depth + 1),
  );
}

export function parseStrictJson(source: string): unknown | null {
  if (!new JsonStructureScanner(source).scan()) return null;
  try {
    const value: unknown = JSON.parse(source);
    return validateStrings(value) ? value : null;
  } catch {
    return null;
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value === null || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(input).sort()) {
    Object.defineProperty(output, key, {
      value: stableValue(input[key]),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return output;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export async function readBoundedUtf8(
  stream: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<string | null> {
  if (stream === null) return null;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
