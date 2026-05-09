import { useId } from "react";

/*
 * LavenderParticleIcon 역할
 *
 * 라벤더 저금통 안에서 떨어지는 작은 파티클 SVG야.
 *
 * 쉽게 말하면:
 * - 대표 아이콘처럼 둥근 배경이 있는 아이콘이 아니라
 * - 저금통 안에서 흩날리는 라벤더 꽃, 꽃잎, 작은 잎, 보라 반짝이를 그리는 역할이야.
 *
 * 사용하는 방법:
 * <LavenderParticleIcon variant="lavender" size={18} />
 * <LavenderParticleIcon variant="petal" size={18} />
 * <LavenderParticleIcon variant="leaf" size={18} />
 * <LavenderParticleIcon variant="sparkle" size={18} />
 */
function LavenderParticleIcon({ variant = "lavender", size = 18 }) {
  // 같은 파티클이 여러 번 나와도 SVG 안의 gradient id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const flowerGradientId = `${safeId}-lavender-flower`;
  const petalGradientId = `${safeId}-lavender-petal`;
  const leafGradientId = `${safeId}-lavender-leaf`;
  const sparkleGradientId = `${safeId}-lavender-sparkle`;

  // 라벤더 꽃대
  if (variant === "lavender") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={flowerGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F5D0FE" />
            <stop offset="45%" stopColor="#C084FC" />
            <stop offset="100%" stopColor="#7E22CE" />
          </linearGradient>
        </defs>

        {/* 꽃대 */}
        <path
          d="M14.4 24C14 19.2 14.2 13.6 15.2 5.2"
          stroke="#22C55E"
          strokeWidth="1.35"
          strokeLinecap="round"
          fill="none"
        />

        {/* 왼쪽 잎 */}
        <path
          d="M14.1 20.5C11.8 20 10.2 18.7 9.2 16.6C11.5 16.7 13.1 17.7 14.3 19.6"
          fill="#BBF7D0"
          stroke="#4ADE80"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />

        {/* 오른쪽 잎 */}
        <path
          d="M14.6 21.4C16.6 20.8 18.1 19.6 18.9 17.6C16.9 17.7 15.3 18.7 14.5 20.4"
          fill="#86EFAC"
          stroke="#4ADE80"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />

        {/* 라벤더 꽃송이들 */}
        <ellipse
          cx="12.5"
          cy="6.8"
          rx="2"
          ry="2.6"
          transform="rotate(-30 12.5 6.8)"
          fill={`url(#${flowerGradientId})`}
          stroke="#A855F7"
          strokeWidth="0.45"
        />
        <ellipse
          cx="16"
          cy="8.5"
          rx="2"
          ry="2.6"
          transform="rotate(30 16 8.5)"
          fill="#A855F7"
          stroke="#7E22CE"
          strokeWidth="0.45"
        />
        <ellipse
          cx="12.4"
          cy="11.2"
          rx="2"
          ry="2.6"
          transform="rotate(-26 12.4 11.2)"
          fill="#C084FC"
          stroke="#A855F7"
          strokeWidth="0.45"
        />
        <ellipse
          cx="16"
          cy="13.2"
          rx="2"
          ry="2.6"
          transform="rotate(28 16 13.2)"
          fill="#9333EA"
          stroke="#7E22CE"
          strokeWidth="0.45"
        />
        <ellipse
          cx="13.1"
          cy="16.5"
          rx="1.9"
          ry="2.4"
          transform="rotate(-18 13.1 16.5)"
          fill="#B56BF7"
          stroke="#9333EA"
          strokeWidth="0.45"
        />

        {/* 꽃 하이라이트 */}
        <circle cx="12" cy="6.2" r="0.45" fill="#FDF4FF" opacity="0.9" />
        <circle cx="15.4" cy="7.8" r="0.45" fill="#FDF4FF" opacity="0.85" />
        <circle cx="11.9" cy="10.5" r="0.45" fill="#FDF4FF" opacity="0.85" />
      </svg>
    );
  }

  // 보라 꽃잎
  if (variant === "petal") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={petalGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDF4FF" />
            <stop offset="45%" stopColor="#D8B4FE" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>

        <path
          d="M7.4 13.4C8.9 7.8 15.2 5.8 20.5 8.8C20.1 15.3 15 20.3 8.9 20.8C6.9 18.9 6.6 16.2 7.4 13.4Z"
          fill={`url(#${petalGradientId})`}
          stroke="#A855F7"
          strokeWidth="0.95"
          strokeLinejoin="round"
        />

        <path
          d="M9.7 18.4C12.7 15.2 15.4 12.6 18.5 9.9"
          stroke="#FFFFFF"
          strokeWidth="0.95"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    );
  }

  // 작은 민트 잎
  if (variant === "leaf") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={leafGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#DCFCE7" />
            <stop offset="50%" stopColor="#86EFAC" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>

        <path
          d="M5.9 15.2C7.3 8.6 13.7 5.4 21.7 7.8C20.2 15.9 14 21.1 6.9 20.8C5.6 19 5.2 17.1 5.9 15.2Z"
          fill={`url(#${leafGradientId})`}
          stroke="#16A34A"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        <path
          d="M8.4 18.6C11.5 15.4 15.2 12.4 19.7 9.4"
          stroke="#F0FDF4"
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.88"
        />
      </svg>
    );
  }

  // 보라빛 반짝이
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={sparkleGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDF4FF" />
          <stop offset="45%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#7E22CE" />
        </linearGradient>
      </defs>

      <path
        d="M14 3.5L16.4 10.5L23.5 14L16.4 17.5L14 24.5L11.6 17.5L4.5 14L11.6 10.5L14 3.5Z"
        fill={`url(#${sparkleGradientId})`}
        opacity="0.95"
      />

      <path
        d="M14 8.2L15.3 12L19.2 14L15.3 16L14 19.8L12.7 16L8.8 14L12.7 12L14 8.2Z"
        fill="#FFFFFF"
        opacity="0.86"
      />
    </svg>
  );
}

export default LavenderParticleIcon;