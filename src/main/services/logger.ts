/**
 * Structured audit logger.
 *
 * Fans log entries out to in-memory subscribers (the renderer's live log panel)
 * and appends them to a rotating file. Secrets are redacted before they reach
 * either sink. Output is streamed line-by-line, never buffered unbounded.
 */
import { appendFile } from 'node:fs/promises';
import type { LogEntry, LogLevel } from '@shared/types.js';

export type LogSink = (entry: LogEntry) => void;

/** Redact obvious secrets: URL userinfo and key=value token pairs. */
export function redact(message: string): string {
  return message
    .replace(/\/\/[^/\s:@]+:[^/\s:@]+@/g, '//****:****@')
    .replace(/\b(token|password|passwd|secret|api[_-]?key)=([^\s&]+)/gi, '$1=****');
}

export class Logger {
  private readonly sinks = new Set<LogSink>();

  constructor(
    private readonly source: string = 'app',
    private readonly filePath: string | null = null,
  ) {}

  /** A logger that tags every entry with a subsystem name but shares sinks/file. */
  child(source: string): Logger {
    const c = new Logger(source, this.filePath);
    // share the same sink set so subscribers see child logs too
    for (const s of this.sinks) c.sinks.add(s);
    (c as unknown as { sinks: Set<LogSink> }).sinks = this.sinks;
    return c;
  }

  subscribe(sink: LogSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  debug(message: string): void {
    this.emit('debug', message);
  }
  info(message: string): void {
    this.emit('info', message);
  }
  warn(message: string): void {
    this.emit('warn', message);
  }
  error(message: string): void {
    this.emit('error', message);
  }

  private emit(level: LogLevel, message: string): void {
    const entry: LogEntry = {
      ts: Date.now(),
      level,
      source: this.source,
      message: redact(message),
    };
    for (const sink of this.sinks) {
      try {
        sink(entry);
      } catch {
        // a broken sink must never break logging
      }
    }
    if (this.filePath) {
      const line = `${new Date(entry.ts).toISOString()} [${entry.level}] ${entry.source}: ${entry.message}\n`;
      void appendFile(this.filePath, line).catch(() => {
        /* best-effort file logging */
      });
    }
  }
}
