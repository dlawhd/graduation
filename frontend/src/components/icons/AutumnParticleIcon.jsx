import { useId } from "react";

/*
 * AutumnParticleIcon 역할
 *
 * 가을 저금통 안에서 떨어지는 작은 파티클 SVG야.
 *
 * 쉽게 말하면:
 * - 대표 아이콘처럼 둥근 배경이 있는 아이콘이 아니라
 * - 저금통 안에서 흩날리는 단풍잎, 낙엽, 밤, 노을 반짝이를 그리는 역할이야.
 *
 * 사용하는 방법:
 * <AutumnParticleIcon variant="maple" size={18} />
 * <AutumnParticleIcon variant="leaf" size={18} />
 * <AutumnParticleIcon variant="chestnut" size={18} />
 * <AutumnParticleIcon variant="sparkle" size={18} />
 */
function AutumnParticleIcon({ variant = "maple", size = 18 }) {
  // 같은 파티클이 여러 번 나와도 SVG 안의 gradient id가 겹치지 않게 해준다.
  const rawId = useId();
  const safeId = rawId.replace(/:/g, "");

  const mapleGradientId = `${safeId}-autumn-maple`;
  const leafGradientId = `${safeId}-autumn-leaf`;
  const chestnutGradientId = `${safeId}-autumn-chestnut`;
  const sparkleGradientId = `${safeId}-autumn-sparkle`;

  // 단풍잎
  if (variant === "maple") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={mapleGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="40%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#F43F5E" />
          </linearGradient>
        </defs>

        <path
          d="M14 3.6L15.4 8.4L19.2 5.8L18.1 10.6L23.2 9.8L19.3 13.1L22.1 17L17.2 16.7L18.1 21.7L14.5 18.7L14 24.4L13.5 18.7L9.9 21.7L10.8 16.7L5.9 17L8.7 13.1L4.8 9.8L9.9 10.6L8.8 5.8L12.6 8.4L14 3.6Z"
          fill={`url(#${mapleGradientId})`}
          stroke="#C2410C"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        <path
          d="M14 6.4V23"
          stroke="#7C2D12"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.7"
        />

        <path
          d="M14 12.6L9.7 9.8"
          stroke="#FFF7ED"
          strokeWidth="0.55"
          strokeLinecap="round"
          opacity="0.75"
        />

        <path
          d="M14 12.6L18.3 9.8"
          stroke="#FFF7ED"
          strokeWidth="0.55"
          strokeLinecap="round"
          opacity="0.75"
        />
      </svg>
    );
  }

  // 낙엽
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
            <stop offset="0%" stopColor="#FDBA74" />
            <stop offset="50%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>

        <path
          d="M5.9 14.8C7.2 8.4 13.9 5.5 22.1 8.2C20.6 16.4 14.3 21.6 7.2 20.7C5.6 18.8 5.2 16.8 5.9 14.8Z"
          fill={`url(#${leafGradientId})`}
          stroke="#C2410C"
          strokeWidth="0.95"
          strokeLinejoin="round"
        />

        <path
          d="M8.4 18.5C11.9 15 15.8 12.2 20.2 9.5"
          stroke="#FFF7ED"
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.82"
        />

        <path
          d="M12.1 15.1C11.2 13.7 10.1 12.5 8.8 11.6"
          stroke="#FED7AA"
          strokeWidth="0.65"
          strokeLinecap="round"
          opacity="0.85"
        />

        <path
          d="M15.4 12.7C17 12.5 18.3 12.8 19.5 13.3"
          stroke="#FED7AA"
          strokeWidth="0.65"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    );
  }

  // 밤 / 도토리 느낌
  if (variant === "chestnut") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={chestnutGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="50%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>
        </defs>

        {/* 밤 몸통 */}
        <path
          d="M7.2 15.2C7.2 10.7 10.2 7.4 14 7.4C17.8 7.4 20.8 10.7 20.8 15.2C20.8 20.4 17.4 23.2 14 23.2C10.6 23.2 7.2 20.4 7.2 15.2Z"
          fill={`url(#${chestnutGradientId})`}
          stroke="#92400E"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        {/* 밤 윗부분 */}
        <path
          d="M8.4 11.2C10.3 8.9 17.2 8.9 19.3 11.3C17.7 12.7 10.3 12.7 8.4 11.2Z"
          fill="#FDE68A"
          stroke="#B45309"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />

        {/* 작은 하이라이트 */}
        <path
          d="M10.5 15.2C10.4 13.9 10.9 12.8 11.9 12.1"
          stroke="#FFF7ED"
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* 꼭지 */}
        <path
          d="M14 7.7C13.5 6.4 14.1 5.4 15.3 4.8"
          stroke="#78350F"
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  // 노을빛 반짝이
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
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="45%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#FB7185" />
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
        opacity="0.82"
      />
    </svg>
  );
}

export default AutumnParticleIcon;