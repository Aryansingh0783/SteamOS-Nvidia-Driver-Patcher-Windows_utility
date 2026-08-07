# REPO_ANALYSIS.md — Upstream workflow, dependencies, risks, decisions

> Mandatory first-phase deliverable. This document is the result of cloning and
> reading the **entire** upstream project
> [`28allday/steamos-nvidia-installer`](https://github.com/28allday/steamos-nvidia-installer)
> commit-for-commit, tracing the full image→USB workflow, and recording every
> assumption and risk **before** any application code was written.
>
> The upstream logic is treated as the **source of truth**. This Windows
> application orchestrates that logic; it does **not** reimplement or "simplify"
> the patching pipeline.

---

## 1. What the upstream project is

A single, self-contained **Bash script** — `steamos-nvidia-installer.sh`
(1008 lines) — plus `README.md` and an MIT `LICENSE` with a non-affiliation
notice. There is no build system, no packages, no binaries. It is Linux-only and
run as `sudo ./steamos-nvidia-installer.sh <clean-recovery.img>`.

Its job: take Valve's **official SteamOS recovery image** (which ships AMD
drivers only) and produce `…-nvidia-usbinstall.img`, a bootable USB installer
with the **NVIDIA open kernel driver** baked in, plus a one-click desktop
installer and self-healing OS updates. **Nothing from Valve or NVIDIA is
redistributed** — everything is downloaded and built on the user's own machine
from the image they supply.

```
steamos-nvidia-installer/
├── .gitignore                     # ignores *.img, build caches, dev notes
├── LICENSE                        # MIT + non-affiliation notice, © 2026 28allday
├── README.md                      # user-facing instructions
└── steamos-nvidia-installer.sh    # the entire implementation (1008 lines)
```

Vendored verbatim into this app at `resources/steamos-nvidia-installer.sh` and
executed unmodified. See `LICENSE-NOTICES.md`.

---

## 2. The full workflow, traced from the script

Line numbers reference the upstream script as vendored.

