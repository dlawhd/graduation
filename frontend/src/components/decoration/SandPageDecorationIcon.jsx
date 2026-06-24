/*
 * SandPageDecorationIcon 역할
 *
 * 모래 테마 상세 페이지의 바깥 배경에 보여줄 조개껍데기 장식 SVG다.
 */
export default function SandPageDecorationIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* 조개껍데기 */}
      <path
        d="M12 42C12 25 21 14 32 14C43 14 52 25 52 42C52 46 49 50 45 50H19C15 50 12 46 12 42Z"
        fill="currentColor"
        opacity="0.83"
      />

      {/* 조개 무늬 */}
      <path d="M32 14V50" stroke="white" strokeWidth="2.5" opacity="0.75" />
      <path d="M24 18L26 49" stroke="white" strokeWidth="2" opacity="0.55" />
      <path d="M40 18L38 49" stroke="white" strokeWidth="2" opacity="0.55" />
      <path d="M18 26L22 49" stroke="white" strokeWidth="2" opacity="0.45" />
      <path d="M46 26L42 49" stroke="white" strokeWidth="2" opacity="0.45" />
    </svg>
  );
}