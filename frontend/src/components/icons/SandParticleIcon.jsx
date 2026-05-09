import { useId } from "react";

/*
 * SandParticleIcon 역할
 *
 * 모래 저금통 안에서 떨어지는 작은 파티클 SVG야.
 *
 * 쉽게 말하면:
 * - 대표 아이콘처럼 둥근 배경이 있는 아이콘이 아니라
 * - 저금통 안에서 흩날리는 조개, 모래알, 불가사리, 모래빛 반짝이를 그리는 역할이야.
 *
 * 사용하는 방법:
 * <SandParticleIcon variant="shell" size={18} />
 * <SandParticleIcon variant="grain" size={18} />
 * <SandParticleIcon variant="starfish" size={18} />
 * <SandParticleIcon variant="sparkle" size={18} />
 */
function SandParticleIcon({ variant = "shell", size = 18 }) {
  // 같은 파티클이 여러 번 나와도 SVG 안의 gradient id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const shellGradientId = `${safeId}-sand-shell`;
  const grainGradientId = `${safeId}-sand-grain`;
  const starfishGradientId = `${safeId}-sand-starfish`;
  const sparkleGradientId = `${safeId}-sand-sparkle`;

  // 조개
  if (variant === "shell") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={shellGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#FFE8C2" />
            <stop offset="100%" stopColor="#D8A86B" />
          </linearGradient>
        </defs>

        {/* 조개 몸통 */}
        <path
          d="M6.4 16.2C6.4 10.3 9.6 6.4 14 6.4C18.4 6.4 21.6 10.3 21.6 16.2C21.6 19.6 18.5 22.4 14 22.4C9.5 22.4 6.4 19.6 6.4 16.2Z"
          fill={`url(#${shellGradientId})`}
          stroke="#C79255"
          strokeWidth="0.95"
          strokeLinejoin="round"
        />

        {/* 조개 아래쪽 */}
        <path
          d="M7.7 17.4C9.2 20 11.4 21.1 14 21.1C16.6 21.1 18.8 20 20.3 17.4"
          stroke="#B7793F"
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
          opacity="0.65"
        />

        {/* 조개 결 */}
        <path
          d="M14 7.2V21"
          stroke="#D6A46B"
          strokeWidth="0.75"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M10.2 8.7C11.6 12.1 12.5 16.1 12.8 20.6"
          stroke="#D6A46B"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M17.8 8.7C16.4 12.1 15.5 16.1 15.2 20.6"
          stroke="#D6A46B"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />

        {/* 하이라이트 */}
        <path
          d="M9.8 13.2C10.2 11.3 11.3 9.8 12.8 9"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>
    );
  }

  // 모래알 / 작은 모래 덩어리
  if (variant === "grain") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={grainGradientId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FFF7ED" />
            <stop offset="50%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#D97706" />
          </radialGradient>
        </defs>

        {/* 큰 모래알 */}
        <ellipse
          cx="13.8"
          cy="14.5"
          rx="7.8"
          ry="6.6"
          fill={`url(#${grainGradientId})`}
          stroke="#B7791F"
          strokeWidth="0.85"
          transform="rotate(-14 13.8 14.5)"
        />

        {/* 작은 모래알들 */}
        <circle cx="7.8" cy="19.5" r="2" fill="#FDE68A" stroke="#D97706" strokeWidth="0.45" />
        <circle cx="20.3" cy="9.5" r="1.8" fill="#FCD34D" stroke="#D97706" strokeWidth="0.45" />
        <circle cx="20.8" cy="18.8" r="1.4" fill="#FFE8A3" stroke="#D97706" strokeWidth="0.4" />

        {/* 반짝이는 모래 하이라이트 */}
        <path
          d="M10.1 12.2C11.2 10.9 12.8 10.2 14.8 10.2"
          stroke="#FFFFFF"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.75"
        />
      </svg>
    );
  }

  // 작은 불가사리
  if (variant === "starfish") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={starfishGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FED7AA" />
            <stop offset="45%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#C2410C" />
          </linearGradient>
        </defs>

        {/* 불가사리 몸통 */}
        <path
          d="M14 4.2L16.5 10.4L23.2 9.8L18.1 14.2L20.5 20.6L14 17L7.5 20.6L9.9 14.2L4.8 9.8L11.5 10.4L14 4.2Z"
          fill={`url(#${starfishGradientId})`}
          stroke="#C2410C"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />

        {/* 가운데 점 */}
        <circle cx="14" cy="14" r="1.4" fill="#FFE8C2" opacity="0.9" />

        {/* 작은 무늬 점들 */}
        <circle cx="13.5" cy="9.3" r="0.7" fill="#FFE8C2" opacity="0.85" />
        <circle cx="18.1" cy="12.4" r="0.65" fill="#FFE8C2" opacity="0.8" />
        <circle cx="16.6" cy="17.1" r="0.65" fill="#FFE8C2" opacity="0.8" />
        <circle cx="10.5" cy="16.8" r="0.65" fill="#FFE8C2" opacity="0.8" />
        <circle cx="9.8" cy="12.2" r="0.65" fill="#FFE8C2" opacity="0.8" />
      </svg>
    );
  }

  // 모래빛 반짝이
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
          <stop offset="45%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#D97706" />
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
        opacity="0.84"
      />
    </svg>
  );
}

export default SandParticleIcon;