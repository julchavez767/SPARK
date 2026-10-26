// Minimal Web Speech API types (not in every TypeScript DOM lib version).
interface SparkSpeechRecognitionAlternative {
  readonly transcript: string;
}
interface SparkSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SparkSpeechRecognitionAlternative;
}
interface SparkSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SparkSpeechRecognitionResult };
}
interface SparkSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SparkSpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SparkSpeechRecognitionCtor = new () => SparkSpeechRecognition;

interface Window {
  SpeechRecognition?: SparkSpeechRecognitionCtor;
  webkitSpeechRecognition?: SparkSpeechRecognitionCtor;
}
