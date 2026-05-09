import { useId } from "react";

/*
 * WinterIcon 역할
 *
 * 겨울 테마를 보여주는 작은 SVG 아이콘 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 연하늘/하얀색 둥근 배경
 * - 가운데 눈송이
 * - 아래쪽 눈언덕
 * - 작은 얼음 결정
 * - 하얀 반짝이
 * 를 코드로 그린 아이콘이야.
 *
 * 사용하는 방법:
 * <WinterIcon />
 * <WinterIcon size={64} />
 */
function WinterIcon({ size = 28 }) {
  // 같은 아이콘이 여러 번 나와도 SVG 내부 id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const bgGradientId = `${safeId}-winter-bg`;
  const snowGradientId = `${safeId}-winter-snow`;
  const iceGradientId = `${safeId}-winter-ice`;
  const glowGradientId = `${safeId}-winter-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="winter theme icon"
    >
      <defs>
        {/* 연하늘 + 흰색 겨울 배경 */}
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EFFBFF" />
          <stop offset="48%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#EEF2FF" />
        </linearGradient>

        {/* 눈언덕 그라데이션 */}
        <linearGradient id={snowGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#E0F2FE" />
          <stop offset="100%" stopColor="#DBEAFE" />
        </linearGradient>

        {/* 얼음빛 눈송이 그라데이션 */}
        <linearGradient id={iceGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#BAE6FD" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>

        {/* 뒤쪽 차가운 빛 */}
        <radialGradient id={glowGradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#93C5FD" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#93C5FD" stopOpacity="0" />
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
        stroke="#BAE6FD"
        strokeWidth="1"
        opacity="0.95"
      />

      {/* 뒤쪽 겨울빛 번짐 */}
      <circle cx="15.8" cy="11.2" r="6.8" fill={`url(#${glowGradientId})`} />

      {/* 아래쪽 눈언덕 */}
      <path
        d="M4.5 20.8C6.8 18.8 9.7 18.4 12.8 19.1C15.5 19.7 18.5 18.9 23.6 17.2C23.1 21 19.6 23.4 14.4 23.3C10.2 23.3 6.8 22.6 4.5 20.8Z"
        fill={`url(#${snowGradientId})`}
        stroke="#BFDBFE"
        strokeWidth="0.65"
        strokeLinejoin="round"
      />

      {/* 눈언덕 위쪽 하이라이트 */}
      <path
        d="M6.4 20.4C8.5 19.4 10.7 19.2 13 19.8C15.4 20.3 18.5 19.4 21.8 18.4"
        stroke="#FFFFFF"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* 가운데 큰 눈송이 중심 */}
      <circle
        cx="14"
        cy="12.3"
        r="1.3"
        fill="#FFFFFF"
        stroke="#60A5FA"
        strokeWidth="0.45"
      />

      {/* 눈송이 세로 줄기 */}
      <path
        d="M14 5.7V18.9"
        stroke={`url(#${iceGradientId})`}
        strokeWidth="1.15"
        strokeLinecap="round"
      />

      {/* 눈송이 가로 줄기 */}
      <path
        d="M7.8 12.3H20.2"
        stroke={`url(#${iceGradientId})`}
        strokeWidth="1.15"
        strokeLinecap="round"
      />

      {/* 눈송이 대각선 줄기 1 */}
      <path
        d="M9.7 8L18.3 16.6"
        stroke={`url(#${iceGradientId})`}
        strokeWidth="1.05"
        strokeLinecap="round"
      />

      {/* 눈송이 대각선 줄기 2 */}
      <path
        d="M18.3 8L9.7 16.6"
        stroke={`url(#${iceGradientId})`}
        strokeWidth="1.05"
        strokeLinecap="round"
      />

      {/* 눈송이 작은 가지들 */}
      <path
        d="M14 7.5L12.7 6.5"
        stroke="#93C5FD"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
      <path
        d="M14 7.5L15.3 6.5"
        stroke="#93C5FD"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
      <path
        d="M14 17.1L12.7 18.1"
        stroke="#93C5FD"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
      <path
        d="M14 17.1L15.3 18.1"
        stroke="#93C5FD"
        strokeWidth="0.65"
        strokeLinecap="round"
      />

      <path
        d="M9.4 12.3L8.5 11.1"
        stroke="#93C5FD"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
      <path
        d="M9.4 12.3L8.5 13.5"
        stroke="#93C5FD"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
      <path
        d="M18.6 12.3L19.5 11.1"
        stroke="#93C5FD"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
      <path
        d="M18.6 12.3L19.5 13.5"
        stroke="#93C5FD"
        strokeWidth="0.65"
        strokeLinecap="round"
      />

      {/* 작은 눈송이 1 */}
      <path
        d="M7.1 6.4V10.2"
        stroke="#60A5FA"
        strokeWidth="0.65"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M5.5 8.3H8.7"
        stroke="#60A5FA"
        strokeWidth="0.65"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M6 7.2L8.2 9.4"
        stroke="#60A5FA"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M8.2 7.2L6 9.4"
        stroke="#60A5FA"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* 작은 눈송이 2 */}
      <path
        d="M22 13.8V16.7"
        stroke="#93C5FD"
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M20.6 15.25H23.4"
        stroke="#93C5FD"
        strokeWidth="0.6"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* 작은 반짝이 */}
      <path
        d="M6.7 15.2L7.1 16.1L8 16.5L7.1 16.9L6.7 17.8L6.3 16.9L5.4 16.5L6.3 16.1L6.7 15.2Z"
        fill="#FFFFFF"
        opacity="0.95"
      />

      <path
        d="M21.5 6.4L21.9 7.2L22.7 7.6L21.9 8L21.5 8.8L21.1 8L20.3 7.6L21.1 7.2L21.5 6.4Z"
        fill="#BAE6FD"
        opacity="0.95"
      />

      {/* 작은 눈 점들 */}
      <circle cx="9.2" cy="17.6" r="0.65" fill="#FFFFFF" opacity="0.95" />
      <circle cx="19.4" cy="19.4" r="0.6" fill="#DBEAFE" opacity="0.95" />
      <circle cx="12.2" cy="5.4" r="0.55" fill="#FFFFFF" opacity="0.9" />
      <circle cx="23.3" cy="10.8" r="0.5" fill="#E0F2FE" opacity="0.9" />
    </svg>
  );
}

export default WinterIcon;