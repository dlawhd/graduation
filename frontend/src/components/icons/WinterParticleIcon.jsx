import { useId } from "react";

/*
 * WinterParticleIcon 역할
 *
 * 겨울 저금통 안에서 떨어지는 작은 파티클 SVG야.
 *
 * 쉽게 말하면:
 * - 대표 아이콘처럼 둥근 배경이 있는 아이콘이 아니라
 * - 저금통 안에서 흩날리는 눈송이, 얼음 결정, 눈덩이, 겨울 반짝이를 그리는 역할이야.
 *
 * 사용하는 방법:
 * <WinterParticleIcon variant="snowflake" size={18} />
 * <WinterParticleIcon variant="ice" size={18} />
 * <WinterParticleIcon variant="snowball" size={18} />
 * <WinterParticleIcon variant="sparkle" size={18} />
 */
function WinterParticleIcon({ variant = "snowflake", size = 18 }) {
  // 같은 파티클이 여러 번 나와도 SVG 안의 gradient id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const snowGradientId = `${safeId}-winter-snow`;
  const iceGradientId = `${safeId}-winter-ice`;
  const ballGradientId = `${safeId}-winter-ball`;
  const sparkleGradientId = `${safeId}-winter-sparkle`;

  // 눈송이
  if (variant === "snowflake") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={snowGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#BAE6FD" />
            <stop offset="100%" stopColor="#60A5FA" />
          </linearGradient>
        </defs>

        {/* 가운데 점 */}
        <circle
          cx="14"
          cy="14"
          r="1.7"
          fill="#FFFFFF"
          stroke="#60A5FA"
          strokeWidth="0.6"
        />

        {/* 눈송이 기본 줄기 */}
        <path
          d="M14 3.8V24.2"
          stroke={`url(#${snowGradientId})`}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M3.8 14H24.2"
          stroke={`url(#${snowGradientId})`}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M6.8 6.8L21.2 21.2"
          stroke={`url(#${snowGradientId})`}
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <path
          d="M21.2 6.8L6.8 21.2"
          stroke={`url(#${snowGradientId})`}
          strokeWidth="1.35"
          strokeLinecap="round"
        />

        {/* 작은 가지들 */}
        <path d="M14 6.5L12.4 5.2" stroke="#93C5FD" strokeWidth="0.8" strokeLinecap="round" />
        <path d="M14 6.5L15.6 5.2" stroke="#93C5FD" strokeWidth="0.8" strokeLinecap="round" />

        <path d="M14 21.5L12.4 22.8" stroke="#93C5FD" strokeWidth="0.8" strokeLinecap="round" />
        <path d="M14 21.5L15.6 22.8" stroke="#93C5FD" strokeWidth="0.8" strokeLinecap="round" />

        <path d="M6.5 14L5.2 12.4" stroke="#93C5FD" strokeWidth="0.8" strokeLinecap="round" />
        <path d="M6.5 14L5.2 15.6" stroke="#93C5FD" strokeWidth="0.8" strokeLinecap="round" />

        <path d="M21.5 14L22.8 12.4" stroke="#93C5FD" strokeWidth="0.8" strokeLinecap="round" />
        <path d="M21.5 14L22.8 15.6" stroke="#93C5FD" strokeWidth="0.8" strokeLinecap="round" />
      </svg>
    );
  }

  // 얼음 결정
  if (variant === "ice") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={iceGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#BFDBFE" />
            <stop offset="100%" stopColor="#38BDF8" />
          </linearGradient>
        </defs>

        {/* 얼음 조각 */}
        <path
          d="M14 3.8L22.3 9.6L20.8 20.3L14 24.2L7.2 20.3L5.7 9.6L14 3.8Z"
          fill={`url(#${iceGradientId})`}
          stroke="#60A5FA"
          strokeWidth="0.9"
          strokeLinejoin="round"
          opacity="0.95"
        />

        {/* 안쪽 결 */}
        <path
          d="M14 4.8V23"
          stroke="#FFFFFF"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M6.9 10.2L14 14L21.1 10.2"
          stroke="#E0F2FE"
          strokeWidth="0.75"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        <path
          d="M8.1 19.4L14 14L19.9 19.4"
          stroke="#93C5FD"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />

        {/* 하이라이트 */}
        <path
          d="M10.2 9.2C11.2 7.9 12.4 7.1 13.7 6.7"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
    );
  }

  // 작은 눈덩이
  if (variant === "snowball") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={ballGradientId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#E0F2FE" />
            <stop offset="100%" stopColor="#BFDBFE" />
          </radialGradient>
        </defs>

        {/* 눈덩이 몸통 */}
        <circle
          cx="14"
          cy="14"
          r="8.4"
          fill={`url(#${ballGradientId})`}
          stroke="#93C5FD"
          strokeWidth="0.9"
        />

        {/* 눈덩이 하이라이트 */}
        <path
          d="M9.8 10.8C10.8 9.2 12.2 8.4 14 8.2"
          stroke="#FFFFFF"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* 아래쪽 그림자 */}
        <path
          d="M9.2 17.6C11.1 19.1 15.6 19.7 18.9 17.5"
          stroke="#93C5FD"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* 작은 눈 점 */}
        <circle cx="18.6" cy="11.5" r="0.8" fill="#FFFFFF" opacity="0.85" />
        <circle cx="11.4" cy="18.1" r="0.65" fill="#FFFFFF" opacity="0.8" />
      </svg>
    );
  }

  // 겨울빛 반짝이
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
          <stop offset="45%" stopColor="#BAE6FD" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
      </defs>

      <path
        d="M14 3.5L16.4 10.5L23.5 14L16.4 17.5L14 24.5L11.6 17.5L4.5 14L11.6 10.5L14 3.5Z"
        fill={`url(#${sparkleGradientId})`}
        opacity="0.95"
      />

      <path
        d="M14 8.4L15.2 12L18.8 14L15.2 16L14 19.6L12.8 16L9.2 14L12.8 12L14 8.4Z"
        fill="#FFFFFF"
        opacity="0.9"
      />
    </svg>
  );
}

export default WinterParticleIcon;