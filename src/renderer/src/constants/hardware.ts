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
