/**
 * Structural-test helpers for the bilingual route topology.
 *
 * Persian and English routes share one options factory in
 * `src/lib/route-defs/pages.tsx`. Structural tests therefore verify two things:
 * the thin locale wrappers under `src/routes/**`, and the shared factory
 * section that still owns the official adapter calls and safety bans.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const FACTORY_PATH = "lib/route-defs/pages.tsx";

export function readSource(rel: string): string {
  return readFileSync(path.join(SRC, rel), "utf8");
}

export const FACTORY_SOURCE = readSource(FACTORY_PATH);

/** `routes/portfolio.tsx` -> `routes/en/portfolio.tsx` */
export function englishWrapperPath(rel: string): string {
  return rel.replace(/^routes\//, "routes/en/");
}

/**
 * The slice of the shared factory that belongs to one exported options
 * factory, up to the next exported factory. Keeping the slice narrow means
 * per-route bans (for example "this route must not call getSite") stay real.
 */
export function factorySection(exportName: string): string {
  const start = FACTORY_SOURCE.indexOf(`export function ${exportName}(`);
  if (start === -1) throw new Error(`missing factory: ${exportName}`);
  const next = FACTORY_SOURCE.indexOf("\nexport function ", start + 1);
  return FACTORY_SOURCE.slice(start, next === -1 ? undefined : next);
}

/** The shared import header of the factory module. */
export const FACTORY_IMPORTS = FACTORY_SOURCE.slice(
  0,
  FACTORY_SOURCE.indexOf("export function"),
);

/** Wrapper sources plus the factory import header and the owning section. */
export function routeUnit(rel: string, exportName: string): string {
  return [
    readSource(rel),
    readSource(englishWrapperPath(rel)),
    FACTORY_IMPORTS,
    factorySection(exportName),
  ].join("\n");
}

/**
 * Same as {@link routeUnit} without the shared import header, so per-route
 * "must not call X" bans are not satisfied by another route's import.
 */
export function routeUnitBody(rel: string, exportName: string): string {
  return [readSource(rel), readSource(englishWrapperPath(rel)), factorySection(exportName)].join(
    "\n",
  );
}

export interface DelegationExpectation {
  readonly rel: string;
  readonly faRouteId: string;
  readonly enRouteId: string;
  readonly exportName: string;
}

/** True when both locale wrappers declare their route id and delegate correctly. */
export function delegationErrors({
  rel,
  faRouteId,
  enRouteId,
  exportName,
}: DelegationExpectation): string[] {
  const errors: string[] = [];
  const fa = readSource(rel);
  const en = readSource(englishWrapperPath(rel));

  const checks: Array<[string, string, string]> = [
    [rel, fa, faRouteId],
    [englishWrapperPath(rel), en, enRouteId],
  ];
  for (const [file, source, routeId] of checks) {
    if (!source.includes(`createFileRoute("${routeId}")`)) {
      errors.push(`${file} must declare createFileRoute("${routeId}")`);
    }
    if (!source.includes(exportName)) errors.push(`${file} must delegate to ${exportName}`);
    if (!source.includes('from "@/lib/route-defs/pages"')) {
      errors.push(`${file} must import the shared factory`);
    }
  }
  if (!fa.includes(`${exportName}("fa")`)) errors.push(`${rel} must pass "fa"`);
  if (!en.includes(`${exportName}("en")`)) {
    errors.push(`${englishWrapperPath(rel)} must pass "en"`);
  }
  return errors;
}
