declare module 'node-nlp' {
  export interface NlpManagerOptions {
    languages?: string[];
    forceNER?: boolean;
    autoSave?: boolean;
    modelFileName?: string;
  }

  export interface ProcessResult {
    intent?: string;
    score?: number;
    entities?: Record<string, unknown>;
  }

  export class NlpManager {
    constructor(options?: NlpManagerOptions);
    addDocument(language: string, utterance: string, intent: string): void;
    train(): Promise<void>;
    process(language: string, utterance: string): Promise<ProcessResult>;
  }
}