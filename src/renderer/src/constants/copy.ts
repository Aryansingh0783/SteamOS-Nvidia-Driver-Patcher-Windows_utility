/**
 * All user-facing copy in one place (constants layer) so wording can change
 * without touching components.
 */
export const APP = {
  name: 'SteamOS NVIDIA USB Installer',
  tagline: 'Real SteamOS on RTX hardware',
  version: '0.1.6',
  headline: 'Build a bootable SteamOS USB with NVIDIA drivers',
  sub: 'Turns an official SteamOS recovery image into a one-click USB installer with the NVIDIA open (RTX) driver baked in. The original image is never modified.',
};

export const DISCLAIMER =
  'Independent hobby tooling — not affiliated with, authorised by, or endorsed by Valve or NVIDIA. ' +
  'Redistributes nothing from Valve or NVIDIA: it operates on images and packages you supply/download, on your own hardware, at your own risk.';

export const FLASH_WARNING =
  'Flashing permanently ERASES the entire target USB. Every partition and file on it will be destroyed. ' +
  'This cannot be undone.';

export const DOC_LINKS = {
  wsl: 'https://learn.microsoft.com/windows/wsl/install',
  steamosImage: 'https://help.steampowered.com/en/faqs/view/65B4-2AA3-5F37-4227',
  upstream: 'https://github.com/28allday/steamos-nvidia-installer',
};
