/**
 * Build/flash orchestrator.
 *
 * Owns the workflow state machine and composes every service. All state changes
 * go through {@link assertTransition} so an illegal transition can never occur —
 * important because the pipeline ends in a destructive disk write. Emits typed
 * snapshots, logs and progress that the IPC layer forwards to the renderer.
 */
import { basename } from 'node:path';
import { stat } from 'node:fs/promises';
import {
  assertTransition,
  canTransition,
  isTerminal,
  progressFraction,
  WORKFLOW_ORDER,
} from '@shared/workflow.js';
import { validateImageBasics, combineIssues, validateImageStructure } from '@shared/image-validation.js';
import { windowsPathToWslPath } from '@shared/command.js';
import { DEFAULT_BUILD_OPTIONS } from '@shared/types.js';
import type {
  BuildOptions,
  DiskDevice,
  EnvironmentReport,
  FlashProgress,
  FlashRequest,
  SteamosImageInfo,
  WorkflowState,
} from '@shared/types.js';
import type { AppSnapshot, BuildProgress, SelectedImage } from '@shared/ipc-contract.js';
import { Logger } from './services/logger.js';
import { checkEnvironment } from './services/environment.js';
import { BUILDER_DISTRO, probeCapabilities, runInDistro } from './services/wsl.js';
import { scanDisks } from './services/usb-service.js';
import { flashImage, FlashCancelledError } from './services/flash-service.js';
import { provisionBuilderDistro } from './services/provision.js';
import {
  copyImageIntoDistro,
  deriveOutputPath,
  inspectSteamosImage,
  runBuildScript,
} from './services/image-service.js';

export interface OrchestratorConfig {
  /** Windows path to the vendored upstream script (packaged resource). */
  scriptWindowsPath: string;
  /** Windows workspace directory for the patched image copy + logs. */
  workspaceWindowsPath: string;
  /** Log file path. */
  logFilePath: string;
  /** Distro name (defaults to the dedicated builder distro). */
  distro?: string;
}

const STATE_LABEL: Record<WorkflowState, string> = {
  INITIALIZING: 'Starting up',
  CHECKING_ENVIRONMENT: 'Checking environment',
  SELECTING_IMAGE: 'Select a SteamOS recovery image',
  VALIDATING_IMAGE: 'Validating image',
  PREPARING_WORKSPACE: 'Preparing workspace',
  PREPARING_WSL: 'Preparing build environment',
  INSPECTING_STEAMOS: 'Inspecting SteamOS image',
  RESOLVING_KERNEL: 'Resolving kernel & headers',
  RESOLVING_NVIDIA_PACKAGES: 'Resolving NVIDIA packages',
  PATCHING_IMAGE: 'Patching image (NVIDIA driver)',
  VALIDATING_PATCH: 'Validating patched image',
  SCANNING_USB: 'Scanning USB drives',
  USB_SELECTED: 'USB drive selected',
  AWAITING_FLASH_CONFIRMATION: 'Awaiting flash confirmation',
  FLASHING_USB: 'Flashing USB',
  VERIFYING_USB: 'Verifying written data',
  COMPLETED: 'Done',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  CLEANING_UP: 'Cleaning up',
};

type Sub<T> = (payload: T) => void;

export class Orchestrator {
  private readonly logger: Logger;
  private readonly distro: string;

  private state: WorkflowState = 'INITIALIZING';
  private operation = STATE_LABEL.INITIALIZING;
  private error: string | null = null;
  private environment: EnvironmentReport | null = null;
  private image: SelectedImage | null = null;
  private imageInfo: SteamosImageInfo | null = null;
  private imageValidation: AppSnapshot['imageValidation'] = null;
  private options: BuildOptions = { ...DEFAULT_BUILD_OPTIONS };

  /** Windows path of the patched image (copied out for flashing). */
  private patchedImagePath: string | null = null;
  private patchedImageSizeBytes: number | null = null;
  private selectedDevice: DiskDevice | null = null;

