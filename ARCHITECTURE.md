# ARCHITECTURE.md

## Overview

An Electron app split into four layers with a strict, typed boundary between
them. The renderer never has Node/fs/child_process access; it talks to the main
process only through a small typed bridge.

```
┌─────────────────────────── renderer (sandbox) ───────────────────────────┐
│ React + framer-motion UI (Premium Motion System, warm-dark HUD)           │
│ zustand store  ── mirrors AppSnapshot, dispatches via window.api          │
└───────────────▲───────────────────────────────────────────────┬──────────┘
                │  window.api (typed)                            │ events
┌───────────────┴──────── preload (contextBridge) ───────────────▼──────────┐
│ exposes exactly one object: Api. No ipcRenderer/Node leaks to the page.    │
└───────────────▲───────────────────────────────────────────────┬──────────┘
        ipcMain.invoke                                    webContents.send
┌───────────────┴──────────────── main (Node) ───────────────────▼──────────┐
│ ipc.ts  ──►  Orchestrator (workflow state machine)                         │
│                 ├─ environment.ts   (WSL2 + disk + elevation)              │
│                 ├─ wsl.ts           (dedicated Arch distro, capabilities)  │
│                 ├─ image-service.ts (copy-in, inspect, run vendored .sh)   │
│                 ├─ usb-service.ts   (PowerShell enumerate / offline)       │
│                 ├─ flash-service.ts (raw write + verify)                   │
│                 ├─ process-runner.ts(argv-only spawn, streaming, cancel)   │
│                 └─ logger.ts        (audit log, redaction, fan-out)        │
└───────────────────────────────────────────────────────────────────────────┘
                         │ argv (shell:false)
        ┌────────────────┴─────────────────┐
        │ wsl.exe -d SteamOS-NVIDIA-Builder │ ──► vendored steamos-nvidia-installer.sh (UNMODIFIED)
        │ powershell.exe (enumerate/offline)│
        └───────────────────────────────────┘
```

## `src/shared` — pure, dependency-free, unit-tested

Everything that makes a *decision* lives here so it can be tested without
Electron or a Windows host:

| Module | Responsibility |
|---|---|
| `types.ts` | All domain types + `WorkflowState`. |
| `workflow.ts` | State machine: legal transition table, `assertTransition`, progress. |
| `driver-spec.ts` | Parse/validate `--driver` (mirrors upstream regex). |
| `gpu-compat.ts` | Classify a GPU model → architecture → nvidia-open support. |
| `command.ts` | Argv construction, WSL path translation, escaping, safety guards. |
| `image-validation.ts` | Filename/size/structure/already-patched/version rules. |
| `usb.ts` | Parse enumerated disks; **all flash-safety gating**. |
| `flash-math.ts` | Sector alignment, speed meter, ETA. |
| `format.ts` | Human-readable bytes/speed/eta/duration/percent. |
| `build-progress.ts` | Map upstream log lines → progress fraction + label. |
| `ipc-contract.ts` | Channel names + the `Api` surface + `AppSnapshot`. |

## Main process

- **`orchestrator.ts`** owns the `WorkflowState` and drives the whole pipeline
  (`checkEnvironment → setImage → startBuild → scanUsb → selectUsb → startFlash`).
  Every state change goes through `assertTransition`; illegal transitions throw.
  It emits `AppSnapshot`, `LogEntry`, `BuildProgress` and `FlashProgress`.
- **Services** are thin and single-purpose; they do I/O only, delegating all
  decisions to `src/shared`.
- **`process-runner.ts`** is the only place a child process is spawned —
  `shell:false`, argv arrays, streamed + bounded output, `AbortSignal`
  cancellation, exit-code + duration capture.

## The build pipeline (states)

```
CHECKING_ENVIRONMENT → SELECTING_IMAGE → VALIDATING_IMAGE
  → PREPARING_WORKSPACE (copy drvfs→ext4)   → PREPARING_WSL (probe caps)
  → INSPECTING_STEAMOS (ro loop-mount)       → RESOLVING_KERNEL
  → RESOLVING_NVIDIA_PACKAGES → PATCHING_IMAGE (vendored .sh) → VALIDATING_PATCH
  → SCANNING_USB → USB_SELECTED → AWAITING_FLASH_CONFIRMATION
  → FLASHING_USB → VERIFYING_USB → COMPLETED
```

`FAILED` / `CANCELLED` are reachable from every working state; the flash service
reports whether a mid-write cancel left the USB in a partial state.

## Why WSL2 + a dedicated Arch distro

The upstream script uses `pacman`/`readelf` **on the host** and needs loop
devices, btrfs and overlayfs as root. That mandates an Arch-ish host. On Windows
the app provisions and controls its own Arch distro
(`SteamOS-NVIDIA-Builder`) so it never mutates the user's other distros. The
image is copied into the distro's ext4 first because loop-mounting a file on the
Windows `drvfs` mount is unreliable (see REPO_ANALYSIS §4, risk R4).

## Why flashing is Windows-native

The USB is owned by Windows. Rather than route it into WSL (usbipd, fragile),
the app enumerates physical disks via PowerShell, takes the target offline
(dismounting volumes), writes raw to `\\.\PhysicalDriveN` in sector-aligned
chunks, `fsync`s, and reads the region back to verify. This is the one stage
with no upstream equivalent (see TESTING.md for its validation status).

## Build tooling

`electron-vite` (Vite + Rollup) builds `main` / `preload` / `renderer`.
TypeScript strict everywhere (`tsconfig.node.json`, `tsconfig.web.json`).
`vitest` for unit tests, `eslint` (flat config, typescript-eslint) for linting,
`electron-builder` (NSIS, `requireAdministrator`) for packaging.
