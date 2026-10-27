import '@picocss/pico/css/pico.min.css';
import './style.css';
import { exportVideo } from './export';
import { Preview } from './preview';
import { Timeline } from './timeline';

const RESOLUTIONS = ['1920x1080', '1280x720', '854x480', '640x360'];
const INITIAL_RESOLUTION = '1280x720';
const INITIAL_BITRATE_KBPS = 2000;
const INITIAL_TOTAL_SEC = 30;
const INITIAL_DURATION_SEC = 3;
const INITIAL_FPS = 30;
const INITIAL_TEXT = 'ここにテキストが入る';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="container">
    <article class="preview">
      <canvas id="canvas"></canvas>
      <div id="transport"></div>
    </article>
    <label>テキスト <textarea id="text" rows="2">${INITIAL_TEXT}</textarea></label>
    <details id="advanced" class="advanced">
      <summary>詳細設定</summary>
      <div id="timeline"></div>
      <div class="grid">
        <label>全体の秒数 <input id="total" type="number" min="1" step="1" value="${INITIAL_TOTAL_SEC}" /></label>
        <label>動的パートの秒数 <input id="duration" type="number" min="0.5" step="0.5" value="${INITIAL_DURATION_SEC}" /></label>
        <label>フレームレート <input id="fps" type="number" min="1" max="120" step="1" value="${INITIAL_FPS}" /></label>
      </div>
      <div class="grid">
        <label>解像度 <select id="resolution">${RESOLUTIONS.map((r) => `<option value="${r}"${r === INITIAL_RESOLUTION ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
        <label>映像ビットレート (kbps) <input id="bitrate" type="number" min="100" step="100" value="${INITIAL_BITRATE_KBPS}" /></label>
      </div>
      <fieldset>
        <legend>音声 (mp3 / wav、動画全体に敷く)</legend>
        <input id="audio-file" type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" />
        <div class="source-sample">
          <button id="audio-sample" type="button" class="secondary outline">サンプルを使う</button>
          <span id="audio-name">未指定</span>
        </div>
      </fieldset>
      <fieldset>
        <legend>静的パートの動画 (mp4)</legend>
        <input id="video-file" type="file" accept="video/mp4,.mp4" />
        <div class="source-sample">
          <button id="video-sample" type="button" class="secondary outline">サンプルを使う</button>
          <span id="video-name">未指定</span>
        </div>
      </fieldset>
    </details>
    <button id="export" type="button">書き出し</button>
    <p data-testid="status" id="status">待機中</p>
    <section id="result" hidden>
      <video id="result-video" controls></video>
      <a id="download" role="button" class="secondary" download="browser-mp4-export.mp4">ダウンロード</a>
    </section>
  </main>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('canvas');
const totalInput = $<HTMLInputElement>('total');
const durationInput = $<HTMLInputElement>('duration');
const fpsInput = $<HTMLInputElement>('fps');
const resolutionSelect = $<HTMLSelectElement>('resolution');
const bitrateInput = $<HTMLInputElement>('bitrate');
const textInput = $<HTMLTextAreaElement>('text');
const exportButton = $<HTMLButtonElement>('export');
const status = $<HTMLParagraphElement>('status');
const result = $<HTMLElement>('result');
const resultVideo = $<HTMLVideoElement>('result-video');
const download = $<HTMLAnchorElement>('download');

function applyResolution(value: string): void {
  const [width, height] = value.split('x').map(Number);
  canvas.width = width;
  canvas.height = height;
}
applyResolution(resolutionSelect.value);
let bitrateKbps = INITIAL_BITRATE_KBPS;

const timeline = new Timeline(
  { transport: $('transport'), tracks: $('timeline') },
  new Preview(canvas.getContext('2d')!),
  INITIAL_TOTAL_SEC,
  INITIAL_DURATION_SEC,
  INITIAL_FPS,
);
timeline.setText(textInput.value);

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
): () => Promise<void> {
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
  const loadSample = () =>
    apply(async () => {
      const response = await fetch(sampleUrl);
      if (!response.ok) throw new Error(`${sampleUrl} の取得に失敗 (${response.status})`);
      const name = sampleUrl.split('/').pop()!;
      return { blob: await response.blob(), name, label: `${sampleUrl} (サンプル)` };
    });
  $<HTMLButtonElement>(buttonId).addEventListener('click', () => void loadSample());
  return loadSample;
}

const loadAudioSample = bindSource('audio-file', 'audio-sample', 'audio-name', '/sample/maou_14_shining_star.mp3', async (blob, name) => {
  await timeline.setAudio(blob, name);
  audioFile = blob;
});
const loadVideoSample = bindSource('video-file', 'video-sample', 'video-name', '/sample/sample.mp4', async (blob, name) => {
  await timeline.setStaticVideo(blob, name);
  videoFile = blob;
});
void Promise.all([loadAudioSample(), loadVideoSample()]);

totalInput.addEventListener('input', () => {
  const sec = Number(totalInput.value);
  if (sec > 0) timeline.setTotalDuration(sec);
});

durationInput.addEventListener('input', () => {
  const sec = Number(durationInput.value);
  if (sec > 0) timeline.setDynamicDuration(sec);
});

textInput.addEventListener('input', () => timeline.setText(textInput.value));

fpsInput.addEventListener('input', () => {
  const fps = Number(fpsInput.value);
  if (fps >= 1) timeline.setFps(fps);
});

resolutionSelect.addEventListener('change', () => {
  applyResolution(resolutionSelect.value);
  timeline.refresh();
});

bitrateInput.addEventListener('input', () => {
  const kbps = Number(bitrateInput.value);
  if (kbps >= 1) bitrateKbps = kbps;
});

exportButton.addEventListener('click', async () => {
  timeline.setEnabled(false);
  exportButton.disabled = true;
  // 書き出し中に canvas のサイズが変わると、エンコード途中でフレームの寸法が変わってしまう
  resolutionSelect.disabled = true;
  status.textContent = '書き出し中 0%';
  try {
    const blob = await exportVideo({
      canvas,
      totalSec: Number(totalInput.value),
      dynamicSec: Number(durationInput.value),
      fps: Number(fpsInput.value),
      videoBitrateKbps: bitrateKbps,
      text: textInput.value,
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
    resolutionSelect.disabled = false;
    timeline.setEnabled(true);
  }
});
