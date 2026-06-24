/*
 * WinterPageDecorationIcon 역할
 *
 * 겨울 테마 상세 페이지의 바깥 배경에 보여줄 눈송이 장식 SVG다.
 */
export default function WinterPageDecorationIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.9">
        {/* 눈송이 중심 축 */}
        <path d="M32 10V54" />
        <path d="M10 32H54" />
        <path d="M16 16L48 48" />
        <path d="M48 16L16 48" />

        {/* 눈송이 가지 */}
        <path d="M32 10L27 16" />
        <path d="M32 10L37 16" />
        <path d="M32 54L27 48" />
        <path d="M32 54L37 48" />
        <path d="M10 32L16 27" />
        <path d="M10 32L16 37" />
        <path d="M54 32L48 27" />
        <path d="M54 32L48 37" />
      </g>
    </svg>
  );
}