  private buildAbort: AbortController | null = null;
  private flashAbort: AbortController | null = null;

  private readonly stateSubs = new Set<Sub<AppSnapshot>>();
  private readonly buildProgressSubs = new Set<Sub<BuildProgress>>();
  private readonly flashProgressSubs = new Set<Sub<FlashProgress>>();

  constructor(private readonly config: OrchestratorConfig) {
    this.distro = config.distro ?? BUILDER_DISTRO;
    this.logger = new Logger('app', config.logFilePath);
  }

  /* --------------------------------------------------------- subscriptions */

  subscribeState(cb: Sub<AppSnapshot>): () => void {
    this.stateSubs.add(cb);
    return () => this.stateSubs.delete(cb);
  }
  subscribeLog(cb: Parameters<Logger['subscribe']>[0]): () => void {
    return this.logger.subscribe(cb);
  }
  subscribeBuildProgress(cb: Sub<BuildProgress>): () => void {
    this.buildProgressSubs.add(cb);
    return () => this.buildProgressSubs.delete(cb);
  }
  subscribeFlashProgress(cb: Sub<FlashProgress>): () => void {
    this.flashProgressSubs.add(cb);
    return () => this.flashProgressSubs.delete(cb);
  }

  /* --------------------------------------------------------------- snapshot */

  getSnapshot(): AppSnapshot {
    return {
      state: this.state,
      operation: this.operation,
      error: this.error,
      environment: this.environment,
      image: this.image,
      imageInfo: this.imageInfo,
      imageValidation: this.imageValidation,
      patchedImagePath: this.patchedImagePath,
      patchedImageSizeBytes: this.patchedImageSizeBytes,
      options: this.options,
      flashUnlocked: this.computeFlashUnlocked(),
    };
  }

  private computeFlashUnlocked(): boolean {
    return (
      this.patchedImagePath !== null &&
      this.selectedDevice !== null &&
      (this.state === 'USB_SELECTED' || this.state === 'AWAITING_FLASH_CONFIRMATION')
    );
  }

  private emitState(): void {
    const snap = this.getSnapshot();
    for (const cb of this.stateSubs) cb(snap);
  }

  private setState(next: WorkflowState, operation?: string): void {
    this.state = assertTransition(this.state, next);
    this.operation = operation ?? STATE_LABEL[next];
    this.logger.info(`→ ${next}: ${this.operation}`);
    this.emitState();
  }

  /** Step forward through the linear order until `target` is reached. */
  private advanceTo(target: WorkflowState): void {
    const targetIdx = WORKFLOW_ORDER.indexOf(target);
    if (targetIdx < 0) return;
    let guard = 0;
    while (this.state !== target && guard++ < WORKFLOW_ORDER.length) {
      const curIdx = WORKFLOW_ORDER.indexOf(this.state);
      if (curIdx < 0 || curIdx >= targetIdx) break;
      const next = WORKFLOW_ORDER[curIdx + 1];
      if (!canTransition(this.state, next)) break;
      this.setState(next);
    }
  }

  private fail(message: string): void {
    this.error = message;
    this.logger.error(message);
    if (canTransition(this.state, 'FAILED')) {
      this.state = 'FAILED';
      this.operation = STATE_LABEL.FAILED;
    }
    this.emitState();
  }

  /* ------------------------------------------------------------ public API */

  async checkEnvironment(): Promise<EnvironmentReport> {
    if (this.state === 'INITIALIZING') this.setState('CHECKING_ENVIRONMENT');
    const report = await checkEnvironment(this.config.workspaceWindowsPath);
    this.environment = report;
    for (const b of report.blockers) this.logger.warn(`env blocker: ${b}`);
    if (this.state === 'CHECKING_ENVIRONMENT' && canTransition(this.state, 'SELECTING_IMAGE')) {
      this.setState('SELECTING_IMAGE');
    } else {
      this.emitState();
    }
    return report;
  }

