/**
 * Hardware-support copy for the UI. Deliberately conservative and honest — we
 * never claim "all NVIDIA GPUs work". Mirrors the upstream support matrix.
 */
export interface SupportRow {
  arch: string;
  examples: string;
  status: 'supported' | 'supported-caveat' | 'unsupported';
  note: string;
}

export const SUPPORT_MATRIX: SupportRow[] = [
  {
    arch: 'Blackwell',
    examples: 'RTX 50-series (5060–5090)',
    status: 'supported',
    note: 'Upstream verified on an RTX 5060 Ti (driver 610.43.03).',
  },
  {
    arch: 'Ada Lovelace',
    examples: 'RTX 40-series',
    status: 'supported',
    note: 'Supported by nvidia-open.',
  },
  {
    arch: 'Ampere',
    examples: 'RTX 30-series',
    status: 'supported',
    note: 'Supported by nvidia-open.',
  },
  {
    arch: 'Turing (RTX)',
    examples: 'RTX 20-series, TITAN RTX',
    status: 'supported',
    note: 'Minimum supported architecture.',
  },
  {
    arch: 'Turing (GTX)',
    examples: 'GTX 16-series',
    status: 'supported-caveat',
    note: 'Turing-class and supported by the open modules, but untested by upstream.',
  },
  {
    arch: 'Pre-Turing',
    examples: 'GTX 10-series & older, all pre-RTX',
    status: 'unsupported',
    note: 'nvidia-open does not support Pascal/Maxwell or older. Will not work.',
  },
];

export const HARDWARE_REQUIREMENTS = [
  'Target machine boots via UEFI with Secure Boot DISABLED.',
  'Desktop with a single RTX card is the tested path; hybrid laptops (iGPU + RTX) may vary.',
  'A USB stick / external drive of 16 GB or larger.',
];

/** Guidance for Intel + NVIDIA (Optimus) laptops — the hardest case. */
export const HYBRID_LAPTOP = {
  title: 'Intel + NVIDIA (Optimus) laptops',
  summary:
    'Hybrid laptops are the hardest case. The Intel iGPU usually owns the internal display while the NVIDIA GPU is a render-offload device, but SteamOS/gamescope expect a single primary GPU — so the internal panel may stay black. Upstream flags hybrids as “results vary”.',
  steps: [
    'Best fix — BIOS/UEFI: set graphics to “Discrete/dGPU only”, or enable the MUX so the NVIDIA drives the internal panel. Many gaming laptops (Lenovo Legion, ASUS ROG, MSI, etc.) have this. That turns your laptop into the supported single-NVIDIA path.',
    'No MUX/dGPU-only option? Use an external monitor on a port wired directly to the NVIDIA GPU (often HDMI or USB-C) — that is the most reliable output.',
    'Secure Boot must be OFF (the NVIDIA kernel module is unsigned).',
    'Black internal screen but external works ⇒ your panel is Intel-wired with no MUX. Use the BIOS dGPU-only option or an NVIDIA-wired port.',
    'Diagnose from a black screen: Ctrl+Alt+F3, log in as deck, run `nvidia-smi` (is the driver loaded?), then `steamos-session-select plasma`.',
  ],
  honest:
    'This tool does not change your laptop’s display wiring. On no-MUX Optimus laptops SteamOS may still not light the internal panel through NVIDIA — the BIOS dGPU/MUX route (or an NVIDIA-wired external monitor) is the dependable path.',
};
