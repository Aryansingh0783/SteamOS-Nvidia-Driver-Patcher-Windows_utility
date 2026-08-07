/**
 * USB / physical-disk service (Windows).
 *
 * Enumerates *physical* disks (not drive letters) with a fixed PowerShell
 * script, and provides the offline/online transitions needed for a safe raw
 * write. All parsing and safety gating is delegated to the pure `@shared/usb`
 * module so it can be unit-tested; this file only does I/O.
 */
import { runPowerShell, runPowerShellJson, isWindows } from './powershell.js';
import { assertDiskIndex } from '@shared/command.js';
import { parseDiskList, type RawDiskJson } from '@shared/usb.js';
import type { DiskDevice } from '@shared/types.js';

/**
 * Enumerate every physical disk with the properties we need to judge safety.
 * Combines Get-Disk (system/boot/readonly/bus) with Win32_DiskDrive (media
 * type ⇒ removable) and Get-Partition (mounted drive letters).
 */
const ENUM_SCRIPT = String.raw`
$ErrorActionPreference='SilentlyContinue'
$wmi=@{}
Get-CimInstance Win32_DiskDrive | ForEach-Object { $wmi[[int]$_.Index]=$_ }
$out = Get-Disk | ForEach-Object {
  $d=$_
  $w=$wmi[[int]$d.Number]
  $media = if ($w) { [string]$w.MediaType } else { '' }
  $removable = ($media -match 'Removable') -or ($media -match 'External')
  $vols=@()
  try {
    $vols = @(Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue |
      Where-Object { $_.DriveLetter } | ForEach-Object { "$($_.DriveLetter):" })
  } catch {}
  [PSCustomObject]@{
    index=[int]$d.Number
    model=[string]$d.FriendlyName
    serial= if ($d.SerialNumber) { ([string]$d.SerialNumber).Trim() } else { $null }
    sizeBytes=[int64]$d.Size
    bus=[string]$d.BusType
    removable=[bool]$removable
    isSystem=[bool]($d.IsSystem -or $d.IsBoot)
    readOnly=[bool]$d.IsReadOnly
    mountedVolumes=$vols
  }
}
ConvertTo-Json -InputObject @($out) -Depth 4 -Compress
`;

export async function scanDisks(): Promise<DiskDevice[]> {
  if (!isWindows()) return [];
  const raw = await runPowerShellJson<RawDiskJson[]>(ENUM_SCRIPT);
  // runPowerShellJson already parsed JSON; re-serialise for the shared parser so
  // all normalisation/validation lives in one tested place.
  return parseDiskList(JSON.stringify(raw));
}

/** Re-read a single disk by index (used to re-verify identity before flashing). */
export async function getDisk(index: number): Promise<DiskDevice | null> {
  assertDiskIndex(index);
  const all = await scanDisks();
  return all.find((d) => d.index === index) ?? null;
}

/**
 * Take a disk offline (dismounts its volumes) and clear read-only so a raw
 * write can proceed. Requires Administrator. Returns after Windows has applied
 * the change.
 */
export async function setDiskOffline(index: number, offline: boolean): Promise<void> {
  assertDiskIndex(index);
  const script = offline
    ? `Set-Disk -Number ${index} -IsOffline $true; Set-Disk -Number ${index} -IsReadOnly $false`
    : `Set-Disk -Number ${index} -IsOffline $false`;
  const r = await runPowerShell(script);
  if (r.exitCode !== 0) {
    throw new Error(
      `Failed to ${offline ? 'offline' : 'online'} disk ${index}: ${r.stderr.trim() || 'unknown error'}`,
    );
  }
}