| # | Stage | Upstream lines | What happens |
|---|-------|----------------|--------------|
| 0 | **Arg parse** | 90–104 | `--driver SPEC`, `--hold-updates`, `--no-hold-updates`, `--no-installer`, `--trim-cuda`, `--skip-sigcheck`, `--workdir DIR`, positional `<img>`. |
| 1 | **Preconditions** | 106–129 | Must be **root**. `--driver` must be `latest` or a version prefix (`^[0-9]+(\.[0-9]+)*(-[0-9]+)?$`). Auto-detects a single `*.img` (excluding `*-nvidia*.img`) if no image given. Host tools required: `losetup blkid btrfs rsync curl depmod sed awk tar zstd pacman python3 readelf`. Refuses an already-patched (`*-nvidia*.img`) input. Output = `<img>-nvidia-usbinstall.img`. |
| 2 | **Workspace + guards** | 131–178 | Creates `.nvidia-usb-work/{mnt,efi,home,upper,ovlwork,merged}`. Installs a temporary udev rule so udisks does **not** auto-mount the loop partitions mid-build. Registers an EXIT `cleanup` trap that unmounts everything and detaches the loop device. |
| 3 | **Copy image** | 180–183 | `cp --reflink=auto "$IMG" "$OUT"` — **the original is never touched**; all work happens on the copy. |
| 4 | **Loop-mount** | 184–211 | `losetup -f --show -P` then finds partitions by GPT name via `blkid -p PART_ENTRY_NAME`: `rootfs-A`, `efi-A`, `home`. Refuses if any is missing ("is this a SteamOS image?"). Guards against a duplicate of the same rootfs UUID already being mounted. Mounts rootfs with `compress-force=zstd:3`; clears the btrfs read-only property. |
| 5 | **Discover image details** | 213–243 | Finds the `*neptune*` kernel module dir → `KVER`. Finds the installed kernel package in the image's Holo pacman DB (`/usr/lib/holo/pacmandb/local`). Derives the **exact-match kernel-headers URL** from the image's `jupiter-*` repo + mirrorlist, and verifies it exists (`curl -sfIL`). |
| 6 | **Resolve NVIDIA packages** | 245–349 | Driver set comes from **Arch**, not Valve's frozen mirror (which pins an old 575.x). `pin_pkg` resolves `nvidia-utils` (`latest` via `archlinux.org` JSON API → `archive.archlinux.org` permanent URL, mirror fallback; or a **version prefix** by scraping the archive directory listing and taking the newest match `sort -uV | tail -1`). Then pins `nvidia-open-dkms` + `lib32-nvidia-utils` with a **version-skew guard**. Then pins Arch-only support deps (`egl-wayland2`, only a dep from branch 590+) *iff* `nvidia-utils`'s own `.PKGINFO` lists them. Downloads with `.part`→atomic-rename and caches. |
| 7 | **glibc compatibility gate** | 351–376 | Determines the image's glibc (frozen SteamOS 3.8 = **2.41**; current Arch = 2.43). Extracts every downloaded package, runs `readelf -V`, finds the **max `GLIBC_x.y`** symbol version required by any ELF, and **refuses to build** if the payload needs a newer glibc than the image ships. This is the core safety invariant that makes mixing Arch userspace into a frozen image safe. |
| 8 | **Overlay build chroot** | 378–453 | Clears a cached overlay if it was built for a *different* driver version (keeps the package cache). Mounts an **overlayfs** (`lowerdir`=image rootfs, `upperdir`=cached build residue) so the toolchain/headers **never enter the image**. Binds `proc/sys/dev`, restores `resolv.conf`. Initialises the pacman keyring. **Resume**: if the overlay already has a built `nvidia.ko` for `KVER` at the pinned version, skip rebuild. Otherwise: download headers, `pacman -Sy`, install headers + `dkms` from Valve's mirror, install the pinned Arch driver packages (**DKMS compiles `nvidia.ko` against the image's exact kernel**), force `dkms autoinstall` if the hook didn't fire, and verify `nvidia.ko` exists. |
| 9 | **Compute payload** | 455–494 | Diffs the image's own pacman DB (`before`, read host-side to avoid overlay contamination) against the chroot DB (`after`); strips a **build-only** regex (`dkms`, `nvidia-open-dkms`, `gcc`, `make`, `binutils`, `*-headers`, …). The remainder = the packages that ship. Builds the file list via `pacman -Qlq`; optional `--trim-cuda` drops CUDA/OpenCL/OptiX (~350 MB). Verifies rootfs free space (accounts for btrfs zstd roughly halving it). |
| 10 | **Install into rootfs** | 496–523 | `rsync` the payload files merged→rootfs; `rsync` the compiled modules; copy the payload packages' pacman DB entries so metadata stays consistent; run `depmod $KVER` + `ldconfig` **inside the image**; write `/etc/modprobe.d/99-nvidia-patch.conf` (`blacklist nouveau`, `nvidia-drm modeset=1 fbdev=1`, `NVreg_PreserveVideoMemoryAllocations=1`); enable `nvidia-suspend/resume/hibernate`. |
| 11 | **Update strategy** | 525–816 | Masks the OOBE day-1 auto-migration except in `stock` mode. **`hold`**: mask `atomupd`, stub `steamos-update*` CLIs to exit 7 ("up to date"). **`selfheal` (default)**: write `driver.conf` (the pinned package URLs), embed **`repatch.sh`** (an on-device tool that rebuilds the driver into the *other* A/B slot after an OS update, in its own loopback-ext4 overlay chroot, fails safe by editing the ESP `*.conf` boot files), and wrap `steamos-update` so a real update is followed by a repatch of the freshly staged slot — a failed repatch **cancels the update** and keeps the working system booting. |
| 12 | **Kernel cmdline** | 818–830 | Appends `rd.driver.blacklist=nouveau modprobe.blacklist=nouveau nvidia-drm.modeset=1 nvidia-drm.fbdev=1` to **both** the ESP `grub.cfg` and `/etc/default/grub` (the latter is what the installed system's regenerated grub uses). No initramfs regeneration needed — `rd.driver.blacklist` stops the bundled nouveau from loading. |
| 13 | **One-click installer** | 832–956 | Patches Valve's own `repair_device.sh` for generic hardware (target-disk override `STEAMOS_TARGET_DISK`, `/dev/sdX` partition-suffix autodetect, skip NVMe-sanitize on non-NVMe). Adds a **zenity disk-picker** wrapper (`install_to_hd.sh`, `all`=wipe / `system`=upgrade-keep-data), two desktop icons, and a NOPASSWD sudoers drop-in for `deck`. |
| 14 | **Sanity checks + finalize** | 958–1008 | Asserts `nvidia.ko` present, modprobe conf, the selfheal wrapper/orig/repatch/driver.conf, GSP firmware, Vulkan ICD. **Flushes all writes** (`btrfs filesystem sync`, `sync -f`) **before** flipping the subvolume read-only (flipping with queued delalloc data can silently produce 0-byte files — an explicit upstream lesson). Restores btrfs `ro`, unmounts, prints a summary. |

Flashing itself is **out of scope upstream** — the README simply says
`sudo dd if=…-nvidia-usbinstall.img of=/dev/sdX bs=4M conv=fsync`.

---

## 3. Extracted facts (the port must honor these)

**Input image**
- A **clean SteamOS OOBE *recovery/repair* image** (`.img`), decompressed from Valve's `.img.bz2`. Not the compressed archive, not an already-patched image.
- Must contain GPT partitions named `rootfs-A` (btrfs), `efi-A` (FAT), `home` (ext4), a `*neptune*` kernel, a Holo pacman DB, and (for the one-click installer) `/home/deck/tools/repair_device.sh`.
- Tested upstream on **SteamOS 3.8.10–3.8.14**, glibc 2.41.

**Output**
- `<name>-nvidia-usbinstall.img`, ~8 GB (same size as the recovery image). USB target **≥16 GB**.

**Driver / hardware**
- Driver = **`nvidia-open`** (open kernel modules). Supports **Turing / RTX 20-series and newer only**. Pre-Turing (GTX 16xx and older, all pre-RTX) is **not supported on any branch**.
- Default driver = current Arch `nvidia-open`; `--driver` pins a branch/release/build from the Arch archive. Companion packages (`nvidia-open-dkms`, `lib32-nvidia-utils`) must match `nvidia-utils` exactly.
- Verified upstream with an **RTX 5060 Ti** on driver **610.43.03**.

**Target machine**
- **UEFI boot, Secure Boot OFF.** Hybrid-graphics laptops (iGPU + RTX) are unreliable; desktop single-RTX is the clean path.

**Host build environment (this is the hard constraint for the Windows port)**
- **Arch-ish Linux, run as root.** The script uses `pacman` **on the host** (line 120 tool check; line 458 `pacman -Qq --dbpath` on the image DB), plus `losetup`, `btrfs`, `overlayfs`, `rsync`, `curl`, `depmod`/`kmod`, `zstd`, `python3`, `readelf`. It needs **loop devices with partition scanning**, **btrfs**, **overlayfs**, real **mount namespaces**, and **outbound HTTPS** to `archive.archlinux.org`, `geo.mirror.pkgbuild.com`, `archlinux.org`, and Valve's jupiter mirror.
- Build workspace ~3 GB cache + ~8 GB output copy → **~20 GB free** recommended. Build time **10–20 min**.

---

## 4. Platform strategy — how the Windows app runs this

The script is Linux-only and Arch-specific. On Windows the only realistic,
non-reimplementing path is a **controlled WSL2 Linux environment**:

1. **Detect WSL2** (`wsl.exe --status`, kernel version, WSL2 default).
2. **Provision a dedicated Arch distro** the app owns — imported from an Arch
   bootstrap tarball as e.g. `SteamOS-NVIDIA-Builder` — so the user's other WSL
   distros are **never touched**. `pacman` on the host is a hard requirement, so
   an Ubuntu default distro cannot be used; a dedicated Arch distro is the
   correct, minimal, isolated choice.
3. **Verify capacity/memory/network** inside that distro before building.
4. **Run the vendored script unmodified**, inside the distro's own ext4 disk
   (not the slow/feature-limited `/mnt/c` 9p mount), translating/copying the
   user-selected Windows image in.
5. **Stream** stdout/stderr/exit-code/duration back to the GUI.

Flashing is added on the **Windows side** (the OS that owns the USB): enumerate
physical removable disks, dismount/offline volumes, raw-write to
`\\.\PhysicalDriveN`, then read-back verify. This is the one piece with **no
upstream equivalent** and therefore the piece that most needs real-hardware
validation (see §6).

---

## 5. Design decisions

1. **Vendor the upstream `.sh` verbatim; never reimplement patching.** All
   DKMS/overlay/pacman/btrfs logic stays in Bash, run inside WSL. The app is an
   orchestrator + validator + flasher + UI, not a rewrite. (Prompt requirement:
   "treat the repository's working logic as the source of truth".)
2. **Electron + TypeScript (strict) + React.** Best fit for the requested
   premium-motion UI, with Node in the main process for `wsl.exe`/PowerShell
   orchestration. Secure boundary: `contextIsolation:true`, `nodeIntegration:false`,
   `sandbox`, a typed `contextBridge` preload, strict CSP. The renderer gets **no**
   direct Node/FS/child_process.
3. **Explicit workflow state machine** (`INITIALIZING`→…→`COMPLETED/FAILED/CANCELLED`)
   with a validated transition table; invalid transitions throw.
4. **Command execution via argv arrays only.** No user string is ever
   interpolated into a shell line. Windows paths are translated to WSL paths
   through a validated function; every argument is length/character-checked.
5. **The original image is never modified**, mirroring upstream — the app only
   ever reads the user's `.img`; the copy + patch happen on the WSL side.
6. **Windows-side flashing** with mandatory multi-factor confirmation, system-disk
   exclusion, and readback verification.
7. **Honest capability disclosure** in the UI and docs: RTX-Turing-and-newer only,
   Secure Boot off, what is verified vs. what needs real hardware.

---

## 6. Technical-risk register

Severity: 🔴 high / 🟠 medium / 🟡 low.

| # | Risk | Sev | Mitigation in this app |
|---|------|-----|------------------------|
| R1 | **Loop-device partition scanning in WSL2.** `losetup -P` needs the `loop` module with `max_part` and kernel partition scanning; some WSL2 kernels lag. | 🔴 | Environment pre-flight probes loop + partition support and reports a clear blocker instead of failing mid-build. Documented in TROUBLESHOOTING. |
| R2 | **btrfs / overlayfs / mount-ns in WSL2.** Needed for the compress-force mount, the overlay chroot, and `btrfs property set`. | 🟠 | Pre-flight checks `btrfs`, `mount -t overlay`, and namespace availability; the vendored script already `die()`s cleanly on missing capability. |
| R3 | **Arch host requirement.** `pacman`/`readelf` on the host mean Ubuntu-default WSL cannot run this. | 🔴 | App provisions a **dedicated Arch distro** it owns; never mutates other distros. If provisioning is declined, the build step is blocked with an explanation — not mocked. |
| R4 | **WSL vhdx disk growth (~20 GB).** Build copy + cache can exceed a small vhdx. | 🟠 | Pre-flight free-space check inside the distro **and** on the Windows drive holding the vhdx; surfaced in the UI before build. |
| R5 | **Windows raw USB write is unverifiable in CI/this container.** No Windows, no USB here. | 🔴 | Flasher is implemented with a real, documented method (dismount → offline → write `\\.\PhysicalDriveN` → verify), **unit-tested against mocked device I/O**, and **explicitly labelled "not validated on physical hardware"** in TESTING.md and the UI. No fake progress or simulated success in the production path. |
| R6 | **System-disk / wrong-drive destruction.** | 🔴 | Enumerate physical disks (not letters); exclude the disk hosting Windows/the system volume; removable/USB bus filter; require model+size+serial+path match and an explicit typed/checkbox confirm; re-scan invalidates a stale selection; second confirm for very large or mounted disks. |
| R7 | **pacman signature mismatch** (frozen image keyring vs current Arch packagers). | 🟠 | Surface `--skip-sigcheck` as an explicit, explained opt-in (packages come over HTTPS from Arch infra); default keeps checks on. |
| R8 | **glibc drift** eventually exceeds the frozen image (upstream's own gate). | 🟠 | We do not bypass the gate; if the vendored script `die()`s on glibc, the app reports it verbatim and suggests pinning an older `--driver`. |
| R9 | **Network dependency** on Arch archive/mirror + Valve mirror. | 🟡 | Retries with backoff on downloads; clear per-URL error surfacing; the script already caches to make reruns cheap. |
| R10 | **Elevation/UAC.** WSL build needs root (fine inside our distro); Windows flashing needs Administrator. | 🟠 | Elevation requested only for the flash step, with a plain-language reason; UAC cancellation handled gracefully (no partial writes). |
| R11 | **Already-patched or non-recovery image.** | 🟡 | Front-end validation replicates upstream's `*-nvidia*.img` refusal and the `repair_device.sh`/partition-name checks before spending 20 min. |
| R12 | **Hybrid-graphics laptops.** iGPU may own the boot display. | 🟡 | UI states desktop single-RTX is the supported path; laptops flagged "results vary". |

---

## 7. What "done" means for the port (honesty statement)

- **Verified in this environment:** the vendored upstream script is byte-identical
  to source; all shared decision logic (state machine, driver-spec parsing, GPU
  compatibility, command/argument construction & escaping, image-validation
  rules, USB enumeration parsing, safety guards, formatters) is **unit-tested and
  passing**; the project **type-checks (strict)** and **lints** clean; the
  renderer **builds**.
- **Not verifiable here, disclosed as such:** a real end-to-end **WSL2 build**
  (needs a Windows host with WSL2 + Arch + network + a genuine Valve recovery
  image) and a real **USB flash on physical hardware**. These paths are
  implemented for real (no simulation) but are labelled unvalidated in
  `TESTING.md`, and the app never reports fake success for them.
</content>
</invoke>
