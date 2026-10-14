export const isHexColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** 밝기·채도·색조를 화면과 실제 펜에서 똑같이 사용하는 6자리 색상 코드로 바꾼다. */
export function hsvToHex({ h, s, v }) {
  const hue = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360 / 60;
  const saturation = clamp(s), value = clamp(v);
  const chroma = value * saturation, x = chroma * (1 - Math.abs(hue % 2 - 1)), m = value - chroma;
  const rgb = [[chroma,x,0],[x,chroma,0],[0,chroma,x],[0,x,chroma],[x,0,chroma],[chroma,0,x]][Math.floor(hue)];
  return "#" + rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("");
}

/** 저장된 펜 색을 큰 선택 영역의 좌표로 복원한다. 잘못된 코드는 적용하지 않는다. */
export function hexToHsv(hex) {
  if (!isHexColor(hex)) return null;
  const [r,g,b] = [1,3,5].map(index => parseInt(hex.slice(index,index+2),16) / 255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max - min;
  let h = 0;
  if (delta) h = max === r ? 60 * ((g-b)/delta % 6) : max === g ? 60 * ((b-r)/delta + 2) : 60 * ((r-g)/delta + 4);
  return { h: (h + 360) % 360, s: max ? delta / max : 0, v: max };
}
