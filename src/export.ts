import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import {
  TARGET_CHANNELS,
  TARGET_SAMPLE_RATE,
  type TimedAudioBuffer,
  createSilence,
  decodeAudioFile,
  fitToTarget,
  placeAudioBuffers,
} from './audio';
import { drawScene } from './scene';

export type ExportOptions = {
  canvas: HTMLCanvasElement;
  durationSec: number;
  fps: number;
  audioFile?: Blob;
  videoFile?: Blob;
  onProgress?: (ratio: number) => void;
};

type StaticClip = {
  videoTrack: InputVideoTrack;
  audioTrack: InputAudioTrack | null;
  startTimestamp: number;
  durationSec: number;
};

const videoQuality = new Quality('high');
const audioQuality = new Quality({ bitrate: 128e3 });

export async function exportVideo(options: ExportOptions): Promise<Blob> {
  const { canvas, durationSec, fps, audioFile, videoFile, onProgress } = options;
  if (!(durationSec > 0) || !(fps > 0)) throw new Error('秒数と fps は正の数で指定する');

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D コンテキストを取得できない');

  if (!(await canEncodeVideo('avc', { width: canvas.width, height: canvas.height, quality: videoQuality }))) {
    throw new Error('このブラウザは H.264 (avc) のエンコードに対応していない');
  }
  if (
    !(await canEncodeAudio('aac', {
      numberOfChannels: TARGET_CHANNELS,
      sampleRate: TARGET_SAMPLE_RATE,
      quality: audioQuality,
    }))
  ) {
    throw new Error('このブラウザは AAC のエンコードに対応していない');
  }

  const input = videoFile ? new Input({ formats: ALL_FORMATS, source: new BlobSource(videoFile) }) : null;
  try {
    const clip = input ? await openStaticClip(input) : null;
    const totalDuration = durationSec + (clip?.durationSec ?? 0);

    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const videoSource = new CanvasSource(canvas, { codec: 'avc', quality: videoQuality });
    // AudioSampleSource はサンプルレート・チャンネル数の一致を transform より前に検査するため、transform は使わず自前で 48000Hz/2ch に揃える
    const audioSource = new AudioSampleSource({ codec: 'aac', quality: audioQuality });
    output.addVideoTrack(videoSource);
    output.addAudioTrack(audioSource);
    await output.start();

    try {
      await Promise.all([
        writeVideo(videoSource, ctx, canvas, durationSec, fps, clip, (t) => onProgress?.(t / totalDuration)),
        writeAudio(audioSource, durationSec, audioFile, clip),
      ]);
      await output.finalize();
    } catch (error) {
      await output.cancel();
      throw error;
    }

    if (!target.buffer) throw new Error('出力バッファが空');
    onProgress?.(1);
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    input?.dispose();
  }
}

async function openStaticClip(input: Input): Promise<StaticClip> {
  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('静的動画に映像トラックが無い');
  if (!(await videoTrack.canDecode())) throw new Error('静的動画の映像をデコードできない');

  const audioTrack = await input.getPrimaryAudioTrack();
  if (audioTrack && !(await audioTrack.canDecode())) throw new Error('静的動画の音声をデコードできない');

  const startTimestamp = await videoTrack.getFirstTimestamp();
  const durationSec = (await videoTrack.computeDuration()) - startTimestamp;
  return { videoTrack, audioTrack, startTimestamp, durationSec };
}

async function writeVideo(
  source: CanvasSource,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps: number,
  clip: StaticClip | null,
  onTime: (t: number) => void,
): Promise<void> {
  const frameDuration = 1 / fps;
  const frames = Math.round(durationSec * fps);
  for (let i = 0; i < frames; i++) {
    const t = i * frameDuration;
    drawScene(ctx, t, canvas.width, canvas.height);
    await source.add(t, frameDuration);
    onTime(t + frameDuration);
  }

  if (!clip) return;
  const sink = new VideoSampleSink(clip.videoTrack);
  let firstTimestamp: number | null = null;
  for await (const sample of sink.samples()) {
    try {
      firstTimestamp ??= sample.timestamp;
      const t = durationSec + (sample.timestamp - firstTimestamp);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      sample.drawWithFit(ctx, { fit: 'contain' });
      await source.add(t, sample.duration);
      onTime(t + sample.duration);
    } finally {
      sample.close();
    }
  }
}

async function writeAudio(
  source: AudioSampleSource,
  durationSec: number,
  audioFile: Blob | undefined,
  clip: StaticClip | null,
): Promise<void> {
  const dynamicBuffer = audioFile
    ? await fitToTarget(await decodeAudioFile(audioFile), durationSec)
    : createSilence(durationSec);
  await addAudioBuffer(source, dynamicBuffer, 0);

  if (!clip) return;
  if (!clip.audioTrack) {
    await addAudioBuffer(source, createSilence(clip.durationSec), durationSec);
    return;
  }

  // AAC の先頭にはプライミング用の負のタイムスタンプのサンプルがあり、音声の先頭基準にすると映像とずれるため映像の先頭を基準にして捨てる
  const sink = new AudioSampleSink(clip.audioTrack);
  let received = false;
  let passThrough: boolean | null = null;
  const pending: TimedAudioBuffer[] = [];
  for await (const sample of sink.samples(clip.startTimestamp, clip.startTimestamp + clip.durationSec)) {
    try {
      const relative = sample.timestamp - clip.startTimestamp;
      if (relative < 0) continue;
      received = true;
      passThrough ??= sample.sampleRate === TARGET_SAMPLE_RATE && sample.numberOfChannels === TARGET_CHANNELS;
      if (passThrough) {
        sample.setTimestamp(durationSec + relative);
        await source.add(sample);
      } else {
        pending.push({ buffer: sample.toAudioBuffer(), timestamp: relative });
      }
    } finally {
      sample.close();
    }
  }

  if (!received) {
    await addAudioBuffer(source, createSilence(clip.durationSec), durationSec);
  } else if (pending.length > 0) {
    const merged = placeAudioBuffers(pending);
    await addAudioBuffer(source, await fitToTarget(merged, merged.duration), durationSec);
  }
}

async function addAudioBuffer(source: AudioSampleSource, buffer: AudioBuffer, timestamp: number): Promise<void> {
  const samples = AudioSample.fromAudioBuffer(buffer, timestamp);
  try {
    for (const sample of samples) await source.add(sample);
  } finally {
    for (const sample of samples) sample.close();
  }
}
