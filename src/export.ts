import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  type InputVideoTrack,
  Mp4OutputFormat,
  Output,
  Quality,
  type VideoSample,
  VideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { TARGET_CHANNELS, TARGET_SAMPLE_RATE, createSilence, decodeAudioFile, fitToTarget } from './audio';
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
  durationSec: number;
};

const videoQuality = new Quality('high');
const audioQuality = new Quality({ bitrate: 128e3 });
// 元動画のタイムスタンプと i / fps の比較で、丸め誤差によって同時刻のサンプルを取りこぼさないための許容幅
const TIMESTAMP_EPSILON_SEC = 1e-6;

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
        writeAudio(audioSource, totalDuration, audioFile),
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

  const durationSec = (await videoTrack.computeDuration()) - (await videoTrack.getFirstTimestamp());
  return { videoTrack, durationSec };
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
  const staticFrames = Math.round(clip.durationSec * fps);
  const samples = new VideoSampleSink(clip.videoTrack).samples();
  let held: VideoSample | null = null;
  let next: VideoSample | null = null;
  let firstTimestamp = 0;
  let exhausted = false;
  try {
    for (let i = 0; i < staticFrames; i++) {
      const local = i * frameDuration;
      while (!exhausted) {
        if (!next) {
          const result = await samples.next();
          if (result.done) {
            exhausted = true;
            break;
          }
          next = result.value;
          if (!held) firstTimestamp = next.timestamp;
        }
        if (next.timestamp - firstTimestamp > local + TIMESTAMP_EPSILON_SEC) break;
        held?.close();
        held = next;
        next = null;
      }
      if (!held) throw new Error('静的動画に映像フレームが無い');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      held.drawWithFit(ctx, { fit: 'contain' });
      const t = durationSec + local;
      await source.add(t, frameDuration);
      onTime(t + frameDuration);
    }
  } finally {
    held?.close();
    next?.close();
    await samples.return();
  }
}

async function writeAudio(source: AudioSampleSource, totalDuration: number, audioFile: Blob | undefined): Promise<void> {
  const buffer = audioFile
    ? await fitToTarget(await decodeAudioFile(audioFile), totalDuration)
    : createSilence(totalDuration);
  const samples = AudioSample.fromAudioBuffer(buffer, 0);
  try {
    for (const sample of samples) await source.add(sample);
  } finally {
    for (const sample of samples) sample.close();
  }
}