  /**
   * Best-effort provisioning of the dedicated Arch builder distro, then a fresh
   * environment check. Streams progress to the log; never throws to the caller
   * (failures are logged with a pointer to the manual steps).
   */
  async provisionDistro(): Promise<void> {
    this.logger.info('Setting up the builder distro (best-effort). This can take several minutes.');
    try {
      await provisionBuilderDistro(this.distro, this.config.workspaceWindowsPath, {
        onLog: (m) => this.logger.info(m),
      });
      this.logger.info('Builder distro setup finished. Re-checking environment.');
    } catch (err) {
      this.logger.error(
        `Builder distro setup failed: ${err instanceof Error ? err.message : String(err)}. ` +
          'See TROUBLESHOOTING.md for the manual steps.',
      );
    }
    await this.checkEnvironment();
  }

  /** Record a selected image and run instant (filename+size) validation. */
  setImage(image: SelectedImage): void {
    this.image = image;
    this.selectedDevice = null;
    this.patchedImagePath = null;
    this.patchedImageSizeBytes = null;
    this.imageInfo = null;
    const result = validateImageBasics(image.path, image.sizeBytes);
    this.imageValidation = result;
    for (const issue of result.issues) this.logger.info(`image: [${issue.severity}] ${issue.message}`);
    this.emitState();
  }

  setOptions(options: BuildOptions): void {
    this.options = options;
    this.emitState();
  }

