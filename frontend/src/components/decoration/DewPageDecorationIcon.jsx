/*
 * DewPageDecorationIcon 역할
 *
 * 이슬 테마 상세 페이지의 바깥 배경에 보여줄 물방울 장식 SVG다.
 */
export default function DewPageDecorationIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* 메인 물방울 */}
      <path
        d="M32 10C39 20 47 28 47 38C47 47 40 54 32 54C24 54 17 47 17 38C17 28 25 20 32 10Z"
        fill="currentColor"
        opacity="0.82"
      />

      {/* 물방울 하이라이트 */}
      <path
        d="M27 22C24 26 22 30 22 35"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="25" cy="38" r="2" fill="white" opacity="0.7" />

      {/* 작은 물방울 */}
      <circle cx="47" cy="18" r="5" fill="currentColor" opacity="0.45" />
    </svg>
  );
}