/*
 * AutumnPageDecorationIcon 역할
 *
 * 가을 테마 상세 페이지의 바깥 배경에 보여줄 단풍잎 장식 SVG다.
 */
export default function AutumnPageDecorationIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* 단풍잎 */}
      <path
        d="M31 10L35 20L45 14L43 25L54 25L46 33L54 41L43 40L45 51L35 44L31 54L27 44L17 51L19 40L8 41L16 33L8 25L19 25L17 14L27 20L31 10Z"
        fill="currentColor"
        opacity="0.82"
      />

      {/* 잎 줄기 */}
      <path
        d="M31 34C31 40 31 47 30 56"
        stroke="#8C4A23"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}