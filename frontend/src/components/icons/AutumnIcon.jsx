import { useId } from "react";

/*
 * AutumnIcon 역할
 *
 * 가을 테마를 보여주는 작은 SVG 아이콘 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 주황/분홍 노을빛 둥근 배경
 * - 가운데 단풍잎
 * - 작은 낙엽
 * - 밤/도토리 느낌의 열매
 * - 따뜻한 반짝이
 * 를 코드로 그린 아이콘이야.
 *
 * 사용하는 방법:
 * <AutumnIcon />
 * <AutumnIcon size={64} />
 */
function AutumnIcon({ size = 28 }) {
  // 같은 아이콘이 여러 번 나와도 SVG 내부 id가 겹치지 않게 해준다.
  const rawId = useId();

  // useId에는 ":" 문자가 들어갈 수 있어서 SVG id로 쓰기 좋게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const bgGradientId = `${safeId}-autumn-bg`;
  const leafGradientId = `${safeId}-autumn-leaf`;
  const smallLeafGradientId = `${safeId}-autumn-small-leaf`;
  const nutGradientId = `${safeId}-autumn-nut`;
  const glowGradientId = `${safeId}-autumn-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="autumn theme icon"
    >
      <defs>
        {/* 주황 + 분홍 노을빛 배경 */}
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF7ED" />
          <stop offset="48%" stopColor="#FFEDD5" />
          <stop offset="100%" stopColor="#FFE4E6" />
        </linearGradient>

        {/* 메인 단풍잎 그라데이션 */}
        <linearGradient id={leafGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="40%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#F43F5E" />
        </linearGradient>

        {/* 작은 낙엽 그라데이션 */}
        <linearGradient id={smallLeafGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDBA74" />
          <stop offset="55%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#C2410C" />
        </linearGradient>

        {/* 밤/도토리 느낌 열매 그라데이션 */}
        <linearGradient id={nutGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="55%" stopColor="#B45309" />
          <stop offset="100%" stopColor="#78350F" />
        </linearGradient>

        {/* 뒤쪽 따뜻한 노을빛 */}
        <radialGradient id={glowGradientId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FDBA74" stopOpacity="0.5" />
          <stop offset="55%" stopColor="#FB7185" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FB7185" stopOpacity="0" />
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
        stroke="#FDBA74"
        strokeWidth="1"
        opacity="0.9"
      />

      {/* 뒤쪽 노을빛 번짐 */}
      <circle cx="17.6" cy="10.4" r="6.5" fill={`url(#${glowGradientId})`} />

      {/* 뒤쪽 작은 낙엽 1 */}
      <path
        d="M6.4 8.4C8.1 6.9 10.4 7.3 11.2 9.1C9.8 10.7 7.4 10.3 6.4 8.4Z"
        fill={`url(#${smallLeafGradientId})`}
        stroke="#EA580C"
        strokeWidth="0.5"
        strokeLinejoin="round"
        opacity="0.9"
      />

      {/* 뒤쪽 작은 낙엽 1 잎맥 */}
      <path
        d="M7.4 8.6C8.5 8.7 9.4 8.9 10.4 9.2"
        stroke="#FFF7ED"
        strokeWidth="0.45"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />

      {/* 뒤쪽 작은 낙엽 2 */}
      <path
        d="M20.8 5.8C22.5 6.1 23.4 7.8 22.7 9.2C21 8.9 20.1 7.2 20.8 5.8Z"
        fill="#FB7185"
        stroke="#E11D48"
        strokeWidth="0.45"
        strokeLinejoin="round"
        opacity="0.88"
      />

      {/* 메인 단풍잎 */}
      <path
        d="M14 5.2L15.3 9.2L18.6 7.1L17.7 11.1L21.8 10.4L18.8 13.2L21.2 16.2L17.1 16.1L17.9 20.1L14.6 17.7L14 23L13.4 17.7L10.1 20.1L10.9 16.1L6.8 16.2L9.2 13.2L6.2 10.4L10.3 11.1L9.4 7.1L12.7 9.2L14 5.2Z"
        fill={`url(#${leafGradientId})`}
        stroke="#C2410C"
        strokeWidth="0.75"
        strokeLinejoin="round"
      />

      {/* 단풍잎 가운데 줄기 */}
      <path
        d="M14 7.2V22"
        stroke="#7C2D12"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
        opacity="0.72"
      />

      {/* 단풍잎 잎맥들 */}
      <path
        d="M14 12.7L10.1 10.2"
        stroke="#FFF7ED"
        strokeWidth="0.55"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />
      <path
        d="M14 12.7L17.9 10.2"
        stroke="#FFF7ED"
        strokeWidth="0.55"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />
      <path
        d="M14 14.4L9.9 16.1"
        stroke="#FFF7ED"
        strokeWidth="0.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.65"
      />
      <path
        d="M14 14.4L18.1 16.1"
        stroke="#FFF7ED"
        strokeWidth="0.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.65"
      />

      {/* 아래쪽 작은 밤/도토리 느낌 */}
      <path
        d="M7.4 19.3C7.4 17.7 8.7 16.6 10.1 16.9C11.6 17.2 12.3 18.6 11.8 20.1C11.3 21.8 9.2 22.5 7.9 21.4C7.6 20.8 7.4 20.1 7.4 19.3Z"
        fill={`url(#${nutGradientId})`}
        stroke="#92400E"
        strokeWidth="0.55"
        strokeLinejoin="round"
      />

      {/* 밤/도토리 윗부분 */}
      <path
        d="M7.9 18C8.8 17.2 10.5 17.1 11.4 18.1C10.7 18.6 8.8 18.6 7.9 18Z"
        fill="#FDE68A"
        stroke="#B45309"
        strokeWidth="0.45"
        strokeLinejoin="round"
      />

      {/* 작은 반짝이 1 */}
      <path
        d="M5.8 14.8L6.3 15.9L7.4 16.4L6.3 16.9L5.8 18L5.3 16.9L4.2 16.4L5.3 15.9L5.8 14.8Z"
        fill="#FDBA74"
        opacity="0.9"
      />

      {/* 작은 반짝이 2 */}
      <path
        d="M22.4 15.2L22.8 16.1L23.7 16.5L22.8 16.9L22.4 17.8L22 16.9L21.1 16.5L22 16.1L22.4 15.2Z"
        fill="#FFFFFF"
        opacity="0.92"
      />

      {/* 작은 노을 점 */}
      <circle cx="7.4" cy="5.8" r="0.65" fill="#FB923C" />
      <circle cx="18.8" cy="21.2" r="0.6" fill="#FB7185" />
      <circle cx="23.1" cy="11.5" r="0.55" fill="#FDBA74" />
    </svg>
  );
}

export default AutumnIcon;