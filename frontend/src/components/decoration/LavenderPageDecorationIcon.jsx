/*
 * LavenderPageDecorationIcon 역할
 *
 * 라벤더 테마 상세 페이지의 바깥 배경에 보여줄 라벤더 꽃송이 장식 SVG다.
 */
export default function LavenderPageDecorationIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* 줄기 */}
      <path
        d="M22 54C25 47 27 39 30 31C33 23 36 16 42 10"
        stroke="#6E8E63"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* 라벤더 꽃송이 */}
      <ellipse cx="42" cy="12" rx="5" ry="7" fill="currentColor" opacity="0.92" />
      <ellipse cx="38" cy="18" rx="4.6" ry="6.2" fill="currentColor" opacity="0.85" />
      <ellipse cx="35" cy="24" rx="4.4" ry="5.8" fill="currentColor" opacity="0.8" />
      <ellipse cx="31" cy="30" rx="4.1" ry="5.5" fill="currentColor" opacity="0.75" />
      <ellipse cx="27" cy="36" rx="3.8" ry="5.2" fill="currentColor" opacity="0.68" />

      {/* 잎 */}
      <path
        d="M23 46C17 43 15 39 16 34C22 35 25 38 27 43"
        fill="#9CC58A"
        opacity="0.9"
      />
    </svg>
  );
}