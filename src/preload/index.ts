/**
 * Preload bridge.
 *
 * Runs in an isolated, sandboxed context and exposes exactly one object —
 * `window.api` — implementing the typed {@link Api}. The renderer never sees
 * ipcRenderer, Node, or any capability beyond these methods.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels, EventChannels } from '../shared/ipc-contract.js';
import type {
  Api,
  AppSnapshot,
  BuildProgress,
  SelectedImage,
  StartBuildInput,
} from '../shared/ipc-contract.js';
import type {
  BuildOptions,
  DiskDevice,
  EnvironmentReport,
  FlashProgress,
  FlashRequest,
  LogEntry,
} from '../shared/types.js';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: Api = {
  checkEnvironment: () => ipcRenderer.invoke(IpcChannels.checkEnvironment) as Promise<EnvironmentReport>,
  openWslDocs: () => ipcRenderer.invoke(IpcChannels.openWslDocs) as Promise<void>,
  selectImage: () => ipcRenderer.invoke(IpcChannels.selectImage) as Promise<SelectedImage | null>,
  setOptions: (options: BuildOptions) =>
    ipcRenderer.invoke(IpcChannels.setOptions, options) as Promise<void>,
  startBuild: (input: StartBuildInput) =>
    ipcRenderer.invoke(IpcChannels.startBuild, input) as Promise<void>,
  cancelBuild: () => ipcRenderer.invoke(IpcChannels.cancelBuild) as Promise<void>,
  scanUsb: () => ipcRenderer.invoke(IpcChannels.scanUsb) as Promise<DiskDevice[]>,
  selectUsb: (device: DiskDevice) => ipcRenderer.invoke(IpcChannels.selectUsb, device) as Promise<void>,
  startFlash: (request: FlashRequest) =>
    ipcRenderer.invoke(IpcChannels.startFlash, request) as Promise<void>,
  cancelFlash: () => ipcRenderer.invoke(IpcChannels.cancelFlash) as Promise<void>,
  resetWorkflow: () => ipcRenderer.invoke(IpcChannels.resetWorkflow) as Promise<void>,
  getSnapshot: () => ipcRenderer.invoke(IpcChannels.getSnapshot) as Promise<AppSnapshot>,

  onState: (cb: (snapshot: AppSnapshot) => void) => subscribe(EventChannels.state, cb),
  onLog: (cb: (entry: LogEntry) => void) => subscribe(EventChannels.log, cb),
  onBuildProgress: (cb: (progress: BuildProgress) => void) =>
    subscribe(EventChannels.buildProgress, cb),
  onFlashProgress: (cb: (progress: FlashProgress) => void) =>
    subscribe(EventChannels.flashProgress, cb),
};

contextBridge.exposeInMainWorld('api', api);
