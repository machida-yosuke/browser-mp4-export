export const TARGET_SAMPLE_RATE = 48000;
export const TARGET_CHANNELS = 2;

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
