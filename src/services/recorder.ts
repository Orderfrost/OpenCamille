// Recorder 服务：把事件、会话 transcript 和 checkpoint 写入本地运行目录。
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type Config, type ConfigReader, configReader as defaultConfigReader } from "../config.js";
import type { Checkpoint, RunEvent, TranscriptItem } from "../types.js";
import type { EventBus } from "./lifecycle.js";

export type RecorderOptions = {
  rootDir: string;
  config: Config;
  configReader?: ConfigReader;
};

export class Recorder {
  private readonly configReader: ConfigReader;

  constructor(private readonly options: RecorderOptions) {
    this.configReader = options.configReader ?? defaultConfigReader;
  }

  async appendEvent(event: RunEvent): Promise<void> {
    await appendJsonLine(join(this.runDir(event.runId), "events.jsonl"), this.redact(event));
  }

  async appendTranscript(item: TranscriptItem): Promise<void> {
    await appendJsonLine(join(this.runDir(item.runId), "transcript.jsonl"), this.redact(item));
  }

  async writeCheckpoint(checkpoint: Checkpoint): Promise<void> {
    const file = join(this.runDir(checkpoint.runId), "checkpoint.json");
    await mkdir(this.runDir(checkpoint.runId), { recursive: true });
    await writeFile(file, `${JSON.stringify(this.redact(checkpoint), null, 2)}\n`);
  }

  subscribeTo(eventBus: EventBus): () => void {
    return eventBus.subscribe((event) => this.appendEvent(event));
  }

  private runDir(runId: string): string {
    return join(this.options.rootDir, ".opencamille", "runs", runId);
  }

  private redact<T>(value: T): T {
    return this.configReader.redactSecrets(value, this.options.config);
  }
}

export function createRecorder(options: RecorderOptions): Recorder {
  return new Recorder(options);
}

async function appendJsonLine(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(value)}\n`);
}
