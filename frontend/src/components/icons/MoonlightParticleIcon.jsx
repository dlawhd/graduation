import { useId } from "react";

/*
 * MoonlightParticleIcon 역할
 *
 * 달빛 저금통 안에서 떨어지는 작은 파티클 SVG야.
 *
 * 쉽게 말하면:
 * - 대표 아이콘처럼 둥근 배경이 있는 아이콘이 아니라
 * - 저금통 안에서 흩날리는 초승달, 별, 구름, 달빛 반짝이를 그리는 역할이야.
 *
 * 사용하는 방법:
 * <MoonlightParticleIcon variant="moon" size={18} />
 * <MoonlightParticleIcon variant="star" size={18} />
 * <MoonlightParticleIcon variant="cloud" size={18} />
 * <MoonlightParticleIcon variant="sparkle" size={18} />
 */
function MoonlightParticleIcon({ variant = "moon", size = 18 }) {
  // 같은 파티클이 여러 번 나와도 SVG 안의 id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const moonGradientId = `${safeId}-moonlight-moon`;
  const moonMaskId = `${safeId}-moonlight-mask`;
  const starGradientId = `${safeId}-moonlight-star`;
  const cloudGradientId = `${safeId}-moonlight-cloud`;
  const sparkleGradientId = `${safeId}-moonlight-sparkle`;

  // 초승달
  if (variant === "moon") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={moonGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="42%" stopColor="#C7D2FE" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>

          {/* 흰 원에서 검은 원을 빼서 초승달 모양을 만든다. */}
          <mask id={moonMaskId}>
            <rect width="28" height="28" fill="black" />
            <circle cx="13" cy="14" r="9" fill="white" />
            <circle cx="17" cy="11.5" r="8.8" fill="black" />
          </mask>
        </defs>

        {/* 초승달 몸통 */}
        <circle
          cx="13"
          cy="14"
          r="9"
          fill={`url(#${moonGradientId})`}
          mask={`url(#${moonMaskId})`}
        />

        {/* 초승달 은은한 테두리 */}
        <path
          d="M10.6 6.4C7.7 8.3 5.8 11.5 5.8 14.8C5.8 18.2 7.8 21.1 10.5 22.4"
          stroke="#C7D2FE"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />

        {/* 하이라이트 */}
        <path
          d="M9.9 9.2C8.6 10.7 8 12.5 8.1 14.4"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.88"
        />

        {/* 작은 빛 점 */}
        <circle cx="18.8" cy="19.4" r="1" fill="#FFFFFF" opacity="0.8" />
      </svg>
    );
  }

  // 별
  if (variant === "star") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={starGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="45%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>
        </defs>

        {/* 큰 별 */}
        <path
          d="M14 3.8L16.8 10.8L24.2 11.4L18.5 16.1L20.3 23.2L14 19.4L7.7 23.2L9.5 16.1L3.8 11.4L11.2 10.8L14 3.8Z"
          fill={`url(#${starGradientId})`}
          stroke="#E0E7FF"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        {/* 별 안쪽 하이라이트 */}
        <path
          d="M14 7.1L15.6 12L20.5 12.5"
          stroke="#FFFFFF"
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />

        <circle cx="14" cy="14.5" r="1" fill="#FFFFFF" opacity="0.75" />
      </svg>
    );
  }

  // 작은 구름
  if (variant === "cloud") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={cloudGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="50%" stopColor="#C7D2FE" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>
        </defs>

        {/* 구름 몸통 */}
        <path
          d="M5.1 17.6C5.4 14.9 7.7 13.3 10.1 13.9C11.1 10.9 13.6 9.2 16.4 9.7C19.1 10.2 20.7 12.3 20.9 14.7C22.8 14.7 24.2 16.1 24.2 18C24.2 20.3 22.3 21.8 19.8 21.8H9.1C6.8 21.8 5 20.2 5.1 17.6Z"
          fill={`url(#${cloudGradientId})`}
          stroke="#C7D2FE"
          strokeWidth="0.85"
          strokeLinejoin="round"
        />

        {/* 구름 하이라이트 */}
        <path
          d="M8.1 17.2C9.2 15.9 10.7 15.5 12.3 16"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />

        {/* 구름 아래 그림자 */}
        <path
          d="M8.8 20.1C11.6 20.8 16.9 20.8 20.9 19.9"
          stroke="#818CF8"
          strokeWidth="0.65"
          strokeLinecap="round"
          fill="none"
          opacity="0.45"
        />
      </svg>
    );
  }

  // 은빛 달빛 반짝이
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
          <stop offset="42%" stopColor="#A5B4FC" />
          <stop offset="100%" stopColor="#4F46E5" />
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

export default MoonlightParticleIcon;