# TROUBLESHOOTING.md

## Before you start — what will be destroyed

- **Building** never touches your input image and never touches your Windows
  disks. It works on a copy inside the app's WSL distro.
- **Flashing** permanently **erases the entire selected USB** — every partition
  and file on it. This cannot be undone. Nothing else on your PC is affected.
- Installing SteamOS from the booted USB will erase the **target machine's**
  chosen disk (full install) or reimage only the OS partitions (upgrade mode).

## Target-machine requirements

- **UEFI** firmware, booting the USB from the UEFI boot menu.
- **Secure Boot must be OFF** — the NVIDIA kernel module is unsigned; Secure Boot
  will block it. Disable it in your BIOS/UEFI setup before installing.
- **USB ≥ 16 GB.** The patched image is ~8 GB; 16 GB leaves headroom.
- An **RTX 20-series or newer** GPU (see the support matrix in the README).
  Desktops with a single RTX card are the clean path; hybrid laptops may fail.

## Environment panel is *Blocked*

- **WSL2 not installed** → run `wsl --install` in an elevated PowerShell, reboot,
  re-check. Click *Install WSL2* in the app for Microsoft's guide.
- **Builder distro not set up** → the app needs an Arch distro named
  `SteamOS-NVIDIA-Builder` (it uses `pacman`/`readelf` on the host).
  - **Easiest:** click **"Set up builder distro (beta)"** in the Environment
    panel. It installs the official Arch WSL distribution and re-imports it under
    the dedicated name, then installs the tools. This is best-effort and streams
    to the log; if it fails, use the manual steps below.
  - **Manual:** in an elevated PowerShell:
    ```powershell
    wsl --install -d archlinux --no-launch
    wsl --export archlinux "$env:TEMP\arch.tar"
    wsl --import SteamOS-NVIDIA-Builder "$env:USERPROFILE\wsl\steamos-builder" "$env:TEMP\arch.tar"
    wsl --unregister archlinux   # optional
    wsl -d SteamOS-NVIDIA-Builder -u root -- bash -lc "pacman -Syu --noconfirm --needed btrfs-progs rsync curl kmod zstd python binutils util-linux"
    ```
    The app never modifies your other distros.
- **WSL default version not 2** → `wsl --set-default-version 2`.
- **Low disk space** → free space to ~20 GB, or move/grow the WSL virtual disk.

## Build fails

- **"This WSL kernel lacks: loop partition scanning / overlayfs / btrfs"** — some
  WSL2 kernels lack loop `max_part` or filesystem support. Update WSL
  (`wsl --update`), and ensure the builder distro can `modprobe btrfs`. This is
  the pre-flight guard doing its job before wasting 20 minutes.
- **"No repair_device.sh in image home"** — the `.img` you fed it isn't the OOBE
  *repair* image. Re-download the **recovery** image from Valve.
- **pacman signature / keyring errors** — the frozen image's keyring can differ
  from current Arch packagers. Enable **Skip pacman sig check** in Options
  (packages still come over HTTPS from Arch infrastructure) and rebuild.
- **glibc drift** — if the build stops with "payload needs glibc X but the image
  only has Y", current Arch has moved past the frozen image. Pin an older branch
  with the **Driver spec** field (e.g. `580`) and rebuild.
- **Download failures** — transient mirror issues; retry. The build caches
  packages, so reruns are fast.

## Flashing

- **Flash button stays disabled** — you must have a built image, a selected
  *eligible* removable USB, a **recent** re-scan (click Refresh), and you must
  complete the confirmation. Internal/system disks are intentionally
  unselectable.
- **"Target disk changed identity"** — the app detected the USB is not the one
  you confirmed (different model/size/serial). Re-scan and re-confirm.
- **Write-protected / busy** — remove the physical lock; close anything using the
  drive; try another port. Offlining the disk requires Administrator.
- **Cancelled mid-write** — the USB is now partially written and **not bootable**.
  Re-flash it before use.
- **Verification failed** — the read-back didn't match. The write was interrupted
  or the media is faulty; try another USB.

## After install

- **Black screen on first boot** — power-cycle once; SteamOS hides its boot
  console (tty4–6), so a working boot can look black briefly. If it persists,
  `Ctrl+Alt+F3`, log in as `deck`, run `steamos-session-select plasma`.
- **OS updates** — with the default self-healing mode, updating from within Steam
  rebuilds the driver for the new OS (adds 10–20 min); a failed rebuild cancels
  the update and keeps the working system.
- **Security** — the installed system ships passwordless-sudo for `deck` (the
  installer needs it). After setting a password (`passwd`), remove it:
  `sudo rm /etc/sudoers.d/zz-deck-nopasswd`.

## Recovering from a failed run

- The app keeps intermediate artifacts (the in-distro copy, the build cache, the
  patched image on Windows) until you start over, so you can inspect the log and
  retry cheaply.
- A full **Start over** resets the workflow. The WSL build cache
  (`~/.steamos-nvidia-work` inside the distro) can be deleted to reclaim space.
- Per-session logs are written under the app's `userData\logs` folder.
