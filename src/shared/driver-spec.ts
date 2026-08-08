/**
 * Parsing and validation of the `--driver` specification.
 *
 * The grammar is identical to the upstream script (line 107):
 *   latest | ^[0-9]+(\.[0-9]+)*(-[0-9]+)?$
 * i.e. `latest`, a branch (`580`), a release (`580.105.08`) or an exact build
 * (`580.105.08-4`). We reproduce it here so the GUI can reject bad input before
 * spending 10–20 minutes on a build, and so the branch can feed GPU-compat.
 */
import type { ParsedDriverSpec } from './types.js';

/** Same character class the upstream `[[ ... =~ ... ]]` guard enforces. */
export const DRIVER_SPEC_PATTERN = /^[0-9]+(\.[0-9]+)*(-[0-9]+)?$/;

export function isValidDriverSpec(raw: string): boolean {
  const s = raw.trim();
  if (s === 'latest') return true;
  return DRIVER_SPEC_PATTERN.test(s);
}

/**
 * Parse a driver spec. Throws on invalid input (same failure the script would
 * hit) with the same guidance text the user would see on the CLI.
 */
export function parseDriverSpec(raw: string): ParsedDriverSpec {
  const s = raw.trim();
  if (!isValidDriverSpec(s)) {
    throw new Error(
      "--driver takes 'latest' or a version prefix like 580 / 580.105.08 / 580.105.08-4",
    );
  }
  if (s === 'latest') {
    return { raw: s, isLatest: true, branch: null, release: null, build: null };
  }
  const [versionPart, buildNum] = s.split('-');
  const segments = versionPart.split('.');
  const branch = segments[0];
  const release = segments.length >= 2 ? versionPart : null;
  const build = buildNum !== undefined ? s : null;
  return { raw: s, isLatest: false, branch, release, build };
}

/**
 * The branch (major version) as an integer, or null for `latest`. Used to
 * decide whether a pinned branch predates nvidia-open's Turing support etc.
 */
export function driverBranchNumber(spec: ParsedDriverSpec): number | null {
  if (spec.branch === null) return null;
  const n = Number.parseInt(spec.branch, 10);
  return Number.isNaN(n) ? null : n;
}
