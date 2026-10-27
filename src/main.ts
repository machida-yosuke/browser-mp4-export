import './style.css';
import { exportVideo } from './export';
import { Preview } from './preview';
import { Timeline } from './timeline';

const WIDTH = 1280;
const HEIGHT = 720;
const INITIAL_DURATION_SEC = 3;
const INITIAL_FPS = 30;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <h1>browser-mp4-export</h1>
  <canvas id="canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
  <div id="timeline"></div>
  <div class="controls">
    <div class="row">
      <label>動的パートの秒数 <input id="duration" type="number" min="0.5" step="0.5" value="${INITIAL_DURATION_SEC}" /></label>
      <label>フレームレート <input id="fps" type="number" min="1" max="120" step="1" value="${INITIAL_FPS}" /></label>
    </div>
    <fieldset>
      <legend>音声 (mp3 / wav、動画全体に敷く)</legend>
      <input id="audio-file" type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" />
      <button id="audio-sample" type="button">サンプルを使う</button>
      <span id="audio-name">未指定</span>
    </fieldset>
    <fieldset>
      <legend>静的パートの動画 (mp4)</legend>
      <input id="video-file" type="file" accept="video/mp4,.mp4" />
      <button id="video-sample" type="button">サンプルを使う</button>
      <span id="video-name">未指定</span>
    </fieldset>
    <button id="export" type="button">書き出し</button>
    <p data-testid="status" id="status">待機中</p>
  </div>
  <div id="result" hidden>
    <video id="result-video" controls></video>
    <a id="download" download="browser-mp4-export.mp4">ダウンロード</a>
  </div>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('canvas');
const durationInput = $<HTMLInputElement>('duration');
const fpsInput = $<HTMLInputElement>('fps');
const exportButton = $<HTMLButtonElement>('export');
const status = $<HTMLParagraphElement>('status');
const result = $<HTMLDivElement>('result');
const resultVideo = $<HTMLVideoElement>('result-video');
const download = $<HTMLAnchorElement>('download');

const timeline = new Timeline($('timeline'), new Preview(canvas.getContext('2d')!), INITIAL_DURATION_SEC, INITIAL_FPS);

let audioFile: Blob | undefined;
let videoFile: Blob | undefined;
let resultUrl: string | null = null;

const showError = (error: unknown) =>
  (status.textContent = `エラー: ${error instanceof Error ? error.message : String(error)}`);

function bindSource(
  inputId: string,
  buttonId: string,
  nameId: string,
  sampleUrl: string,
  set: (blob: Blob, name: string) => Promise<void>,
): void {
  const nameLabel = $<HTMLSpanElement>(nameId);
  const apply = async (load: () => Promise<{ blob: Blob; name: string; label: string }>) => {
    try {
      const { blob, name, label } = await load();
      await set(blob, name);
      nameLabel.textContent = label;
    } catch (error) {
      showError(error);
      throw error;
    }
  };
  $<HTMLInputElement>(inputId).addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void apply(async () => ({ blob: file, name: file.name, label: file.name }));
  });
  $<HTMLButtonElement>(buttonId).addEventListener('click', () => {
    void apply(async () => {
      const response = await fetch(sampleUrl);
      if (!response.ok) throw new Error(`${sampleUrl} の取得に失敗 (${response.status})`);
      const name = sampleUrl.split('/').pop()!;
      return { blob: await response.blob(), name, label: `${sampleUrl} (サンプル)` };
    });
  });
}

bindSource('audio-file', 'audio-sample', 'audio-name', '/sample/maou_14_shining_star.mp3', async (blob, name) => {
  await timeline.setAudio(blob, name);
  audioFile = blob;
});
bindSource('video-file', 'video-sample', 'video-name', '/sample/sample.mp4', async (blob, name) => {
  await timeline.setStaticVideo(blob, name);
  videoFile = blob;
});

durationInput.addEventListener('input', () => {
  const sec = Number(durationInput.value);
  if (sec > 0) timeline.setDynamicDuration(sec);
});

fpsInput.addEventListener('input', () => {
  const fps = Number(fpsInput.value);
  if (fps >= 1) timeline.setFps(fps);
});

exportButton.addEventListener('click', async () => {
  timeline.setEnabled(false);
  exportButton.disabled = true;
  status.textContent = '書き出し中 0%';
  try {
    const blob = await exportVideo({
      canvas,
      durationSec: Number(durationInput.value),
      fps: Number(fpsInput.value),
      audioFile,
      videoFile,
      onProgress: (ratio) => (status.textContent = `書き出し中 ${Math.min(100, Math.round(ratio * 100))}%`),
    });
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    resultVideo.src = resultUrl;
    download.href = resultUrl;
    result.hidden = false;
    status.textContent = `書き出し完了 (${(blob.size / 1024 / 1024).toFixed(2)} MB)`;
  } catch (error) {
    showError(error);
    throw error;
  } finally {
    exportButton.disabled = false;
    timeline.setEnabled(true);
  }
});
