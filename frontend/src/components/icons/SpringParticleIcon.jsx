import { useId } from "react";

/*
 * SpringParticleIcon 역할
 *
 * 봄 저금통 안에서 떨어지는 작은 파티클 SVG야.
 *
 * 쉽게 말하면:
 * - 대표 아이콘처럼 둥근 배경이 있는 아이콘이 아니라
 * - 저금통 안에서 흩날리는 벚꽃잎, 작은 꽃, 반짝이를 그리는 역할이야.
 *
 * 사용하는 방법:
 * <SpringParticleIcon variant="petal" size={18} />
 * <SpringParticleIcon variant="flower" size={18} />
 * <SpringParticleIcon variant="heart" size={18} />
 * <SpringParticleIcon variant="sparkle" size={18} />
 */
function SpringParticleIcon({ variant = "petal", size = 18 }) {
  // SVG 안의 gradient id가 여러 개 생겨도 서로 겹치지 않게 해준다.
  const rawId = useId();
  const safeId = rawId.replace(/:/g, "");

  const petalGradientId = `${safeId}-spring-petal`;
  const flowerGradientId = `${safeId}-spring-flower`;
  const heartGradientId = `${safeId}-spring-heart`;

  // 벚꽃잎 하나
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
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#FBCFE8" />
            <stop offset="100%" stopColor="#FB7185" />
          </linearGradient>
        </defs>

        <path
          d="M7.3 13.4C8.8 7.8 15.1 5.7 20.6 8.5C20.2 15.1 15.1 20.3 8.9 20.8C6.9 18.9 6.5 16.3 7.3 13.4Z"
          fill={`url(#${petalGradientId})`}
          stroke="#F472B6"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        <path
          d="M9.7 18.5C12.5 15.5 15.1 12.8 18.5 9.8"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    );
  }

  // 작은 벚꽃 한 송이
  if (variant === "flower") {
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
            <stop offset="0%" stopColor="#FFE4EF" />
            <stop offset="50%" stopColor="#FDA4C8" />
            <stop offset="100%" stopColor="#FB7185" />
          </linearGradient>
        </defs>

        <ellipse
          cx="14"
          cy="7.8"
          rx="2.4"
          ry="4"
          fill={`url(#${flowerGradientId})`}
        />
        <ellipse
          cx="19.4"
          cy="11.8"
          rx="2.4"
          ry="4"
          fill="#FDA4AF"
          transform="rotate(72 19.4 11.8)"
        />
        <ellipse
          cx="17.3"
          cy="18.1"
          rx="2.4"
          ry="4"
          fill="#FB7185"
          transform="rotate(144 17.3 18.1)"
        />
        <ellipse
          cx="10.7"
          cy="18.1"
          rx="2.4"
          ry="4"
          fill="#F9A8D4"
          transform="rotate(216 10.7 18.1)"
        />
        <ellipse
          cx="8.6"
          cy="11.8"
          rx="2.4"
          ry="4"
          fill="#FBCFE8"
          transform="rotate(288 8.6 11.8)"
        />

        <circle cx="14" cy="14" r="2.1" fill="#FDE68A" />
        <circle cx="14" cy="14" r="0.8" fill="#F59E0B" opacity="0.75" />
      </svg>
    );
  }

  // 분홍 하트 꽃잎
  if (variant === "heart") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={heartGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE4E6" />
            <stop offset="50%" stopColor="#FB7185" />
            <stop offset="100%" stopColor="#F43F5E" />
          </linearGradient>
        </defs>

        <path
          d="M14 22.2C9.3 18.5 6.4 15.8 6.4 11.8C6.4 9.4 8.1 7.7 10.4 7.7C11.8 7.7 13 8.4 14 9.7C15 8.4 16.2 7.7 17.6 7.7C19.9 7.7 21.6 9.4 21.6 11.8C21.6 15.8 18.7 18.5 14 22.2Z"
          fill={`url(#${heartGradientId})`}
          stroke="#FB7185"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        <path
          d="M9.2 11.3C9.7 10.1 10.8 9.6 12 10"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>
    );
  }

  // 작은 반짝이
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 3.8L16.2 10.5L23 14L16.2 17.5L14 24.2L11.8 17.5L5 14L11.8 10.5L14 3.8Z"
        fill="#FDBA74"
        opacity="0.95"
      />

      <path
        d="M14 7.4L15.3 11.6L19.5 14L15.3 16.4L14 20.6L12.7 16.4L8.5 14L12.7 11.6L14 7.4Z"
        fill="#FFFFFF"
        opacity="0.85"
      />
    </svg>
  );
}

export default SpringParticleIcon;