import SpringIcon from "../../../components/icons/SpringIcon";
import SpringParticleIcon from "../../../components/icons/SpringParticleIcon";

export const SPRING_PREVIEW_PRESET = {
  previewCardStyle: { background: "linear-gradient(135deg, #fff1f4 0%, #fff7fb 45%, #fff6eb 100%)" },
  badgeStyle: { backgroundColor: "#ffeff5", color: "#e63c74" },
  themeBadgeStyle: { backgroundColor: "#fff3e8", color: "#ff8a3d" },
  glowStyle: { background: "radial-gradient(circle, rgba(255,108,163,0.35) 0%, rgba(255,108,163,0.06) 65%, rgba(255,108,163,0) 100%)" },
  lidStyle: { background: "linear-gradient(90deg, #ff6391 0%, #ffb25e 100%)" },
  jarBodyStyle: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,248,251,0.92) 55%, rgba(255,241,228,0.96) 100%)",
    border: "4px solid rgba(255,255,255,0.8)",
    boxShadow: "0 24px 45px rgba(255, 118, 160, 0.20)",
  },
  labelPillStyle: { backgroundColor: "rgba(255,255,255,0.92)", color: "#5b5560" },
  centerEmoji: <SpringIcon size={64} />,
  decor: [],
  accentLine: "#ff7ea8",
};

const SPRING_ACCENTS = [
  ["petal", 79, 5, 13],
  ["petal", 54, 19, 15],
  ["sparkle", 34, 23, 14],
  ["flower", 72, 40, 13],
  ["sparkle", 78, 46, 17],
  ["flower", 80, 55, 17],
  ["sparkle", 70, 63, 18],
  ["sparkle", 79, 66, 14],
  ["flower", 75, 84, 19],
];

/** 기본 테마 선택 화면에서는 움직임 없이 봄 장식의 한 장면을 보여준다. */
export function SpringJarAccents() {
  return SPRING_ACCENTS.map(([variant, left, top, size]) => (
    <span key={left + "-" + top} className="absolute z-20 -translate-x-1/2" style={{ left: left + "%", top: top + "%" }}>
      <SpringParticleIcon variant={variant} size={size} />
    </span>
  ));
}

/** 시작 화면과 테마 편집 화면이 같은 저금통 외형을 사용한다. 안쪽 장식은 화면에 맞춰 전달한다. */
export default function DefaultJarArtwork({ preset, children }) {
  return (
    <div className="relative h-[300px] w-[240px]" data-default-jar-artwork aria-hidden="true">
      {/* 뚜껑 */}
      <div className="absolute left-1/2 top-0 z-20 h-[48px] w-[180px] -translate-x-1/2 rounded-full shadow-xl"
        style={preset.lidStyle} />
      <div className="absolute left-1/2 top-[17px] z-30 h-[7px] w-[58px] -translate-x-1/2 rounded-full"
        style={{ backgroundColor: "rgba(80, 70, 70, 0.72)" }} />

      {/* 몸통 */}
      <div className="absolute left-1/2 top-[36px] z-10 h-[240px] w-[195px] -translate-x-1/2 overflow-hidden"
        style={{ ...preset.jarBodyStyle, borderRadius: "42% 42% 28% 28%" }}>
        {/* 유리 반짝임 */}
        <div className="absolute left-[20px] top-[24px] z-30 h-[130px] w-[14px] rounded-full"
          style={{ background: "rgba(255,255,255,0.72)", filter: "blur(2px)" }} />
        <div className="absolute right-[18px] top-[36px] z-30 h-[80px] w-[8px] rounded-full"
          style={{ background: "rgba(255,255,255,0.45)", filter: "blur(2px)" }} />
        {children}

        {/* 안쪽 내용 */}
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3">
          <div className="flex h-[70px] w-[70px] items-center justify-center text-[52px]">
            {preset.centerEmoji}
          </div>
        </div>
      </div>

      {/* 그림자 */}
      <div className="absolute bottom-0 left-1/2 h-[20px] w-[130px] -translate-x-1/2 rounded-full"
        style={{ backgroundColor: "rgba(100, 116, 139, 0.20)", filter: "blur(8px)" }} />
    </div>
  );
}
