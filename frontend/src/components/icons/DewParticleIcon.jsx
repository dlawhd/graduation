import { useId } from "react";

/*
 * DewParticleIcon 역할
 *
 * 이슬 저금통 안에서 떨어지는 작은 파티클 SVG야.
 *
 * 쉽게 말하면:
 * - 대표 아이콘처럼 둥근 배경이 있는 아이콘이 아니라
 * - 저금통 안에서 흩날리는 물방울, 거품, 작은 잎, 물빛 반짝이를 그리는 역할이야.
 *
 * 사용하는 방법:
 * <DewParticleIcon variant="drop" size={18} />
 * <DewParticleIcon variant="bubble" size={18} />
 * <DewParticleIcon variant="leaf" size={18} />
 * <DewParticleIcon variant="sparkle" size={18} />
 */
function DewParticleIcon({ variant = "drop", size = 18 }) {
  // 같은 파티클이 여러 번 나와도 SVG 안의 gradient id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const dropGradientId = `${safeId}-dew-drop`;
  const bubbleGradientId = `${safeId}-dew-bubble`;
  const leafGradientId = `${safeId}-dew-leaf`;
  const sparkleGradientId = `${safeId}-dew-sparkle`;

  // 투명한 물방울
  if (variant === "drop") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={dropGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
            <stop offset="45%" stopColor="#A7F3D0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* 물방울 몸통 */}
        <path
          d="M14 3.8C10.7 8.1 7.6 12.3 7.6 16.2C7.6 20.1 10.3 23 14 23C17.7 23 20.4 20.1 20.4 16.2C20.4 12.3 17.3 8.1 14 3.8Z"
          fill={`url(#${dropGradientId})`}
          stroke="#38BDF8"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* 물방울 안쪽 하이라이트 */}
        <path
          d="M11.3 12.1C10.4 13.8 10.2 16 10.9 17.8"
          stroke="#FFFFFF"
          strokeWidth="1.25"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />

        {/* 아래쪽 은은한 그림자 */}
        <path
          d="M10.6 18.4C11.7 20 13.2 20.7 14.9 20.5C16.5 20.4 17.6 19.7 18.3 18.5"
          stroke="#0891B2"
          strokeWidth="0.65"
          strokeLinecap="round"
          fill="none"
          opacity="0.35"
        />
      </svg>
    );
  }

  // 작은 거품
  if (variant === "bubble") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={bubbleGradientId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
            <stop offset="58%" stopColor="#BAE6FD" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#67E8F9" stopOpacity="0.35" />
          </radialGradient>
        </defs>

        {/* 큰 거품 */}
        <circle
          cx="14"
          cy="14"
          r="8.2"
          fill={`url(#${bubbleGradientId})`}
          stroke="#A5F3FC"
          strokeWidth="0.95"
          opacity="0.95"
        />

        {/* 거품 하이라이트 */}
        <circle cx="10.9" cy="10.4" r="2" fill="#FFFFFF" opacity="0.85" />
        <circle cx="18.2" cy="17.3" r="1.1" fill="#FFFFFF" opacity="0.55" />

        {/* 작은 보조 거품 */}
        <circle
          cx="21.4"
          cy="7.4"
          r="2.3"
          fill="#FFFFFF"
          stroke="#BAE6FD"
          strokeWidth="0.55"
          opacity="0.75"
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
            <stop offset="45%" stopColor="#5EEAD4" />
            <stop offset="100%" stopColor="#14B8A6" />
          </linearGradient>
        </defs>

        <path
          d="M5.9 15.2C7.2 8.8 13.8 5.4 21.8 7.9C20.3 16.1 14.1 21.2 6.9 20.8C5.6 19 5.2 17.1 5.9 15.2Z"
          fill={`url(#${leafGradientId})`}
          stroke="#0F766E"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        {/* 잎맥 */}
        <path
          d="M8.4 18.6C11.6 15.4 15.3 12.4 19.8 9.4"
          stroke="#F0FDFA"
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.9"
        />

        <path
          d="M12.1 15.1C11.2 13.8 10.2 12.6 8.9 11.7"
          stroke="#CCFBF1"
          strokeWidth="0.65"
          strokeLinecap="round"
          opacity="0.85"
        />

        <path
          d="M15.4 12.7C17 12.5 18.3 12.8 19.5 13.3"
          stroke="#CCFBF1"
          strokeWidth="0.65"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    );
  }

  // 물빛 반짝이
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
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="45%" stopColor="#67E8F9" />
          <stop offset="100%" stopColor="#2DD4BF" />
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
        opacity="0.88"
      />
    </svg>
  );
}

export default DewParticleIcon;