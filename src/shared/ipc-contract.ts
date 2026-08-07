/**
 * The typed IPC contract shared by main, preload and renderer.
 *
 * The renderer only ever sees the {@link Api} surface (exposed on `window.api`
 * by the preload via contextBridge). It has no direct Node, fs or child_process
 * access. Channel-name constants are colocated so main and preload cannot drift.
 */
import type {
  BuildOptions,
  DiskDevice,
  EnvironmentReport,
  FlashProgress,
  FlashRequest,
  ImageValidationResult,
  LogEntry,
  SteamosImageInfo,
  WorkflowState,
} from './types.js';

/** Request/response channels (renderer → main, via ipcRenderer.invoke). */
export const IpcChannels = {
  checkEnvironment: 'env:check',
  provisionDistro: 'env:provision',
  openWslDocs: 'env:open-docs',
  selectImage: 'image:select',
  setOptions: 'build:set-options',
  startBuild: 'build:start',
  cancelBuild: 'build:cancel',
  scanUsb: 'usb:scan',
  selectUsb: 'usb:select',
  startFlash: 'flash:start',
  cancelFlash: 'flash:cancel',
  resetWorkflow: 'app:reset',
  getSnapshot: 'app:snapshot',
} as const;

/** Event channels (main → renderer, via webContents.send). */
export const EventChannels = {
  state: 'evt:state',
  log: 'evt:log',
  buildProgress: 'evt:build-progress',
  flashProgress: 'evt:flash-progress',
} as const;

export interface SelectedImage {
  path: string;
  sizeBytes: number;
}

export interface BuildProgress {
  state: WorkflowState;
  /** Best-effort 0..1 progress within the build, parsed from the script log. */
  fraction: number;
  /** Current high-level operation, e.g. "Compiling NVIDIA kernel module". */
  operation: string;
  /** Optional finer-grained detail. */
  subOperation?: string;
}

/** A serialisable snapshot of the orchestrator, delivered on every state change. */
export interface AppSnapshot {
  state: WorkflowState;
  operation: string;
  error: string | null;
  environment: EnvironmentReport | null;
  image: SelectedImage | null;
  imageInfo: SteamosImageInfo | null;
  imageValidation: ImageValidationResult | null;
  patchedImagePath: string | null;
  patchedImageSizeBytes: number | null;
  options: BuildOptions;
  /** Whether the destructive flash action is currently permitted. */
  flashUnlocked: boolean;
}

export interface StartBuildInput {
  options: BuildOptions;
  imagePath: string;
}

/**
 * The full API exposed to the renderer. Every method is async and crosses the
 * process boundary. Event subscriptions return an unsubscribe function.
 */
export interface Api {
  checkEnvironment(): Promise<EnvironmentReport>;
  provisionDistro(): Promise<void>;
  openWslDocs(): Promise<void>;
  selectImage(): Promise<SelectedImage | null>;
  setOptions(options: BuildOptions): Promise<void>;
  startBuild(input: StartBuildInput): Promise<void>;
  cancelBuild(): Promise<void>;
  scanUsb(): Promise<DiskDevice[]>;
  selectUsb(device: DiskDevice): Promise<void>;
  startFlash(request: FlashRequest): Promise<void>;
  cancelFlash(): Promise<void>;
  resetWorkflow(): Promise<void>;
  getSnapshot(): Promise<AppSnapshot>;

  onState(cb: (snapshot: AppSnapshot) => void): () => void;
  onLog(cb: (entry: LogEntry) => void): () => void;
  onBuildProgress(cb: (progress: BuildProgress) => void): () => void;
  onFlashProgress(cb: (progress: FlashProgress) => void): () => void;
}

/** Re-export for convenience so callers import one module. */
export type {
  BuildOptions,
  DiskDevice,
  EnvironmentReport,
  FlashProgress,
  FlashRequest,
  ImageValidationResult,
  LogEntry,
  SteamosImageInfo,
  WorkflowState,
};
