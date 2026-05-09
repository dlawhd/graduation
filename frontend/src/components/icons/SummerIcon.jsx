import { useId } from "react";

/*
 * SummerIcon 역할
 *
 * 여름 테마를 보여주는 작은 SVG 아이콘 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 연초록/크림색 둥근 배경
 * - 따뜻한 햇살
 * - 싱그러운 초록 잎
 * - 작은 풀잎
 * - 여름빛 반짝이
 * 를 코드로 그린 아이콘이야.
 *
 * 사용하는 방법:
 * <SummerIcon />
 * <SummerIcon size={64} />
 */
function SummerIcon({ size = 28 }) {
  // 같은 아이콘이 여러 번 나와도 SVG 내부 id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const bgGradientId = `${safeId}-summer-bg`;
  const sunGradientId = `${safeId}-summer-sun`;
  const leafGradientId = `${safeId}-summer-leaf`;
  const grassGradientId = `${safeId}-summer-grass`;
  const glowGradientId = `${safeId}-summer-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="summer theme icon"
    >
      <defs>
        {/* 연초록 + 따뜻한 크림색 배경 */}
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ECFDF5" />
          <stop offset="48%" stopColor="#F7FFF8" />
          <stop offset="100%" stopColor="#FFFCEB" />
        </linearGradient>

        {/* 햇살 그라데이션 */}
        <radialGradient id={sunGradientId} cx="45%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="45%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </radialGradient>

        {/* 초록 잎 그라데이션 */}
        <linearGradient id={leafGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#BBF7D0" />
          <stop offset="45%" stopColor="#86EFAC" />
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>

        {/* 아래쪽 풀밭 그라데이션 */}
        <linearGradient id={grassGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D9F99D" />
          <stop offset="55%" stopColor="#86EFAC" />
          <stop offset="100%" stopColor="#4ADE80" />
        </linearGradient>

        {/* 뒤쪽 여름빛 */}
        <radialGradient id={glowGradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FDE68A" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#86EFAC" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#86EFAC" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 전체 원형 배경 */}
      <circle cx="14" cy="14" r="13" fill={`url(#${bgGradientId})`} />

      {/* 은은한 테두리 */}
      <circle
        cx="14"
        cy="14"
        r="12.5"
        fill="none"
        stroke="#BBF7D0"
        strokeWidth="1"
        opacity="0.9"
      />

      {/* 뒤쪽 따뜻한 여름빛 */}
      <circle cx="18.2" cy="9.4" r="6.2" fill={`url(#${glowGradientId})`} />

      {/* 햇살 */}
      <circle
        cx="19.1"
        cy="8.7"
        r="3.5"
        fill={`url(#${sunGradientId})`}
        stroke="#FBBF24"
        strokeWidth="0.65"
      />

      {/* 햇살 작은 빛줄기 */}
      <path
        d="M19.1 3.9V5.1"
        stroke="#F59E0B"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <path
        d="M19.1 12.3V13.5"
        stroke="#F59E0B"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <path
        d="M14.9 8.7H16.1"
        stroke="#F59E0B"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <path
        d="M22.1 8.7H23.3"
        stroke="#F59E0B"
        strokeWidth="0.8"
        strokeLinecap="round"
      />

      {/* 아래쪽 풀밭 */}
      <path
        d="M4.8 21.1C7.2 18.9 10.3 18.2 13.5 18.8C16.9 19.5 19.8 18.7 23.4 17.2C23 20.9 19.8 23.3 14.7 23.3C10.2 23.3 6.8 22.5 4.8 21.1Z"
        fill={`url(#${grassGradientId})`}
        stroke="#4ADE80"
        strokeWidth="0.65"
        strokeLinejoin="round"
      />

      {/* 큰 잎 1 */}
      <path
        d="M8.2 15.8C8.8 11.9 11.8 9.9 15.5 10.4C15 14.4 11.9 16.4 8.2 15.8Z"
        fill={`url(#${leafGradientId})`}
        stroke="#22C55E"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />

      {/* 큰 잎 1의 잎맥 */}
      <path
        d="M9.5 15C11.1 13.7 12.8 12.5 14.4 11.3"
        stroke="#ECFDF5"
        strokeWidth="0.7"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* 큰 잎 2 */}
      <path
        d="M13.4 17.2C14.3 13.7 17.2 12.2 20.2 13.1C19.1 16.5 16.2 18.1 13.4 17.2Z"
        fill="#86EFAC"
        stroke="#22C55E"
        strokeWidth="0.65"
        strokeLinejoin="round"
      />

      {/* 큰 잎 2의 잎맥 */}
      <path
        d="M14.6 16.6C16.1 15.7 17.4 14.8 19 13.8"
        stroke="#F0FDF4"
        strokeWidth="0.65"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />

      {/* 작은 풀잎들 */}
      <path
        d="M8.2 21.2C8.3 19.6 8.9 18.4 10.1 17.5"
        stroke="#16A34A"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M11.2 21.6C11.4 20 12.1 18.8 13.2 17.9"
        stroke="#22C55E"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M17.5 21.5C17.8 19.9 18.7 18.8 20 18.1"
        stroke="#16A34A"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* 작은 반짝이 1 */}
      <path
        d="M6.8 7.2L7.3 8.4L8.5 8.9L7.3 9.4L6.8 10.6L6.3 9.4L5.1 8.9L6.3 8.4L6.8 7.2Z"
        fill="#FACC15"
        opacity="0.9"
      />

      {/* 작은 반짝이 2 */}
      <path
        d="M22.2 15.4L22.6 16.2L23.4 16.6L22.6 17L22.2 17.8L21.8 17L21 16.6L21.8 16.2L22.2 15.4Z"
        fill="#FFFFFF"
        opacity="0.9"
      />

      {/* 작은 초록 점 */}
      <circle cx="6.3" cy="15.2" r="0.7" fill="#86EFAC" />
      <circle cx="12.8" cy="6.6" r="0.55" fill="#BBF7D0" />
      <circle cx="23" cy="11.8" r="0.55" fill="#FDE68A" />
    </svg>
  );
}

export default SummerIcon;