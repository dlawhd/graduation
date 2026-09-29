// CSS 크기와 무관한 원본 좌표를 구하고 캔버스 밖 입력을 제한한다.
export function drawingPoint(clientX, clientY, rect, size) {
  const clamp = (value) => Math.max(0, Math.min(size, value));
  return { x: clamp((clientX - rect.left) / rect.width * size), y: clamp((clientY - rect.top) / rect.height * size) };
}

/** 어느 방향으로 드래그해도 동일한 도형 경계를 만든다. */
export function drawShape(ctx, tool, start, end, fill) {
  const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
  ctx.beginPath();
  if (tool === "line") { ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); }
  if (tool === "rectangle") ctx.rect(x, y, w, h);
  if (tool === "ellipse") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  if (tool === "triangle") {
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  }
  if (fill && tool !== "line") ctx.fill();
  ctx.stroke();
}

/** 모두 지운 흰 그림을 업로드하지 않도록 실제 유색 픽셀을 확인한다. */
export function hasDrawingPixels(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && (data[i] < 255 || data[i + 1] < 255 || data[i + 2] < 255)) return true;
  }
  return false;
}
