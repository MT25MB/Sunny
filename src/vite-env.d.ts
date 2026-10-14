/// <reference types="vite/client" />

/**
 * Ambient types for Vite/build-time globals and the legacy `sunnyDesktop`
 * automation bridge.
 *
 * The `electornAPI` renderer surface intentionally does NOT live here — it has a
 * single definition in `src/types/electron.d.ts`, which also performs the
 * `declare global` augmentation of `Window`. Declaring `electronAPI` in both
 * files makes TypeScript report "Subsequent property declarations must have the
 * same type", so only the other globals are declared here.
 */

type SunnySpeechResult = {
  [index: number]: { transcript: string };
};

type SunnySpeechEvent = Event & {
  results: { [index: number]: SunnySpeechResult };
};

export type SunnySpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SunnySpeechEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SunnySpeechRecognitionConstructor = new () => SunnySpeechRecognition;

export type ModelStatus = {
  status: 'not-downloaded' | 'downloading' | 'loading' | 'ready' | 'error';
  progress: number;
  message: string;
};

/** Legacy desktop-automation surface exposed as `window.sunnyDesktop`. */
type SunnyDesktop = {
  captureScreen: () => Promise<{ dataUrl: string; width: number; height: number }>;
  analyzeScreen: (payload: { prompt: string; image: string }) => Promise<{ response: string }>;
  decideAction: (payload: { prompt: string }) => Promise<{ response: string }>;
  executeActions: (actions: unknown[]) => Promise<{ completed: number; cancelled: boolean }>;
  cancelActions: () => Promise<{ cancelled: boolean }>;
  windowAction: (action: 'hide' | 'show' | 'close') => Promise<void>;
  getModelStatus: () => Promise<ModelStatus>;
  initModel: () => Promise<ModelStatus>;
  onModelProgress: (callback: (status: ModelStatus) => void) => () => void;
  writeDebugLog: (entry: unknown) => Promise<{ success: boolean }>;
  sanitizeContent: (text: string) => Promise<string>;
  clearDebugLogs: () => Promise<{ success: boolean }>;
  exportDebugLogs: () => Promise<{ content: string }>;
  getDebugLogCount: () => Promise<{ count: number }>;
  saveCredential: (key: string, value: string) => Promise<{ success: boolean }>;
  loadCredential: (key: string) => Promise<{ value: string }>;
  deleteCredential: (key: string) => Promise<{ success: boolean }>;
};

declare global {
  interface Window {
    SpeechRecognition?: SunnySpeechRecognitionConstructor;
    webkitSpeechRecognition?: SunnySpeechRecognitionConstructor;
    sunnyDesktop?: SunnyDesktop;
  }
}

export {};
