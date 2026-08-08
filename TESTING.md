# TESTING.md

This project is explicit about **what has been verified and what has not**. It
does not fake progress, success, or hardware validation.

## Test categories

| Category | Status | How |
|---|---|---|
| Unit — image validation | ✅ automated | `tests/image-validation.test.ts` |
| Unit — workflow state transitions | ✅ automated | `tests/workflow.test.ts` |
| Unit — command construction & argument escaping | ✅ automated | `tests/command.test.ts` |
| Unit — GPU compatibility detection | ✅ automated | `tests/gpu-compat.test.ts` |
| Unit — driver/version spec matching | ✅ automated | `tests/driver-spec.test.ts` |
| USB enumeration (mocked device JSON) | ✅ automated | `tests/usb.test.ts` |
| Protection: system disk cannot be selected | ✅ automated | `tests/usb.test.ts` |
| Insufficient disk space / too-small USB | ✅ automated | `tests/usb.test.ts`, `image-validation.test.ts` |
| Corrupted / wrong / already-patched images | ✅ automated | `tests/image-validation.test.ts` |
| Changed USB identity guard | ✅ automated | `tests/usb.test.ts` |
| Flash math (alignment, speed, ETA) | ✅ automated | `tests/flash-math.test.ts` |
| Build-log → progress parsing | ✅ automated | `tests/build-progress.test.ts` |
| WSL2 missing/unavailable handling | ⚙️ code-path present | `environment.ts` returns blockers on non-Windows / no WSL; not exercised on a real Windows host in CI |
| Cancelled build / flash | ⚙️ code-path present | AbortSignal wired through runner + services; unit-verified at the math/guard level only |
| Failed download / package install | ⚙️ handled by vendored script | upstream `die()`s are surfaced verbatim; not reproduced in CI |
| Interrupted flashing | ⚙️ code-path present | mid-write cancel reports partial state; **not run on hardware** |
| **End-to-end WSL2 build** | ❌ not validated here | needs Windows + WSL2 + Arch + network + a genuine Valve image |
| **Physical USB flash** | ❌ not validated here | needs a Windows host + a spare USB |

✅ = automated & passing. ⚙️ = real implementation, partially covered / not
end-to-end. ❌ = **not** validated in this environment — clearly disclosed.

## Running the automated tests

```bash
npm run test            # 113 unit tests (vitest)
npm run test:coverage   # coverage over src/shared
npm run typecheck       # strict tsc (main + renderer)
npm run lint            # eslint
npm run verify          # all of the above + build
```

All of the above pass in this repository. None of them require Windows, WSL, a
SteamOS image, or a USB drive — they exercise pure decision logic and mocked
device data only.

## Why the hardware paths are not auto-verified

The build and flash stages require capabilities absent from a CI/Linux
container: a Windows host, WSL2 with a provisioned Arch distro, outbound network
to Arch/Valve mirrors, a multi-GB Valve recovery image, and a physical USB
drive. The code for these paths is real (it streams actual process output and
writes actual bytes) but must be exercised on real hardware before being trusted.

## Manual test plan (real SteamOS image + spare USB)

> Use a **spare** USB you can afford to erase. This writes raw to a physical disk.

1. **Prep Windows**: enable WSL2 (`wsl --install`), reboot. Provision the Arch
   builder distro named `SteamOS-NVIDIA-Builder` (import an Arch rootfs;
   `pacman -Syu`, install `losetup btrfs-progs rsync curl kmod zstd python
   binutils`). Ensure ~20 GB free.
2. **Get the image**: download Valve's recovery image and `bunzip2` it to `.img`.
3. **Run the app** (`npm run dev` or the packaged installer, as Administrator).
4. **Environment panel** should read *Ready*. If not, follow its blockers.
5. **Select the image** — confirm it is *Accepted* and the detected kernel /
   glibc / partitions look right.
6. **Build** — expect ~10–20 min; watch the live log map to real stages.
7. Insert the spare USB, **Refresh**, confirm your USB (and *only* your USB) is
   *Eligible* and the system disk is shown but unselectable.
8. **Flash**, complete the confirmation checklist, and let **verification**
   finish.
9. **Boot** the USB on an RTX machine (UEFI, Secure Boot off) and use the
   desktop installer.

Record results (SteamOS version, kernel, driver version, GPU, pass/fail) in an
issue so the support matrix can grow with real data.
