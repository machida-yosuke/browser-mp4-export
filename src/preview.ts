import { drawScene } from './scene';

const DRIFT_TOLERANCE_SEC = 0.1;

function loadMetadata(media: HTMLMediaElement, blob: Blob, previousUrl: string | null): Promise<string> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const onLoaded = () => {
      media.removeEventListener('error', onError);
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      resolve(url);
    };
    const onError = () => {
      media.removeEventListener('loadedmetadata', onLoaded);
      URL.revokeObjectURL(url);
      reject(new Error(`メディアを読み込めない (${media.error?.message ?? 'unknown'})`));
    };
    media.addEventListener('loadedmetadata', onLoaded, { once: true });
    media.addEventListener('error', onError, { once: true });
    media.src = url;
  });
}

function play(media: HTMLMediaElement): void {
  media.play().catch((error: unknown) => {
    // 再生開始前に pause() すると AbortError で reject される。これは意図した停止なので無視する
    if (error instanceof DOMException && error.name === 'AbortError') return;
    throw error;
  });
}

export class Preview {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;
  private readonly video = document.createElement('video');
  private readonly audio = document.createElement('audio');
  private videoUrl: string | null = null;
  private audioUrl: string | null = null;
  private dynamicSec = 0;
  private playing = false;
  private active = true;
  private showingVideo = false;
  private seeking = false;
  private pendingSeek: number | null = null;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.width = ctx.canvas.width;
    this.height = ctx.canvas.height;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.audio.preload = 'auto';
    this.video.addEventListener('seeked', () => this.onSeeked());
  }

  setDynamicDuration(sec: number): void {
    this.dynamicSec = sec;
  }

  async loadVideo(blob: Blob): Promise<number> {
    this.video.pause();
    this.videoUrl = await loadMetadata(this.video, blob, this.videoUrl);
    return this.video.duration;
  }

  async loadAudio(blob: Blob): Promise<number> {
    this.audio.pause();
    this.audioUrl = await loadMetadata(this.audio, blob, this.audioUrl);
    return this.audio.duration;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.stop();
  }

  show(t: number): void {
    if (!this.active) return;
    this.syncAudioPosition(t);
    if (this.isDynamic(t)) {
      this.showingVideo = false;
      drawScene(this.ctx, t, this.width, this.height);
      return;
    }
    this.showingVideo = true;
    this.requestSeek(t - this.dynamicSec);
  }

  start(t: number): void {
    if (!this.active) return;
    this.playing = true;
    this.pendingSeek = null;
    this.audio.pause();
    if (this.audioUrl && t < this.audio.duration) {
      this.audio.currentTime = t;
      play(this.audio);
    }
    this.tick(t);
  }

  tick(t: number): void {
    if (!this.active || !this.playing) return;
    if (this.isDynamic(t)) {
      this.showingVideo = false;
      if (!this.video.paused) this.video.pause();
      drawScene(this.ctx, t, this.width, this.height);
      return;
    }
    this.showingVideo = true;
    const local = t - this.dynamicSec;
    if (local < this.video.duration) {
      if (Math.abs(this.video.currentTime - local) > DRIFT_TOLERANCE_SEC) this.video.currentTime = local;
      if (this.video.paused) play(this.video);
    }
    this.drawVideo();
  }

  stop(): void {
    this.playing = false;
    this.video.pause();
    this.audio.pause();
  }

  private isDynamic(t: number): boolean {
    return !this.videoUrl || t < this.dynamicSec;
  }

  private syncAudioPosition(t: number): void {
    if (this.audioUrl && t < this.audio.duration) this.audio.currentTime = t;
  }

  private requestSeek(local: number): void {
    this.pendingSeek = local;
    if (!this.seeking) this.applyPendingSeek();
  }

  private applyPendingSeek(): void {
    if (this.pendingSeek === null) return;
    this.seeking = true;
    this.video.currentTime = this.pendingSeek;
    this.pendingSeek = null;
  }

  private onSeeked(): void {
    this.seeking = false;
    if (this.pendingSeek !== null) {
      this.applyPendingSeek();
      return;
    }
    if (this.active && !this.playing && this.showingVideo) this.drawVideo();
  }

  private drawVideo(): void {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const { videoWidth, videoHeight } = this.video;
    const scale = Math.min(this.width / videoWidth, this.height / videoHeight);
    const w = videoWidth * scale;
    const h = videoHeight * scale;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.drawImage(this.video, (this.width - w) / 2, (this.height - h) / 2, w, h);
  }
}
