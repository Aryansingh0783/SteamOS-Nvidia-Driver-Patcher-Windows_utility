/**
 * NVIDIA GPU compatibility for the nvidia-open (open kernel modules) driver.
 *
 * Ground truth (from the upstream README and NVIDIA's open-module support
 * matrix): the open kernel modules support **Turing and newer only**. In
 * practice that is:
 *   - Turing:    RTX 20-series, TITAN RTX, and the GTX 16-series (TU11x)
 *   - Ampere:    RTX 30-series
 *   - Ada:       RTX 40-series
 *   - Blackwell: RTX 50-series
 * Pre-Turing (Pascal GTX 10-series, Maxwell and older) is **not supported**.
 *
 * The upstream project positions itself around RTX hardware and was verified on
 * an RTX 5060 Ti. We therefore mark GTX 16-series as supported-with-caveat
 * (Turing-class, but untested by upstream) rather than silently claiming parity.
 * We never claim "all NVIDIA GPUs work".
 */
import type { GpuArchitecture, GpuCompatResult } from './types.js';

const RTX_RE = /\bRTX\s*(\d{3,4})\b/i;
const GTX_RE = /\bGTX\s*(\d{3,4})\b/i;
const HYBRID_RE = /\b(max-?q|laptop|mobile)\b/i;

/** Map an RTX/GTX numeric model to an architecture. */
function archFromModelNumber(prefix: 'RTX' | 'GTX', model: number): GpuArchitecture {
  if (prefix === 'RTX') {
    if (model >= 5000 && model < 6000) return 'blackwell';
    if (model >= 4000 && model < 5000) return 'ada';
    if (model >= 3000 && model < 4000) return 'ampere';
    if (model >= 2000 && model < 3000) return 'turing';
    return 'unknown';
  }
  // GTX
  if (model >= 1600 && model < 1700) return 'turing'; // GTX 16-series is Turing
  if (model >= 900 && model < 1600) return 'pre-turing'; // GTX 9xx/10xx: Maxwell/Pascal
  if (model < 900) return 'pre-turing';
  return 'unknown';
}

/** Best-effort classification of an NVIDIA GPU model string into an architecture. */
export function classifyGpu(name: string): GpuArchitecture {
  const rtx = RTX_RE.exec(name);
  if (rtx) return archFromModelNumber('RTX', Number.parseInt(rtx[1], 10));
  const gtx = GTX_RE.exec(name);
  if (gtx) return archFromModelNumber('GTX', Number.parseInt(gtx[1], 10));
  if (/\bTITAN\s+RTX\b/i.test(name)) return 'turing';
  if (/\bTITAN\s+(X|Xp|V)\b/i.test(name)) return 'pre-turing';
  return 'unknown';
}

const ARCH_LABEL: Record<GpuArchitecture, string> = {
  'pre-turing': 'Pre-Turing (Pascal/Maxwell or older)',
  turing: 'Turing',
  ampere: 'Ampere',
  ada: 'Ada Lovelace',
  blackwell: 'Blackwell',
  unknown: 'Unknown',
};

/**
 * Assess whether a GPU can be driven by the nvidia-open driver this tool
 * installs. Returns a structured, always-populated result for the UI.
 */
export function assessGpuCompat(name: string): GpuCompatResult {
  const architecture = classifyGpu(name);
  const hybrid = HYBRID_RE.test(name);
  const caveat = hybrid
    ? 'Looks like a hybrid-graphics laptop (iGPU + NVIDIA). The iGPU may own the boot display; desktops with a single RTX card are the tested path.'
    : undefined;

  switch (architecture) {
    case 'blackwell':
    case 'ada':
    case 'ampere':
      return {
        supported: true,
        architecture,
        reason: `${ARCH_LABEL[architecture]} is supported by nvidia-open (Turing or newer required).`,
        ...(caveat ? { caveat } : {}),
      };
    case 'turing': {
      // GTX 16-series is Turing but untested upstream.
      const isGtx16 = GTX_RE.test(name);
      const turingCaveat = isGtx16
        ? 'GTX 16-series is Turing-class and supported by the open kernel modules, but this project is tested only on RTX hardware — results may vary.'
        : caveat;
      return {
        supported: true,
        architecture,
        reason: 'Turing is the minimum architecture supported by nvidia-open.',
        ...(turingCaveat ? { caveat: turingCaveat } : {}),
      };
    }
    case 'pre-turing':
      return {
        supported: false,
        architecture,
        reason:
          'Pre-Turing GPUs (Pascal GTX 10-series, Maxwell and older) are NOT supported. ' +
          'nvidia-open requires Turing (RTX 20-series / GTX 16-series) or newer.',
      };
    case 'unknown':
    default:
      return {
        supported: false,
        architecture: 'unknown',
        reason:
          'Could not determine the GPU architecture from the model name. ' +
          'nvidia-open requires Turing (RTX 20-series) or newer; verify your card before building.',
      };
  }
}
