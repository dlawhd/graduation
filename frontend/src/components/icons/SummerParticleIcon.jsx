import { useId } from "react";

/*
 * SummerParticleIcon 역할
 *
 * 여름 저금통 안에서 떨어지는 작은 파티클 SVG야.
 *
 * 쉽게 말하면:
 * - 대표 아이콘처럼 둥근 배경이 있는 아이콘이 아니라
 * - 저금통 안에서 흩날리는 햇살, 잎사귀, 풀잎, 반짝이를 그리는 역할이야.
 *
 * 사용하는 방법:
 * <SummerParticleIcon variant="leaf" size={18} />
 * <SummerParticleIcon variant="sun" size={18} />
 * <SummerParticleIcon variant="grass" size={18} />
 * <SummerParticleIcon variant="sparkle" size={18} />
 */
function SummerParticleIcon({ variant = "leaf", size = 18 }) {
  // 같은 파티클이 여러 번 나와도 SVG 안의 gradient id가 겹치지 않게 해준다.
  const rawId = useId();
  const safeId = rawId.replace(/:/g, "");

  const leafGradientId = `${safeId}-summer-leaf`;
  const sunGradientId = `${safeId}-summer-sun`;
  const grassGradientId = `${safeId}-summer-grass`;
  const sparkleGradientId = `${safeId}-summer-sparkle`;

  // 초록 잎사귀
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
            <stop offset="0%" stopColor="#BBF7D0" />
            <stop offset="45%" stopColor="#86EFAC" />
            <stop offset="100%" stopColor="#22C55E" />
          </linearGradient>
        </defs>

        <path
          d="M5.8 15.5C7.2 8.4 13.8 4.8 22.2 6.8C20.7 15.3 14.2 21.8 6.5 21.4C5.4 19.6 5.1 17.6 5.8 15.5Z"
          fill={`url(#${leafGradientId})`}
          stroke="#16A34A"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        <path
          d="M8.3 19.2C11.6 15.6 15.2 12.5 20 8.6"
          stroke="#ECFDF5"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />

        <path
          d="M12.2 15.1C11.4 13.4 10.4 12.2 9.1 11.2"
          stroke="#DCFCE7"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />

        <path
          d="M15.3 12.4C16.9 12.2 18.4 12.4 19.8 12.9"
          stroke="#DCFCE7"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />
      </svg>
    );
  }

  // 작은 햇살
  if (variant === "sun") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={sunGradientId} cx="45%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#FEF9C3" />
            <stop offset="45%" stopColor="#FDE68A" />
            <stop offset="100%" stopColor="#F59E0B" />
          </radialGradient>
        </defs>

        <circle
          cx="14"
          cy="14"
          r="6.2"
          fill={`url(#${sunGradientId})`}
          stroke="#F59E0B"
          strokeWidth="1"
        />

        <path d="M14 2.8V6" stroke="#FBBF24" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M14 22V25.2" stroke="#FBBF24" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M2.8 14H6" stroke="#FBBF24" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M22 14H25.2" stroke="#FBBF24" strokeWidth="1.4" strokeLinecap="round" />

        <path d="M6.1 6.1L8.4 8.4" stroke="#FBBF24" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M19.6 19.6L21.9 21.9" stroke="#FBBF24" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M21.9 6.1L19.6 8.4" stroke="#FBBF24" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M8.4 19.6L6.1 21.9" stroke="#FBBF24" strokeWidth="1.2" strokeLinecap="round" />

        <circle cx="11.6" cy="11.8" r="0.9" fill="#FFF7ED" opacity="0.95" />
      </svg>
    );
  }

  // 작은 풀잎 묶음
  if (variant === "grass") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={grassGradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D9F99D" />
            <stop offset="50%" stopColor="#86EFAC" />
            <stop offset="100%" stopColor="#16A34A" />
          </linearGradient>
        </defs>

        <path
          d="M5.5 22.5C7.4 19.9 9.2 17.9 12.2 16.9C11.8 20.4 9.8 22.6 5.5 22.5Z"
          fill={`url(#${grassGradientId})`}
          stroke="#16A34A"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />

        <path
          d="M13.3 23C13.3 18.7 14.8 15.2 18.1 12.8C18.7 17.5 17.3 21 13.3 23Z"
          fill="#86EFAC"
          stroke="#16A34A"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />

        <path
          d="M20.1 22.4C19.4 18.8 20.4 16.2 23.5 14.4C24.2 18.4 23.1 21.2 20.1 22.4Z"
          fill="#BBF7D0"
          stroke="#22C55E"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />

        <path
          d="M8.4 21.3C9.4 19.6 10.5 18.6 11.8 17.7"
          stroke="#F0FDF4"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />

        <path
          d="M15.1 21.4C15.8 18.8 16.7 16.6 17.7 14.4"
          stroke="#F0FDF4"
          strokeWidth="0.7"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
      </svg>
    );
  }

  // 여름빛 반짝이
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
          <stop offset="0%" stopColor="#FEF9C3" />
          <stop offset="45%" stopColor="#FACC15" />
          <stop offset="100%" stopColor="#22C55E" />
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
        opacity="0.85"
      />
    </svg>
  );
}

export default SummerParticleIcon;