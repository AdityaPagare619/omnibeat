/**
 * TTS — synthetic speech marks + optional sine-wave WAV.
 *
 * No Polly in this environment (ESC-001), so playback is synthesised locally:
 * the response text is split into words with cumulative timings at
 * `MS_PER_WORD` (250 ms/word). The marks are what barge-in cuts against —
 * POST /barge-in {atMs} resolves `atMs` to a word index, exactly like a real
 * speech-marks stream would.
 *
 * `sineWav()` renders a tone of the utterance's duration for fixture playback
 * through express.static (public/).
 */

export const MS_PER_WORD = 250;

export interface SpeechMark {
  /** 0-based index of the word in the response. */
  index: number;
  word: string;
  /** Word start, ms from TTS start. */
  startMs: number;
  /** Word end, ms from TTS start. */
  endMs: number;
}

export function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Cumulative timings at 250 ms/word — deterministic, no randomness. */
export function buildMarks(text: string, msPerWord: number = MS_PER_WORD): SpeechMark[] {
  return wordsOf(text).map((word, index) => ({
    index,
    word,
    startMs: index * msPerWord,
    endMs: (index + 1) * msPerWord,
  }));
}

export function durationOf(marks: SpeechMark[]): number {
  return marks.length === 0 ? 0 : marks[marks.length - 1]!.endMs;
}

/**
 * Word index a barge-in at `atMs` cuts at: the last word whose start has
 * already happened. -1 means the interrupt landed before speech started.
 */
export function wordIndexAt(marks: SpeechMark[], atMs: number): number {
  let cut = -1;
  for (const mark of marks) {
    if (mark.startMs <= atMs) cut = mark.index;
    else break;
  }
  return cut;
}

/** How many words were fully spoken before `atMs`. */
export function wordsCompletedAt(marks: SpeechMark[], atMs: number): number {
  return marks.filter((m) => m.endMs <= atMs).length;
}

export interface PlaybackState {
  playing: boolean;
  traceId?: string;
  text?: string;
  marks: SpeechMark[];
  durationMs: number;
  startedAt?: number;
  cutAtMs?: number;
}

/**
 * In-memory TTS state machine. `start()` arms a timer that flips the state
 * back to idle at utterance end; `cut()` clears it (barge-in).
 */
export class TtsPlayer {
  private state: PlaybackState = { playing: false, marks: [], durationMs: 0 };
  private timer: NodeJS.Timeout | null = null;

  start(text: string, traceId: string, msPerWord: number = MS_PER_WORD): PlaybackState {
    this.stopTimer();
    const marks = buildMarks(text, msPerWord);
    const durationMs = durationOf(marks);
    this.state = {
      playing: marks.length > 0,
      traceId,
      text,
      marks,
      durationMs,
      startedAt: Date.now(),
    };
    if (this.state.playing) {
      this.timer = setTimeout(() => {
        this.state = { ...this.state, playing: false };
        this.timer = null;
      }, durationMs);
      this.timer.unref?.();
    }
    return this.snapshot();
  }

  /** Barge-in: stop playback; returns the marks it cut against. */
  cut(atMs: number): { cutAtWord: number; marks: SpeechMark[]; wasPlaying: boolean } {
    const marks = this.state.marks;
    const wasPlaying = this.state.playing;
    const cutAtWord = wordIndexAt(marks, atMs);
    this.stopTimer();
    this.state = { ...this.state, playing: false, cutAtMs: atMs };
    return { cutAtWord, marks, wasPlaying };
  }

  stop(): void {
    this.stopTimer();
    this.state = { ...this.state, playing: false };
  }

  isPlaying(): boolean {
    return this.state.playing;
  }

  currentMarks(): SpeechMark[] {
    return this.state.marks;
  }

  currentTraceId(): string | undefined {
    return this.state.traceId;
  }

  snapshot(): PlaybackState {
    return { ...this.state, marks: [...this.state.marks] };
  }

  private stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * 16-bit PCM mono sine wave, 8 kHz, `durationMs` long, with a short fade so
 * playback never clicks. Written to public/ for fixture playback.
 */
export function sineWav(durationMs: number, frequencyHz = 440, sampleRate = 8000): Buffer {
  const duration = Math.max(10, Math.min(60_000, Math.round(durationMs)));
  const samples = Math.floor((sampleRate * duration) / 1000);
  const data = Buffer.alloc(samples * 2);
  const fade = Math.min(samples, Math.floor(sampleRate * 0.02));
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    let amplitude = Math.sin(2 * Math.PI * frequencyHz * t);
    if (i < fade) amplitude *= i / fade;
    if (i > samples - fade) amplitude *= (samples - i) / fade;
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(amplitude * 24000))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
