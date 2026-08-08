import type { Api } from '../shared/ipc-contract.js';

declare global {
  interface Window {
    api: Api;
  }
}

export {};
