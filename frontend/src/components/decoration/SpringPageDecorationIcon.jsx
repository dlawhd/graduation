/*
 * SpringPageDecorationIcon 역할
 *
 * 봄 테마 상세 페이지의 바깥 배경에 보여줄 벚꽃잎 장식 SVG다.
 * className으로 크기, 위치, 색상을 부모 컴포넌트에서 조절한다.
 */
export default function SpringPageDecorationIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* 벚꽃 중심 */}
      <circle cx="32" cy="32" r="5" fill="currentColor" opacity="0.9" />

      {/* 벚꽃잎 */}
      <path d="M32 10C38 10 41 16 38 22C35 27 29 27 26 22C23 16 26 10 32 10Z" fill="currentColor" opacity="0.75" />
      <path d="M50 23C54 28 51 34 45 36C39 38 35 33 36 27C37 21 45 19 50 23Z" fill="currentColor" opacity="0.72" />
      <path d="M43 47C40 53 33 54 28 50C23 46 24 40 30 38C36 36 46 40 43 47Z" fill="currentColor" opacity="0.75" />
      <path d="M21 49C14 48 10 42 12 36C14 30 20 29 24 34C28 39 28 50 21 49Z" fill="currentColor" opacity="0.72" />
      <path d="M10 23C15 19 23 21 24 27C25 33 21 38 15 36C9 34 6 28 10 23Z" fill="currentColor" opacity="0.75" />
    </svg>
  );
}