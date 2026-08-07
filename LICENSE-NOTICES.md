# LICENSE-NOTICES.md

## This application

Licensed under the **MIT License** — see [LICENSE](LICENSE).

## Non-affiliation & trademarks

This is an independent, non-commercial project. It is **not** affiliated with,
authorised by, sponsored by, or endorsed by **Valve Corporation** or **NVIDIA
Corporation**. "Steam", "Steam Deck" and "SteamOS" are trademarks of Valve
Corporation; "NVIDIA" and "RTX" are trademarks of NVIDIA Corporation. They are
used here only nominatively, to describe what the software does.

**No Valve or NVIDIA software is redistributed by this project.** The
application operates on:
- a **SteamOS recovery image you download yourself** from Valve, and
- **NVIDIA driver packages downloaded at build time** by the upstream script
  from Arch Linux infrastructure over HTTPS (pinned to permanent
  `archive.archlinux.org` URLs), compiled on your own machine.

The NVIDIA proprietary/open driver components remain under **NVIDIA's own
license**; you obtain and use them on your own hardware, at your own risk. The
SteamOS image remains **Valve's**, governed by Valve's terms.

## Vendored upstream workflow

`resources/steamos-nvidia-installer.sh` is a **verbatim, unmodified** copy of the
core script from
[`28allday/steamos-nvidia-installer`](https://github.com/28allday/steamos-nvidia-installer),
used under its MIT license (Copyright © 2026 28allday). Its original license text
is preserved at `resources/UPSTREAM-LICENSE`.

- Vendored file: `resources/steamos-nvidia-installer.sh`
- SHA-256: `bf3a439b852a74b92464674caa8d767b698a6130b2ab94d57e5fe58846538431`

Re-verify at any time:

```bash
sha256sum resources/steamos-nvidia-installer.sh
```

The upstream MIT permission notice (reproduced from `resources/UPSTREAM-LICENSE`)
applies to that file. This project adds a Windows GUI, environment orchestration,
image validation, USB safety, flashing and verification around it, but does not
alter the upstream patching logic.

## Third-party runtime & build dependencies

Managed via npm; each retains its own license (predominantly MIT). Principal
components:

| Component | License |
|---|---|
| Electron | MIT |
| React / React-DOM | MIT |
| framer-motion | MIT |
| zustand | MIT |
| Vite / electron-vite | MIT |
| TypeScript | Apache-2.0 |
| Vitest, ESLint, typescript-eslint | MIT |
| electron-builder | MIT |

Full dependency license texts are available in `node_modules/*/LICENSE` after
`npm install`, and via `npm ls` / your preferred license-report tool.

## Disclaimer

Provided "AS IS", without warranty of any kind. Writing raw images to disks is
inherently risky; you are responsible for selecting the correct target device.
See [SECURITY.md](SECURITY.md) and [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
