import { useId } from "react";

/*
 * SpringIcon 역할
 *
 * 봄 테마를 보여주는 작은 SVG 아이콘 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 연분홍 둥근 배경
 * - 벚꽃 한 송이
 * - 흩날리는 꽃잎
 * - 작은 새싹
 * - 따뜻한 반짝이
 * 를 코드로 그린 아이콘이야.
 *
 * 사용하는 방법:
 * <SpringIcon />
 * <SpringIcon size={64} />
 */
function SpringIcon({ size = 28 }) {
  // 같은 아이콘이 여러 번 나와도 SVG 내부 id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const bgGradientId = `${safeId}-spring-bg`;
  const flowerGradientId = `${safeId}-spring-flower`;
  const petalGradientId = `${safeId}-spring-petal`;
  const leafGradientId = `${safeId}-spring-leaf`;
  const glowGradientId = `${safeId}-spring-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="spring theme icon"
    >
      <defs>
        {/* 연분홍 + 따뜻한 크림색 배경 */}
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF1F5" />
          <stop offset="48%" stopColor="#FFF7FB" />
          <stop offset="100%" stopColor="#FFF7ED" />
        </linearGradient>

        {/* 벚꽃 꽃잎 그라데이션 */}
        <linearGradient id={flowerGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE4EF" />
          <stop offset="50%" stopColor="#FDA4C8" />
          <stop offset="100%" stopColor="#FB7185" />
        </linearGradient>

        {/* 흩날리는 꽃잎용 연한 그라데이션 */}
        <linearGradient id={petalGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#FBCFE8" />
          <stop offset="100%" stopColor="#FDA4AF" />
        </linearGradient>

        {/* 새싹 잎 그라데이션 */}
        <linearGradient id={leafGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#BBF7D0" />
          <stop offset="55%" stopColor="#86EFAC" />
          <stop offset="100%" stopColor="#4ADE80" />
        </linearGradient>

        {/* 뒤쪽 따뜻한 빛 */}
        <radialGradient id={glowGradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FDBA74" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#FDA4AF" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FDA4AF" stopOpacity="0" />
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
        stroke="#FBCFE8"
        strokeWidth="1"
        opacity="0.95"
      />

      {/* 뒤쪽 따뜻한 봄빛 */}
      <circle cx="17.2" cy="10.2" r="6.4" fill={`url(#${glowGradientId})`} />

      {/* 아래쪽 작은 새싹 줄기 */}
      <path
        d="M13.8 22C13.7 19.5 13.9 17.2 14.5 15"
        stroke="#22C55E"
        strokeWidth="1.15"
        strokeLinecap="round"
        fill="none"
      />

      {/* 왼쪽 새싹 잎 */}
      <path
        d="M13.9 19.4C11.7 19.1 10.1 17.9 9.2 15.9C11.3 15.9 13 16.8 14.1 18.6"
        fill={`url(#${leafGradientId})`}
        stroke="#4ADE80"
        strokeWidth="0.55"
        strokeLinejoin="round"
      />

      {/* 오른쪽 새싹 잎 */}
      <path
        d="M14.4 20.2C16.4 19.7 17.8 18.5 18.6 16.7C16.7 16.8 15.3 17.7 14.3 19.3"
        fill="#BBF7D0"
        stroke="#4ADE80"
        strokeWidth="0.55"
        strokeLinejoin="round"
      />

      {/* 벚꽃 중심 */}
      <circle cx="14.1" cy="12.8" r="2" fill="#FFE4E6" />

      {/* 벚꽃 꽃잎 5장 */}
      <ellipse
        cx="14.1"
        cy="8.9"
        rx="2.1"
        ry="3"
        fill={`url(#${flowerGradientId})`}
        transform="rotate(0 14.1 8.9)"
      />
      <ellipse
        cx="17.7"
        cy="11.6"
        rx="2.1"
        ry="3"
        fill="#FDA4AF"
        transform="rotate(72 17.7 11.6)"
      />
      <ellipse
        cx="16.2"
        cy="15.7"
        rx="2.1"
        ry="3"
        fill="#FB7185"
        transform="rotate(144 16.2 15.7)"
      />
      <ellipse
        cx="11.8"
        cy="15.7"
        rx="2.1"
        ry="3"
        fill="#F9A8D4"
        transform="rotate(216 11.8 15.7)"
      />
      <ellipse
        cx="10.4"
        cy="11.6"
        rx="2.1"
        ry="3"
        fill="#FBCFE8"
        transform="rotate(288 10.4 11.6)"
      />

      {/* 꽃잎 안쪽 하이라이트 */}
      <path
        d="M14.1 9.6C13.8 10.6 13.9 11.5 14.1 12.3"
        stroke="#FFFFFF"
        strokeWidth="0.65"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      <path
        d="M16.6 12C15.8 12.3 15.1 12.6 14.6 13"
        stroke="#FFFFFF"
        strokeWidth="0.55"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />

      {/* 꽃 가운데 노란 점 */}
      <circle cx="14.1" cy="12.8" r="1.05" fill="#FDE68A" />
      <circle cx="14.1" cy="12.8" r="0.45" fill="#F59E0B" opacity="0.75" />

      {/* 흩날리는 작은 꽃잎 1 */}
      <path
        d="M6.6 8.2C7.5 7.4 8.9 7.7 9.3 8.8C8.5 9.7 7.1 9.5 6.6 8.2Z"
        fill={`url(#${petalGradientId})`}
        stroke="#F9A8D4"
        strokeWidth="0.45"
        strokeLinejoin="round"
      />

      {/* 흩날리는 작은 꽃잎 2 */}
      <path
        d="M20.2 5.8C21.3 5.4 22.4 6.1 22.4 7.3C21.3 7.8 20.2 7.1 20.2 5.8Z"
        fill="#FBCFE8"
        stroke="#FDA4AF"
        strokeWidth="0.45"
        strokeLinejoin="round"
      />

      {/* 흩날리는 작은 꽃잎 3 */}
      <path
        d="M21 18.6C22.2 18.1 23.4 18.9 23.3 20.1C22.1 20.6 21 19.9 21 18.6Z"
        fill="#FFE4EF"
        stroke="#F9A8D4"
        strokeWidth="0.45"
        strokeLinejoin="round"
      />

      {/* 작은 반짝이 */}
      <path
        d="M6.8 15.2L7.2 16.1L8.1 16.5L7.2 16.9L6.8 17.8L6.4 16.9L5.5 16.5L6.4 16.1L6.8 15.2Z"
        fill="#FDBA74"
        opacity="0.9"
      />

      <path
        d="M22.1 11.3L22.5 12.1L23.3 12.5L22.5 12.9L22.1 13.7L21.7 12.9L20.9 12.5L21.7 12.1L22.1 11.3Z"
        fill="#FFFFFF"
        opacity="0.92"
      />

      {/* 작은 분홍 점 */}
      <circle cx="8.4" cy="20.8" r="0.65" fill="#FDA4AF" />
      <circle cx="19.6" cy="21.4" r="0.55" fill="#FBCFE8" />
      <circle cx="5.6" cy="11.7" r="0.55" fill="#FFE4E6" />
    </svg>
  );
}

export default SpringIcon;