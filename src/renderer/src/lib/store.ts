import { create } from 'zustand';
import type {
  AppSnapshot,
  BuildProgress,
} from '@shared/ipc-contract.js';
import type {
  BuildOptions,
  DiskDevice,
  FlashProgress,
  FlashRequest,
  LogEntry,
} from '@shared/types.js';
import { DEFAULT_BUILD_OPTIONS } from '@shared/types.js';

const MAX_LOGS = 600;

function api() {
  if (typeof window === 'undefined' || !window.api) {
    throw new Error('Bridge API unavailable (running outside Electron?)');
  }
  return window.api;
}

export interface UiState {
  ready: boolean;
  snapshot: AppSnapshot | null;
  logs: LogEntry[];
  devices: DiskDevice[];
  selectedDevice: DiskDevice | null;
  lastScanTs: number | null;
  buildProgress: BuildProgress | null;
  flashProgress: FlashProgress | null;
  options: BuildOptions;
  theme: 'dark' | 'light';

  init: () => void;
  checkEnvironment: () => Promise<void>;
  provisionDistro: () => Promise<void>;
  openWslDocs: () => Promise<void>;
  selectImage: () => Promise<void>;
  setOptions: (options: Partial<BuildOptions>) => void;
  startBuild: () => Promise<void>;
  cancelBuild: () => Promise<void>;
  scanUsb: () => Promise<void>;
  selectUsb: (device: DiskDevice) => Promise<void>;
  startFlash: (request: FlashRequest) => Promise<void>;
  cancelFlash: () => Promise<void>;
  reset: () => Promise<void>;
  toggleTheme: () => void;
}

export const useStore = create<UiState>((set, get) => ({
  ready: false,
  snapshot: null,
  logs: [],
  devices: [],
  selectedDevice: null,
  lastScanTs: null,
  buildProgress: null,
  flashProgress: null,
  options: { ...DEFAULT_BUILD_OPTIONS },
  theme: 'dark',

  init: () => {
    if (get().ready) return;
    const a = api();
    a.onState((snapshot: AppSnapshot) => set({ snapshot, options: snapshot.options }));
    a.onLog((entry: LogEntry) =>
      set((s) => ({ logs: [...s.logs.slice(-(MAX_LOGS - 1)), entry] })),
    );
    a.onBuildProgress((buildProgress: BuildProgress) => set({ buildProgress }));
    a.onFlashProgress((flashProgress: FlashProgress) => set({ flashProgress }));
    void a.getSnapshot().then((snapshot) => set({ snapshot, options: snapshot.options }));
    set({ ready: true });
  },

  checkEnvironment: async () => {
    await api().checkEnvironment();
  },

  provisionDistro: async () => {
    await api().provisionDistro();
  },

  openWslDocs: async () => {
    await api().openWslDocs();
  },

  selectImage: async () => {
    await api().selectImage();
  },

  setOptions: (partial) => {
    const options = { ...get().options, ...partial };
    set({ options });
    void api().setOptions(options);
  },

  startBuild: async () => {
    const snap = get().snapshot;
    if (!snap?.image) return;
    set({ buildProgress: null });
    await api().startBuild({ options: get().options, imagePath: snap.image.path });
  },

  cancelBuild: async () => {
    await api().cancelBuild();
  },

  scanUsb: async () => {
    const devices = await api().scanUsb();
    // A fresh scan invalidates any prior selection (device identity may change).
    set({ devices, selectedDevice: null, lastScanTs: Date.now() });
  },

  selectUsb: async (device) => {
    set({ selectedDevice: device });
    await api().selectUsb(device);
  },

  startFlash: async (request) => {
    set({ flashProgress: null });
    await api().startFlash(request);
  },

  cancelFlash: async () => {
    await api().cancelFlash();
  },

  reset: async () => {
    set({ buildProgress: null, flashProgress: null, devices: [], selectedDevice: null, lastScanTs: null });
    await api().resetWorkflow();
  },

  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
}));
