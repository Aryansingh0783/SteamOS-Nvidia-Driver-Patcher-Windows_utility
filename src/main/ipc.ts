/**
 * IPC wiring. Maps the typed {@link Api} channels to orchestrator methods and
 * forwards orchestrator events to the renderer. This is the only place the main
 * process trusts input from the renderer, so every payload is treated as
 * untrusted and validated by the services it reaches.
 */
import { ipcMain, dialog, shell, type BrowserWindow } from 'electron';
import { stat } from 'node:fs/promises';
import { IpcChannels, EventChannels } from '@shared/ipc-contract.js';
import type { SelectedImage, StartBuildInput } from '@shared/ipc-contract.js';
import type { BuildOptions, DiskDevice, FlashRequest } from '@shared/types.js';
import type { Orchestrator } from './orchestrator.js';

const WSL_DOCS_URL = 'https://learn.microsoft.com/windows/wsl/install';

export function registerIpc(orchestrator: Orchestrator, getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  // Forward orchestrator events to the renderer.
  orchestrator.subscribeState((snap) => send(EventChannels.state, snap));
  orchestrator.subscribeLog((entry) => send(EventChannels.log, entry));
  orchestrator.subscribeBuildProgress((p) => send(EventChannels.buildProgress, p));
  orchestrator.subscribeFlashProgress((p) => send(EventChannels.flashProgress, p));

  ipcMain.handle(IpcChannels.checkEnvironment, () => orchestrator.checkEnvironment());

  ipcMain.handle(IpcChannels.openWslDocs, async () => {
    await shell.openExternal(WSL_DOCS_URL);
  });

  ipcMain.handle(IpcChannels.selectImage, async (): Promise<SelectedImage | null> => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      title: 'Select the SteamOS recovery image (.img)',
      properties: ['openFile'],
      filters: [
        { name: 'SteamOS recovery image', extensions: ['img'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const path = result.filePaths[0];
    const s = await stat(path);
    const selected: SelectedImage = { path, sizeBytes: s.size };
    orchestrator.setImage(selected);
    return selected;
  });

  ipcMain.handle(IpcChannels.setOptions, (_e, options: BuildOptions) => {
    orchestrator.setOptions(options);
  });

  ipcMain.handle(IpcChannels.startBuild, async (_e, input: StartBuildInput) => {
    const s = await stat(input.imagePath);
    // Fire-and-forget: progress + terminal state flow through events.
    void orchestrator.startBuild(input.options, input.imagePath, s.size);
  });

  ipcMain.handle(IpcChannels.cancelBuild, () => orchestrator.cancelBuild());

  ipcMain.handle(IpcChannels.scanUsb, (): Promise<DiskDevice[]> => orchestrator.scanUsb());

  ipcMain.handle(IpcChannels.selectUsb, (_e, device: DiskDevice) => {
    orchestrator.selectUsb(device);
  });

  ipcMain.handle(IpcChannels.startFlash, (_e, request: FlashRequest) => {
    void orchestrator.startFlash(request);
  });

  ipcMain.handle(IpcChannels.cancelFlash, () => orchestrator.cancelFlash());

  ipcMain.handle(IpcChannels.resetWorkflow, () => orchestrator.reset());

  ipcMain.handle(IpcChannels.getSnapshot, () => orchestrator.getSnapshot());
}
