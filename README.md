# SteamOS NVIDIA USB Installer (Windows)

A **Windows desktop application** that turns an official **SteamOS recovery
image** into a bootable **USB installer with the NVIDIA (RTX) open driver baked
in** — then safely flashes it to a USB drive.

It is a graphical front-end and orchestrator around the proven upstream project
[`28allday/steamos-nvidia-installer`](https://github.com/28allday/steamos-nvidia-installer):
the actual patching workflow is run **unmodified** inside a controlled WSL2
Linux environment, and a native Windows layer adds environment setup, image
validation, safe USB selection, raw flashing, and verification.

> **Independent, non-commercial project. Not affiliated with, authorised by, or
> endorsed by Valve or NVIDIA.** "Steam", "Steam Deck" and "SteamOS" are Valve
> trademarks; "NVIDIA" and "RTX" are NVIDIA trademarks — used here only to
> describe what the software does. Nothing from Valve or NVIDIA is
> redistributed. See [LICENSE-NOTICES.md](LICENSE-NOTICES.md).

<p align="center"><em>Warm-dark, gaming-oriented HUD. One easing curve, one timing family.</em></p>

---

## What it does

1. You supply the official SteamOS recovery `.img` (downloaded from Valve).
2. The app validates it (filename, size, then structure inside WSL).
3. It copies the image into an app-owned Arch WSL2 distro (the original is never
   modified) and runs the upstream script, which:
   - resolves + pins the NVIDIA `nvidia-open` driver from Arch,
   - verifies glibc compatibility with the frozen image,
   - **compiles the kernel module against the image's exact kernel** in a
     throwaway overlay chroot,
   - installs the driver, blacklists nouveau, wires the bootloader cmdline,
   - adds self-healing OS updates and a one-click desktop installer.
4. The patched image is copied back to Windows.
5. You pick a **removable USB** (the system disk can never be selected), confirm
   the exact drive, and the app flashes it raw and **verifies** the write.
6. Boot the USB on an RTX machine and install SteamOS.

See [REPO_ANALYSIS.md](REPO_ANALYSIS.md) for the full traced upstream workflow
and the design rationale, and [ARCHITECTURE.md](ARCHITECTURE.md) for how the app
is put together.

## Supported hardware (read this — we do not claim "all NVIDIA GPUs")

The driver installed is **`nvidia-open`**, which supports **Turing and newer only**:

| GPU | Status |
|---|---|
| RTX 50 / 40 / 30 / 20-series, TITAN RTX | ✅ Supported |
| GTX 16-series (Turing) | ⚠️ Turing-class, works with the open modules, but **untested upstream** |
| GTX 10-series & older, all pre-RTX (Pascal/Maxwell) | ❌ **Not supported** |

Target machine also needs: **UEFI boot with Secure Boot OFF**. Desktops with a
single RTX card are the tested path; **hybrid-graphics laptops (iGPU + RTX) may
not work**. Upstream was verified on an RTX 5060 Ti with driver 610.43.03 on
SteamOS 3.8.10–3.8.14.

## Requirements

- **Windows 10/11 (x64)** with **WSL2** enabled.
- An **Arch builder distro** the app manages (`SteamOS-NVIDIA-Builder`). It is
  isolated — the app never touches your other WSL distros.
- **~20 GB free disk** (image copy + build cache).
- **Administrator** rights (only for the USB flash step; the app requests
  elevation and explains why).
- A **USB drive ≥ 16 GB**.
- Network access from WSL to `archive.archlinux.org`, the Arch mirror, and
  Valve's package mirror.

## Getting the SteamOS image

Download the recovery image from Valve and **decompress** it to a raw `.img`:

- <https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227>
- `bunzip2 steamdeck-*.img.bz2` (or extract with 7-Zip).

The app requires the decompressed **OOBE *repair*** image (it contains the
`repair_device.sh` the one-click installer builds on).

## Install / run (developers)

```bash
npm install
npm run dev        # launch the app (electron-vite dev)
npm run verify     # typecheck (strict) + lint + unit tests + build
npm run package:win  # produce a Windows installer (electron-builder, NSIS)
```

## Status — what is verified, and what is not

This repository is honest about its test coverage (see [TESTING.md](TESTING.md)):

- ✅ **Verified in CI/dev:** the vendored upstream script is byte-identical to
  source; all decision logic (state machine, driver-spec parsing, GPU
  compatibility, command/argument escaping, image-validation rules, USB
  enumeration parsing, safety guards, flash math, formatters) is **unit-tested
  (113 tests)**; the project **type-checks strictly**, **lints clean**, and
  **builds**.
- ⚠️ **Not yet validated on real hardware:** a full end-to-end **WSL2 build**
  (needs a Windows host with WSL2 + Arch + network + a genuine Valve recovery
  image) and a **USB flash on a physical drive**. These paths are implemented
  for real — **no simulated progress or fake success** — but have not been run
  against hardware in this environment. Treat them as beta until you have
  validated on your own spare USB.

## Data safety

Flashing **permanently erases the entire target USB**. The app enforces
multiple safeguards (system-disk exclusion, removable-only, capacity checks,
freshness re-scan, identity re-verification, explicit multi-factor confirmation).
Read [SECURITY.md](SECURITY.md) and [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## License

MIT — see [LICENSE](LICENSE) and [LICENSE-NOTICES.md](LICENSE-NOTICES.md).
