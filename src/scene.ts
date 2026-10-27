const CHAR_INTERVAL_SEC = 0.06;
const CHAR_ENTER_SEC = 0.3;
const CHAR_RISE_PX = 24;
const CHAR_START_SCALE = 1.4;
const SWAY_AMPLITUDE_PX = 6;
const SWAY_PERIOD_SEC = 2;

const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;

export function drawScene(ctx: CanvasRenderingContext2D, t: number, width: number, height: number, text: string): void {
  const hue = (t * 40) % 360;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue}, 70%, 35%)`);
  gradient.addColorStop(1, `hsl(${(hue + 120) % 360}, 70%, 20%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const radius = Math.min(width, height) * 0.12;
  const x = width / 2 + Math.cos(t * 2) * width * 0.3;
  const y = height / 2 + Math.sin(t * 3) * height * 0.25;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  const size = radius * 1.4;
  ctx.save();
  ctx.translate(width - x, height - y);
  ctx.rotate(t * 1.5);
  ctx.fillStyle = `hsl(${(hue + 200) % 360}, 90%, 60%)`;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(height * 0.08)}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${t.toFixed(2)} s`, width * 0.04, height * 0.05);

  drawText(ctx, t, width, height, text);
}

function drawText(ctx: CanvasRenderingContext2D, t: number, width: number, height: number, text: string): void {
  if (text === '') return;
  const fontSize = height * 0.09;
  const lineHeight = fontSize * 1.2;
  const lines = text.split('\n').map((line) => Array.from(line));
  const charCount = lines.reduce((sum, chars) => sum + chars.length, 0);
  if (charCount === 0) return;

  ctx.save();
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = fontSize * 0.08;
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';

  const settledAt = (charCount - 1) * CHAR_INTERVAL_SEC + CHAR_ENTER_SEC;
  const sway =
    t > settledAt ? Math.sin(((t - settledAt) / SWAY_PERIOD_SEC) * Math.PI * 2) * SWAY_AMPLITUDE_PX : 0;
  const firstLineY = height / 2 - ((lines.length - 1) * lineHeight) / 2 + sway;

  let index = 0;
  lines.forEach((chars, row) => {
    const widths = chars.map((char) => ctx.measureText(char).width);
    const lineWidth = widths.reduce((sum, w) => sum + w, 0);
    let x = width / 2 - lineWidth / 2;
    const y = firstLineY + row * lineHeight;
    chars.forEach((char, i) => {
      const progress = Math.min(1, (t - index * CHAR_INTERVAL_SEC) / CHAR_ENTER_SEC);
      index++;
      const cx = x + widths[i] / 2;
      x += widths[i];
      if (progress <= 0) return;
      const eased = easeOutCubic(progress);
      const scale = CHAR_START_SCALE + (1 - CHAR_START_SCALE) * eased;
      ctx.save();
      ctx.globalAlpha = eased;
      ctx.translate(cx, y + CHAR_RISE_PX * (1 - eased));
      ctx.scale(scale, scale);
      ctx.strokeText(char, 0, 0);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });
  });
  ctx.restore();
}
