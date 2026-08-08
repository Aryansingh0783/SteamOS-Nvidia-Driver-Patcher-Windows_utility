/**
 * Pure image-validation rules.
 *
 * These are the decisions the GUI can make cheaply (filename, extension,
 * already-patched, size sanity) plus the interpretation of structural facts
 * that the WSL side discovers (partition labels, kernel, repair_device.sh,
 * SteamOS version). The expensive discovery itself lives in a main-process
 * service; this module is pure so it can be exhaustively unit-tested.
 */
import type {
  ImageValidationIssue,
  ImageValidationResult,
  SteamosImageInfo,
} from './types.js';

/** Partitions the upstream script requires (script lines 188–197). */
export const REQUIRED_PARTITIONS = ['rootfs-A', 'efi-A', 'home'] as const;

/** SteamOS versions upstream is known to work on (README/script header). */
export const TESTED_STEAMOS_MIN = '3.8.10';
export const TESTED_STEAMOS_MAX = '3.8.14';

/** A real SteamOS recovery image is several GB; guardrails, not hard science. */
const HARD_MIN_BYTES = 512 * 1024 * 1024; // below this it cannot be a recovery image
const SOFT_MIN_BYTES = 3 * 1024 * 1024 * 1024; // below this, warn

const COMPRESSED_EXT = /\.(bz2|gz|xz|zip|zst|7z)$/i;

/** basename of a path, using both separators. */
export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] ?? p;
}

/** Compare dotted-numeric versions. -1 | 0 | 1. Non-numeric segments sort last. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10));
  const pb = b.split('.').map((x) => Number.parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

/** Upstream refuses inputs whose basename matches `*-nvidia*.img` (line 128). */
export function isAlreadyPatchedName(path: string): boolean {
  return /-nvidia.*\.img$/i.test(basename(path));
}

/** Filename/extension checks. Returns issues (possibly empty). */
export function validateImageFilename(path: string): ImageValidationIssue[] {
  const issues: ImageValidationIssue[] = [];
  const name = basename(path);
  if (COMPRESSED_EXT.test(name)) {
    issues.push({
      code: 'COMPRESSED',
      severity: 'error',
      message: `"${name}" looks compressed. Decompress it to a raw .img first.`,
      hint: 'Valve ships the recovery image as .img.bz2 — run `bunzip2` (or 7-Zip) to get the .img.',
    });
    return issues;
  }
  if (!/\.img$/i.test(name)) {
    issues.push({
      code: 'BAD_EXTENSION',
      severity: 'error',
      message: `Expected a ".img" file but got "${name}".`,
      hint: 'Select the decompressed SteamOS recovery image (ends in .img).',
    });
  }
  if (isAlreadyPatchedName(path)) {
    issues.push({
      code: 'ALREADY_PATCHED',
      severity: 'error',
      message: `"${name}" looks like an already-patched image.`,
      hint: 'Start from the clean recovery image; the patched output cannot be re-patched.',
    });
  }
  return issues;
}

/** Size sanity given the file's byte length. */
export function validateImageSize(sizeBytes: number): ImageValidationIssue[] {
  const issues: ImageValidationIssue[] = [];
  if (sizeBytes < HARD_MIN_BYTES) {
    issues.push({
      code: 'TOO_SMALL',
      severity: 'error',
      message: `Image is only ${Math.round(sizeBytes / (1024 * 1024))} MB — too small to be a SteamOS recovery image.`,
    });
  } else if (sizeBytes < SOFT_MIN_BYTES) {
    issues.push({
      code: 'TOO_SMALL',
      severity: 'warning',
      message: `Image is smaller (${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB) than a typical SteamOS recovery image (~8 GB). Double-check it is the full recovery image.`,
    });
  }
  return issues;
}

/** Interpret structural facts discovered via WSL tools. */
export function validateImageStructure(info: SteamosImageInfo): ImageValidationIssue[] {
  const issues: ImageValidationIssue[] = [];
  const missing = REQUIRED_PARTITIONS.filter((p) => !info.partitions.includes(p));
  if (missing.length > 0) {
    issues.push({
      code: 'STRUCTURE_MISSING',
      severity: 'error',
      message: `Missing required SteamOS partition(s): ${missing.join(', ')}.`,
      hint: 'This does not look like a SteamOS recovery image (needs rootfs-A, efi-A, home).',
    });
  }
  if (info.kernelVersion === null) {
    issues.push({
      code: 'STRUCTURE_MISSING',
      severity: 'error',
      message: 'No SteamOS (neptune) kernel found inside the image.',
    });
  }
  if (!info.hasRepairDevice) {
    issues.push({
      code: 'STRUCTURE_MISSING',
      severity: 'warning',
      message: 'Valve\'s repair_device.sh was not found in the image home.',
      hint: 'The one-click desktop installer needs the OOBE *repair* image. You can still build a plain bootable OS with the installer disabled.',
    });
  }
  if (info.steamosVersion !== null) {
    if (
      compareVersions(info.steamosVersion, TESTED_STEAMOS_MIN) < 0 ||
      compareVersions(info.steamosVersion, TESTED_STEAMOS_MAX) > 0
    ) {
      issues.push({
        code: 'UNSUPPORTED_VERSION',
        severity: 'warning',
        message: `SteamOS ${info.steamosVersion} is outside the tested range (${TESTED_STEAMOS_MIN}–${TESTED_STEAMOS_MAX}).`,
        hint: 'It may still work; proceed with awareness that this version is unverified.',
      });
    }
  }
  return issues;
}

/** Collapse a set of issues into a pass/fail result (any error ⇒ not ok). */
export function combineIssues(issues: ImageValidationIssue[]): ImageValidationResult {
  const ok = !issues.some((i) => i.severity === 'error');
  return { ok, issues };
}

/**
 * Full front-end validation from filename + size alone (pre-WSL). Structural
 * checks are added later via {@link validateImageStructure} once discovered.
 */
export function validateImageBasics(path: string, sizeBytes: number): ImageValidationResult {
  return combineIssues([...validateImageFilename(path), ...validateImageSize(sizeBytes)]);
}
