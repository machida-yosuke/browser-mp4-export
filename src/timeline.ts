import type { Preview } from './preview';

type Source = { name: string; durationSec: number };

const formatSec = (sec: number) => sec.toFixed(2);

export class Timeline {
  private readonly preview: Preview;
  private readonly playButton: HTMLButtonElement;
  private readonly time: HTMLSpanElement;
  private readonly seekBar: HTMLInputElement;
  private readonly lanes: HTMLDivElement;
  private readonly videoLane: HTMLDivElement;
  private readonly audioLane: HTMLDivElement;
  private readonly playhead: HTMLDivElement;
  private dynamicSec: number;
  private staticVideo: Source | null = null;
  private audio: Source | null = null;
  private t = 0;
  private enabled = true;
  private playing = false;
  private clockOrigin = 0;
  private frameId = 0;

  constructor(root: HTMLElement, preview: Preview, dynamicSec: number) {
    this.preview = preview;
    this.dynamicSec = dynamicSec;
    root.classList.add('timeline');
    root.innerHTML = `
      <div class="transport">
        <button data-testid="play" type="button">再生</button>
        <span data-testid="time" class="time"></span>
      </div>
      <input data-testid="seek" type="range" min="0" step="0.01" value="0" />
      <div class="tracks">
        <div class="track-labels"><span>映像</span><span>音声</span></div>
        <div data-testid="lanes" class="lanes">
          <div data-testid="video-lane" class="lane"></div>
          <div data-testid="audio-lane" class="lane"></div>
          <div class="playhead"></div>
        </div>
      </div>
    `;
    const pick = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
    this.playButton = pick('[data-testid=play]');
    this.time = pick('[data-testid=time]');
    this.seekBar = pick('[data-testid=seek]');
    this.lanes = pick('[data-testid=lanes]');
    this.videoLane = pick('[data-testid=video-lane]');
    this.audioLane = pick('[data-testid=audio-lane]');
    this.playhead = pick('.playhead');

    this.playButton.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    this.seekBar.addEventListener('input', () => this.seek(Number(this.seekBar.value)));
    this.lanes.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.lanes.setPointerCapture(e.pointerId);
      this.seekToPointer(e);
    });
    this.lanes.addEventListener('pointermove', (e) => {
      if (this.lanes.hasPointerCapture(e.pointerId)) this.seekToPointer(e);
    });

    this.preview.setDynamicDuration(dynamicSec);
    this.layout();
  }

  setDynamicDuration(sec: number): void {
    this.dynamicSec = sec;
    this.preview.setDynamicDuration(sec);
    this.layout();
  }

  async setStaticVideo(blob: Blob, name: string): Promise<void> {
    this.pause();
    this.staticVideo = { name, durationSec: await this.preview.loadVideo(blob) };
    this.layout();
  }

  async setAudio(blob: Blob, name: string): Promise<void> {
    this.pause();
    this.audio = { name, durationSec: await this.preview.loadAudio(blob) };
    this.layout();
  }

  setEnabled(enabled: boolean): void {
    this.pause();
    this.enabled = enabled;
    this.preview.setActive(enabled);
    this.playButton.disabled = !enabled;
    this.seekBar.disabled = !enabled;
    this.lanes.classList.toggle('disabled', !enabled);
    if (enabled) this.preview.show(this.t);
  }

  private get totalSec(): number {
    return this.dynamicSec + (this.staticVideo?.durationSec ?? 0);
  }

  private layout(): void {
    const total = this.totalSec;
    this.t = Math.min(this.t, total);
    this.seekBar.max = String(total);

    this.videoLane.replaceChildren(this.clip(`動的 (${formatSec(this.dynamicSec)} s)`, 0, this.dynamicSec));
    if (this.staticVideo) {
      const { name, durationSec } = this.staticVideo;
      this.videoLane.append(this.clip(`静的: ${name} (${formatSec(durationSec)} s)`, this.dynamicSec, durationSec));
    }
    this.audioLane.replaceChildren();
    if (this.audio) {
      const { name, durationSec } = this.audio;
      this.audioLane.append(this.clip(`音声: ${name} (${formatSec(durationSec)} s)`, 0, Math.min(durationSec, total)));
    }

    if (this.playing) this.restartClock();
    else this.preview.show(this.t);
    this.updateIndicator();
  }

  private clip(label: string, startSec: number, durationSec: number): HTMLDivElement {
    const total = this.totalSec;
    const el = document.createElement('div');
    el.className = 'clip';
    el.dataset.testid = 'clip';
    el.textContent = label;
    el.title = label;
    el.style.left = `${(startSec / total) * 100}%`;
    el.style.width = `${(durationSec / total) * 100}%`;
    return el;
  }

  private updateIndicator(): void {
    const total = this.totalSec;
    this.time.textContent = `${formatSec(this.t)} / ${formatSec(total)} s`;
    this.seekBar.value = String(this.t);
    this.playhead.style.left = `${(this.t / total) * 100}%`;
    this.playButton.textContent = this.playing ? '停止' : '再生';
  }

  private seekToPointer(e: PointerEvent): void {
    const rect = this.lanes.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    this.seek(ratio * this.totalSec);
  }

  private seek(t: number): void {
    if (!this.enabled) return;
    this.t = Math.min(Math.max(0, t), this.totalSec);
    if (this.playing) this.restartClock();
    else this.preview.show(this.t);
    this.updateIndicator();
  }

  private play(): void {
    if (!this.enabled) return;
    if (this.t >= this.totalSec) this.t = 0;
    this.playing = true;
    this.restartClock();
    this.updateIndicator();
    this.frameId = requestAnimationFrame(() => this.frame());
  }

  private pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.frameId);
    this.preview.stop();
    this.preview.show(this.t);
    this.updateIndicator();
  }

  private restartClock(): void {
    this.clockOrigin = performance.now() - this.t * 1000;
    this.preview.start(this.t);
  }

  private frame(): void {
    const total = this.totalSec;
    this.t = Math.min((performance.now() - this.clockOrigin) / 1000, total);
    if (this.t >= total) {
      this.pause();
      return;
    }
    this.preview.tick(this.t);
    this.updateIndicator();
    this.frameId = requestAnimationFrame(() => this.frame());
  }
}
