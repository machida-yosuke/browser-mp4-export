import './style.css';
import { exportVideo } from './export';
import { drawScene } from './scene';

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <h1>guitarfish</h1>
  <canvas id="canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
  <div class="controls">
    <label>動的パートの秒数 <input id="duration" type="number" min="0.5" step="0.5" value="3" /></label>
    <fieldset>
      <legend>動的パートの音声 (mp3 / wav)</legend>
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
    <a id="download" download="guitarfish.mp4">ダウンロード</a>
  </div>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('canvas');
const durationInput = $<HTMLInputElement>('duration');
const exportButton = $<HTMLButtonElement>('export');
const status = $<HTMLParagraphElement>('status');
const result = $<HTMLDivElement>('result');
const resultVideo = $<HTMLVideoElement>('result-video');
const download = $<HTMLAnchorElement>('download');
const ctx = canvas.getContext('2d')!;

let audioFile: Blob | undefined;
let videoFile: Blob | undefined;
let exporting = false;
let resultUrl: string | null = null;

function bindSource(
  inputId: string,
  buttonId: string,
  nameId: string,
  sampleUrl: string,
  set: (blob: Blob) => void,
): void {
  const name = $<HTMLSpanElement>(nameId);
  $<HTMLInputElement>(inputId).addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    set(file);
    name.textContent = file.name;
  });
  $<HTMLButtonElement>(buttonId).addEventListener('click', async () => {
    try {
      const response = await fetch(sampleUrl);
      if (!response.ok) throw new Error(`${sampleUrl} の取得に失敗 (${response.status})`);
      set(await response.blob());
      name.textContent = `${sampleUrl} (サンプル)`;
    } catch (error) {
      status.textContent = `エラー: ${error instanceof Error ? error.message : String(error)}`;
      throw error;
    }
  });
}

bindSource('audio-file', 'audio-sample', 'audio-name', '/sample/tone.wav', (b) => (audioFile = b));
bindSource('video-file', 'video-sample', 'video-name', '/sample/sample.mp4', (b) => (videoFile = b));

const startedAt = performance.now();
function preview(): void {
  if (!exporting) drawScene(ctx, (performance.now() - startedAt) / 1000, WIDTH, HEIGHT);
  requestAnimationFrame(preview);
}
requestAnimationFrame(preview);

exportButton.addEventListener('click', async () => {
  exporting = true;
  exportButton.disabled = true;
  status.textContent = '書き出し中 0%';
  try {
    const blob = await exportVideo({
      canvas,
      durationSec: Number(durationInput.value),
      fps: FPS,
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
    status.textContent = `エラー: ${error instanceof Error ? error.message : String(error)}`;
    throw error;
  } finally {
    exporting = false;
    exportButton.disabled = false;
  }
});
