export function drawScene(ctx: CanvasRenderingContext2D, t: number, width: number, height: number): void {
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
}
