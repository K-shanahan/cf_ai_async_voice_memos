/**
 * Audio analysis utility for real-time volume monitoring
 * Uses Web Audio API AnalyserNode to extract frequency data
 */

export interface AudioAnalyzerOptions {
  fftSize?: number;
  smoothingTimeConstant?: number;
}

export class AudioAnalyzer {
  private analyser: AnalyserNode;
  private dataArray: Uint8Array;
  private fftSize: number;

  constructor(audioContext: AudioContext, options: AudioAnalyzerOptions = {}) {
    this.fftSize = options.fftSize || 256;
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant =
      options.smoothingTimeConstant || 0.8;

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
  }

  /**
   * Get the current volume level as a normalized percentage (0-100)
   */
  getVolume(): number {
    const data = new Uint8Array(this.dataArray.length);
    this.analyser.getByteFrequencyData(data);

    // Calculate average frequency magnitude
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const average = sum / data.length;

    // Normalize to 0-100 range
    // Most audio levels fall in the 0-100 range of byte values
    const normalized = Math.min(100, (average / 255) * 100);
    return Math.round(normalized);
  }

  /**
   * Get the analyser node to connect to the audio stream
   */
  getAnalyser(): AnalyserNode {
    return this.analyser;
  }
}

/**
 * Create an audio analyzer from a media stream
 */
export function createAudioAnalyzer(
  stream: MediaStream,
  options: AudioAnalyzerOptions = {}
): { analyzer: AudioAnalyzer; audioContext: AudioContext } {
  const audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  const analyzer = new AudioAnalyzer(audioContext, options);

  source.connect(analyzer.getAnalyser());

  return { analyzer, audioContext };
}

/**
 * Convert volume percentage to a descriptive level (for accessibility)
 */
export function getVolumeLevelDescription(volume: number): string {
  if (volume === 0) return "Silent";
  if (volume < 20) return "Very quiet";
  if (volume < 40) return "Quiet";
  if (volume < 60) return "Moderate";
  if (volume < 80) return "Loud";
  return "Very loud";
}
