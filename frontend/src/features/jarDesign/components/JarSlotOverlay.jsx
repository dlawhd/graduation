import { slotDimensions } from "../slotGeometry.mjs";

/** 편집 화면과 향후 Jar 화면이 같은 크기·위치 공식을 재사용하는 장식용 투입구다. */
export default function JarSlotOverlay({ slot }) {
  const { width, height } = slotDimensions(slot.sizeRatio);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute rounded-full border border-white/70 bg-slate-900 shadow-inner"
      style={{ left: `${slot.centerX * 100}%`, top: `${slot.centerY * 100}%`,
        width: `${width * 100}%`, height: `${height * 100}%`, transform: "translate(-50%, -50%)" }} />
  );
}