  /**
   * Full build pipeline: prepare workspace → copy in → probe WSL → inspect →
   * resolve → patch → validate. Runs the vendored script unmodified.
   */
  async startBuild(options: BuildOptions, imageWindowsPath: string, sizeBytes: number): Promise<void> {
    this.options = options;
    this.image = { path: imageWindowsPath, sizeBytes };
    this.error = null;
    this.buildAbort = new AbortController();
    const signal = this.buildAbort.signal;

    try {
      // Gate 1: basics
      const basics = validateImageBasics(imageWindowsPath, sizeBytes);
      this.imageValidation = basics;
      if (!basics.ok) {
        throw new Error(basics.issues.find((i) => i.severity === 'error')?.message ?? 'Invalid image');
      }
      if (this.state === 'CHECKING_ENVIRONMENT') this.setState('SELECTING_IMAGE');
      if (this.state === 'SELECTING_IMAGE') this.setState('VALIDATING_IMAGE');

      // Gate 2: environment must be ready
      const env = await this.checkEnvironmentSilent();
      if (!env.ready) {
        throw new Error(
          `Environment is not ready: ${env.blockers.join(' ') || 'unknown blocker'}`,
        );
      }

      // Prepare workspace + copy the image into the distro (ext4).
      this.setState('PREPARING_WORKSPACE');
      const srcLinux = windowsPathToWslPath(imageWindowsPath);
      const workLinux = '/root/.steamos-nvidia-work';
      const inputLinux = `${workLinux}/input/${basename(imageWindowsPath)}`;
      this.logger.info(`Copying image into ${this.distro}: ${srcLinux} -> ${inputLinux}`);
      await copyImageIntoDistro(
        this.distro,
        srcLinux,
        inputLinux,
        sizeBytes,
        (f) =>
          this.emitBuildProgress({
            state: 'PREPARING_WORKSPACE',
            fraction: f,
            operation: 'Copying image into build environment',
          }),
        signal,
      );
      this.throwIfAborted(signal);

      // Probe WSL capabilities before committing to a 20-minute build.
      this.setState('PREPARING_WSL');
      const caps = await probeCapabilities(this.distro);
      if (caps.missingTools.length > 0) {
        throw new Error(`Builder distro is missing required tools: ${caps.missingTools.join(', ')}`);
      }
      if (!caps.overlayfsSupport || !caps.btrfsSupport || !caps.loopPartitionSupport) {
        const missing = [
          !caps.overlayfsSupport ? 'overlayfs' : null,
          !caps.btrfsSupport ? 'btrfs' : null,
          !caps.loopPartitionSupport ? 'loop partition scanning' : null,
        ]
          .filter(Boolean)
          .join(', ');
        throw new Error(`This WSL kernel lacks: ${missing}. See TROUBLESHOOTING.md.`);
      }

      // Read-only inspection + structural validation (fail early).
      this.setState('INSPECTING_STEAMOS');
      const info = await inspectSteamosImage(this.distro, inputLinux, sizeBytes);
      this.imageInfo = info;
      const structure = combineIssues(validateImageStructure(info));
      this.imageValidation = combineIssues([...basics.issues, ...structure.issues]);
      if (!structure.ok) {
        throw new Error(
          structure.issues.find((i) => i.severity === 'error')?.message ??
            'Image structure validation failed',
        );
      }
      this.logger.info(
        `SteamOS ${info.steamosVersion ?? '?'}, kernel ${info.kernelVersion ?? '?'}, glibc ${info.glibc ?? '?'}`,
      );
      this.throwIfAborted(signal);

      // Run the vendored script. States advance from progress fractions.
      this.setState('RESOLVING_KERNEL');
      const buildWorkdir = `${workLinux}/build`;
      const result = await runBuildScript(
        this.distro,
        windowsPathToWslPath(this.config.scriptWindowsPath),
        options,
        inputLinux,
        buildWorkdir,
        {
          onLog: (line) => this.logger.info(line),
          onProgress: (p) => this.onBuildStageProgress(p),
          signal,
        },
      );
      this.throwIfAborted(signal);
      if (result.exitCode !== 0) {
        const tail = result.stderr.trim().split('\n').slice(-8).join('\n');
        throw new Error(`Build failed (exit ${String(result.exitCode)}).\n${tail}`);
      }

      // Copy the patched image out to a Windows path for flashing.
      this.advanceTo('PATCHING_IMAGE');
      this.setState('VALIDATING_PATCH');
      const outputLinux = deriveOutputPath(inputLinux);
      const outName = basename(outputLinux);
      const outWindows = `${this.config.workspaceWindowsPath}\\${outName}`;
      const outWindowsLinux = windowsPathToWslPath(outWindows);
      this.logger.info(`Copying patched image out to ${outWindows}`);
      const outSize = await this.remoteFileSize(outputLinux);
      await copyImageIntoDistro(
        this.distro,
        outputLinux,
        outWindowsLinux,
        outSize,
        (f) =>
          this.emitBuildProgress({
            state: 'VALIDATING_PATCH',
            fraction: f,
            operation: 'Copying patched image to Windows',
          }),
        signal,
      );
      const winStat = await stat(outWindows);
      this.patchedImagePath = outWindows;
      this.patchedImageSizeBytes = winStat.size;
      this.logger.info(`Patched image ready: ${outWindows} (${winStat.size} bytes)`);

      this.setState('SCANNING_USB');
    } catch (err) {
      if (signal.aborted || err instanceof FlashCancelledError) {
        this.cancelToState('build');
      } else {
        this.fail(err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.buildAbort = null;
    }
  }

  cancelBuild(): void {
    if (this.buildAbort) {
      this.logger.warn('Build cancellation requested');
      this.buildAbort.abort();
    }
  }

  async scanUsb(): Promise<DiskDevice[]> {
    const devices = await scanDisks();
    if (canTransition(this.state, 'SCANNING_USB') && this.state !== 'SCANNING_USB') {
      this.setState('SCANNING_USB');
    } else {
      this.emitState();
    }
    // A prior selection is invalidated by a fresh scan.
    this.selectedDevice = null;
    return devices;
  }

  selectUsb(device: DiskDevice): void {
    this.selectedDevice = device;
    if (this.state === 'SCANNING_USB') {
      this.setState('USB_SELECTED');
    } else if (this.state === 'AWAITING_FLASH_CONFIRMATION') {
      this.setState('USB_SELECTED');
    } else {
      this.emitState();
    }
  }

  async startFlash(request: FlashRequest): Promise<void> {
    if (this.patchedImagePath === null) {
      throw new Error('No patched image available to flash.');
    }
    this.error = null;
    this.flashAbort = new AbortController();
    const signal = this.flashAbort.signal;
    try {
      if (this.state === 'USB_SELECTED') this.setState('AWAITING_FLASH_CONFIRMATION');
      if (this.state !== 'AWAITING_FLASH_CONFIRMATION') {
        throw new Error(`Cannot start flashing from state ${this.state}.`);
      }
      this.setState('FLASHING_USB');
      await flashImage(
        { ...request, imagePath: this.patchedImagePath },
        {
          signal,
          onLog: (m) => this.logger.info(`[flash] ${m}`),
          onProgress: (p) => {
            if (p.phase === 'verifying' && this.state === 'FLASHING_USB') {
              this.setState('VERIFYING_USB');
            }
            this.emitFlashProgress(p);
          },
        },
      );
      this.setState('COMPLETED');
    } catch (err) {
      if (err instanceof FlashCancelledError) {
        this.cancelToState('flash');
      } else {
        this.fail(err instanceof Error ? err.message : String(err));
      }
    } finally {
      this.flashAbort = null;
    }
  }

  cancelFlash(): void {
    if (this.flashAbort) {
      this.logger.warn('Flash cancellation requested');
      this.flashAbort.abort();
    }
  }

  /* --------------------------------------------------------------- helpers */

  private async checkEnvironmentSilent(): Promise<EnvironmentReport> {
    const report = await checkEnvironment(this.config.workspaceWindowsPath);
    this.environment = report;
    return report;
  }

  private async remoteFileSize(linuxPath: string): Promise<number> {
    const r = await runInDistro(this.distro, 'root', ['stat', '-c', '%s', linuxPath]);
    const n = Number.parseInt(r.stdout.trim(), 10);
    if (Number.isNaN(n)) throw new Error(`Could not stat patched image at ${linuxPath}`);
    return n;
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new FlashCancelledError();
  }

  private cancelToState(_which: 'build' | 'flash'): void {
    if (canTransition(this.state, 'CANCELLED')) {
      this.state = 'CANCELLED';
      this.operation = STATE_LABEL.CANCELLED;
    }
    this.logger.warn('Operation cancelled');
    this.emitState();
  }

  private onBuildStageProgress(p: BuildProgress): void {
    // Map coarse fraction to the resolve/patch states.
    if (p.fraction < 0.2) this.advanceTo('RESOLVING_KERNEL');
    else if (p.fraction < 0.4) this.advanceTo('RESOLVING_NVIDIA_PACKAGES');
    else this.advanceTo('PATCHING_IMAGE');
    this.operation = p.operation;
    this.emitBuildProgress(p);
    this.emitState();
  }

  private emitBuildProgress(p: BuildProgress): void {
    for (const cb of this.buildProgressSubs) cb(p);
  }
  private emitFlashProgress(p: FlashProgress): void {
    for (const cb of this.flashProgressSubs) cb(p);
  }

  /** Reset to a fresh run (after COMPLETED/FAILED/CANCELLED). */
  reset(): void {
    if (!isTerminal(this.state) && this.state !== 'INITIALIZING') return;
    this.state = 'INITIALIZING';
    this.operation = STATE_LABEL.INITIALIZING;
    this.error = null;
    this.image = null;
    this.imageInfo = null;
    this.imageValidation = null;
    this.patchedImagePath = null;
    this.patchedImageSizeBytes = null;
    this.selectedDevice = null;
    this.emitState();
  }

  /** Current overall progress fraction, for the top-level bar. */
  overallProgress(): number {
    return progressFraction(this.state);
  }
}
