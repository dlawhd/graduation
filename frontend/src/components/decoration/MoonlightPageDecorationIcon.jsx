/*
 * MoonlightPageDecorationIcon 역할
 *
 * 달빛 테마 상세 페이지의 바깥 배경에 보여줄 초승달과 별 장식 SVG다.
 */
export default function MoonlightPageDecorationIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* 초승달 */}
      <path
        d="M39 10C28 11 20 20 20 31C20 42 28 51 39 52C31 47 27 39 27 31C27 23 31 15 39 10Z"
        fill="currentColor"
        opacity="0.9"
      />

      {/* 별 */}
      <path
        d="M48 16L49.8 20.2L54 22L49.8 23.8L48 28L46.2 23.8L42 22L46.2 20.2L48 16Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path
        d="M16 20L17.2 22.8L20 24L17.2 25.2L16 28L14.8 25.2L12 24L14.8 22.8L16 20Z"
        fill="currentColor"
        opacity="0.68"
      />
      <circle cx="47" cy="39" r="2.2" fill="currentColor" opacity="0.62" />
    </svg>
  );
}