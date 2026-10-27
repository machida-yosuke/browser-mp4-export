export const TARGET_SAMPLE_RATE = 48000;
export const TARGET_CHANNELS = 2;

export type TimedAudioBuffer = { buffer: AudioBuffer; timestamp: number };

function frameCount(durationSec: number): number {
  return Math.max(1, Math.round(durationSec * TARGET_SAMPLE_RATE));
}

export async function decodeAudioFile(file: Blob): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(TARGET_CHANNELS, 1, TARGET_SAMPLE_RATE);
  return context.decodeAudioData(await file.arrayBuffer());
}

// OfflineAudioContext の長さで切り詰めと無音埋めを同時に行い、48000Hz/2ch に揃える
export async function fitToTarget(buffer: AudioBuffer, durationSec: number): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(TARGET_CHANNELS, frameCount(durationSec), TARGET_SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
  return context.startRendering();
}

export function createSilence(durationSec: number): AudioBuffer {
  return new AudioBuffer({
    length: frameCount(durationSec),
    numberOfChannels: TARGET_CHANNELS,
    sampleRate: TARGET_SAMPLE_RATE,
  });
}

// デコーダが返す小さなチャンクを個別にリサンプルすると境界でずれやノイズが出るため、元レートのまま 1 本に並べてから一括変換する
export function placeAudioBuffers(chunks: TimedAudioBuffer[]): AudioBuffer {
  if (chunks.length === 0) throw new Error('結合する音声チャンクが無い');
  const sampleRate = chunks[0].buffer.sampleRate;
  const numberOfChannels = Math.max(...chunks.map((c) => c.buffer.numberOfChannels));
  const length = Math.max(...chunks.map((c) => Math.round(c.timestamp * sampleRate) + c.buffer.length));
  const merged = new AudioBuffer({ length, numberOfChannels, sampleRate });
  for (const { buffer, timestamp } of chunks) {
    if (buffer.sampleRate !== sampleRate) {
      throw new Error(`音声チャンクのサンプルレートが途中で変わった (${sampleRate} -> ${buffer.sampleRate})`);
    }
    const start = Math.round(timestamp * sampleRate);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
      merged.copyToChannel(src, ch, start);
    }
  }
  return merged;
}
