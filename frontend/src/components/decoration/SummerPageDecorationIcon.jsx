/*
 * SummerPageDecorationIcon 역할
 *
 * 여름 테마 상세 페이지의 바깥 배경에 보여줄 잎사귀 장식 SVG다.
 * currentColor를 사용해서 테마 색상을 그대로 따라간다.
 */
export default function SummerPageDecorationIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* 큰 잎 */}
      <path
        d="M18 42C18 22 33 12 51 14C49 32 39 47 23 50C20 48 18 45 18 42Z"
        fill="currentColor"
        opacity="0.85"
      />

      {/* 잎맥 */}
      <path d="M22 46C30 37 39 28 49 18" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      <path d="M31 36L26 29" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
      <path d="M38 30L33 24" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.65" />

      {/* 작은 잎 */}
      <path
        d="M13 48C12 38 19 31 30 29C29 40 24 49 15 52C14 51 13 50 13 48Z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}