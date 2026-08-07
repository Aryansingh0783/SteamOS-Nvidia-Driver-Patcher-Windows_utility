/**
 * PowerShell helper (Windows only).
 *
 * Scripts passed here are authored by us — never assembled from untrusted input.
 * The only dynamic values ever interpolated are validated integers (disk
 * indices), which cannot carry an injection. Everything runs with `-NoProfile
 * -NonInteractive` and an isolated execution policy.
 */
import { runProcess, assertClean, type RunOptions } from './process-runner.js';
import type { ProcessResult } from '@shared/types.js';

const PS = 'powershell.exe';
const BASE_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function runPowerShell(script: string, options: RunOptions = {}): Promise<ProcessResult> {
  return runProcess(PS, [...BASE_ARGS, script], options);
}

export async function runPowerShellJson<T>(script: string, options: RunOptions = {}): Promise<T> {
  // Force UTF-8 and compact JSON to make parsing deterministic.
  const wrapped = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ${script}`;
  const result = assertClean(await runPowerShell(wrapped, options));
  const text = result.stdout.trim();
  if (!text) return [] as unknown as T;
  return JSON.parse(text) as T;
}

/** Whether the current process holds the Administrator role. */
export async function isElevated(): Promise<boolean> {
  if (!isWindows()) return false;
  try {
    const script =
      '$id=[System.Security.Principal.WindowsIdentity]::GetCurrent();' +
      '$p=New-Object System.Security.Principal.WindowsPrincipal($id);' +
      '$p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator) | ConvertTo-Json -Compress';
    const result = await runPowerShell(script);
    return result.stdout.trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}
