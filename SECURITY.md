# SECURITY.md

This is a low-level disk-writing application that runs privileged Linux tooling.
Correctness and data safety are treated as higher priority than convenience.

## Process / IPC isolation

- Electron `BrowserWindow` runs with **`contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`**.
- The renderer's only capability is the typed `window.api` object exposed by the
  preload via `contextBridge`. It has **no** `ipcRenderer`, `require`, `fs`, or
  `child_process`.
- A strict **Content-Security-Policy** is applied both as a response header and
  as a `<meta>` tag: `default-src 'self'`, `script-src 'self'`,
  `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`. No remote
  scripts, styles (beyond inline for the app's own tokens), fonts or connections.
- External navigation and `window.open` are blocked; links are handed to the OS
  browser via `shell.openExternal`.
- Single-instance lock — a disk writer must never run twice concurrently.

## No shell injection — argv everywhere

- **Every** external process is launched through one runner with `shell: false`
  and an **argv array**. No `cmd.exe` / `/bin/sh` string is ever assembled from
  untrusted input, so there is no classic injection surface.
- `command.ts` validates every argument (`assertSafeArg` rejects NUL and control
  characters), the WSL distro name (`assertDistroName`), and physical-disk
  indices (`assertDiskIndex`, integer-bounded).
- The rare `bash -c '<script>'` uses **trusted, constant** scripts authored in
  this repo; any dynamic value handed to a POSIX shell goes through
  `posixSingleQuote` (single-quote wrapping with `'\''` escaping).
- PowerShell scripts are fixed constants; the only interpolated values are
  validated integers (disk indices).

## Destructive-operation safeguards (flashing)

Enforced in `src/shared/usb.ts` (pure, unit-tested) and the confirm dialog:

1. Disks are enumerated as **physical devices**, never by drive letter alone.
2. The **system/boot disk is never selectable** (highest-priority guard).
3. **Internal (non-removable) disks are excluded by default**; USB-bus fixed
   media (e.g. USB SSDs) count as external.
4. Disks **smaller than the image** and **write-protected** disks are rejected.
5. **Very large** disks and disks with **mounted volumes** require a *second*
   confirmation (typed `ERASE`).
6. The flash button stays disabled until: a valid patched image exists **and** a
   selectable removable USB is chosen **and** capacity is sufficient **and** the
   device list was **re-scanned recently** **and** the user acknowledged the
   erase warning **and** confirmed the exact drive.
7. Immediately before writing, the target's **identity is re-verified**
   (index + model + size + serial). If it changed, the write is aborted.
8. Cancellation during the write is explicit and honestly reported: the USB is
   left partially written and must be re-flashed.

## Elevation

- The build step runs as root **inside the app's WSL distro** — never elevates
  the user's whole Windows session for building.
- The **flash** step needs Administrator to take a disk offline and open
  `\\.\PhysicalDriveN`. The packaged app requests elevation (`requireAdministrator`)
  and the UI explains why. UAC cancellation is handled gracefully (no partial
  writes begin without the offline transition succeeding).

## Supply chain / trust

- The upstream Bash workflow is **vendored verbatim** and executed unmodified;
  its checksum is recorded in [LICENSE-NOTICES.md](LICENSE-NOTICES.md). Review
  `resources/steamos-nvidia-installer.sh` before running.
- Driver packages are fetched by the upstream script from **Arch
  infrastructure over HTTPS** and pinned to permanent `archive.archlinux.org`
  URLs; the kernel module is compiled locally. `--skip-sigcheck` is an explicit,
  explained opt-in (never the default).
- The original user image is **never modified**; all work happens on a copy.

## Logging

- A structured audit log streams to the UI and to a per-session file under the
  app's `userData`. Obvious secrets (URL userinfo, `token=`/`password=` pairs)
  are **redacted** before either sink. No credentials are required or stored.

## Reporting

This is a hobby project provided as-is. If you find a safety issue in the
destructive path, please open a GitHub issue describing the exact drive
selection / confirmation flow that could be bypassed.
