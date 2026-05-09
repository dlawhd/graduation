import { useId } from "react";

/*
 * LavenderIcon 역할
 *
 * 라벤더 테마를 보여주는 작은 SVG 아이콘 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 연보라색 배경
 * - 가운데 라벤더 꽃
 * - 초록 잎
 * - 작은 반짝이
 * 를 코드로 그린 아이콘이야.
 *
 * 사용하는 방법:
 * <LavenderIcon />
 * <LavenderIcon size={64} />
 */
function LavenderIcon({ size = 28 }) {
  // 같은 아이콘이 여러 번 나와도 gradient id가 겹치지 않게 해준다.
  const id = useId();

  const bgGradientId = `${id}-lavender-bg`;
  const flowerGradientId = `${id}-lavender-flower`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="lavender theme icon"
    >
      <defs>
        {/* 연보라색 둥근 배경 */}
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FAF5FF" />
          <stop offset="50%" stopColor="#F3E8FF" />
          <stop offset="100%" stopColor="#EDE9FE" />
        </linearGradient>

        {/* 라벤더 꽃송이용 보라 그라데이션 */}
        <linearGradient id={flowerGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DDD6FE" />
          <stop offset="45%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#9333EA" />
        </linearGradient>
      </defs>

      {/* 전체 원형 배경 */}
      <circle cx="14" cy="14" r="13" fill={`url(#${bgGradientId})`} />

      {/* 은은한 테두리 */}
      <circle
        cx="14"
        cy="14"
        r="12.5"
        fill="none"
        stroke="#E9D5FF"
        strokeWidth="1"
      />

      {/* 뒤쪽 몽환적인 보라빛 구슬 느낌 */}
      <circle cx="18.5" cy="9.5" r="4.2" fill="#F5D0FE" opacity="0.55" />
      <circle cx="9" cy="18.2" r="3.5" fill="#DDD6FE" opacity="0.5" />

      {/* 라벤더 줄기 */}
      <path
        d="M14.2 22.2C14 18.4 14.1 14.3 14.5 8"
        stroke="#4ADE80"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />

      {/* 왼쪽 잎 */}
      <path
        d="M13.8 19.6C11.5 19.1 9.8 17.8 8.8 15.6C11.1 15.7 12.9 16.7 14 18.8"
        fill="#86EFAC"
        stroke="#4ADE80"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />

      {/* 오른쪽 잎 */}
      <path
        d="M14.4 20.5C16.6 19.9 18.1 18.6 19 16.6C16.9 16.7 15.3 17.7 14.3 19.6"
        fill="#BBF7D0"
        stroke="#4ADE80"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />

      {/* 라벤더 꽃송이들 */}
      <ellipse
        cx="12.6"
        cy="8.6"
        rx="2"
        ry="2.4"
        transform="rotate(-28 12.6 8.6)"
        fill={`url(#${flowerGradientId})`}
      />
      <ellipse
        cx="16"
        cy="9.8"
        rx="2"
        ry="2.4"
        transform="rotate(30 16 9.8)"
        fill="#A855F7"
      />
      <ellipse
        cx="12.4"
        cy="12.3"
        rx="2"
        ry="2.4"
        transform="rotate(-24 12.4 12.3)"
        fill="#C084FC"
      />
      <ellipse
        cx="16"
        cy="13.7"
        rx="2"
        ry="2.4"
        transform="rotate(28 16 13.7)"
        fill="#9333EA"
      />
      <ellipse
        cx="13.2"
        cy="16.5"
        rx="1.8"
        ry="2.2"
        transform="rotate(-18 13.2 16.5)"
        fill="#B56BF7"
      />

      {/* 꽃 가운데 하이라이트 */}
      <circle cx="12" cy="8" r="0.45" fill="#FDF4FF" opacity="0.9" />
      <circle cx="15.4" cy="9.1" r="0.45" fill="#FDF4FF" opacity="0.85" />
      <circle cx="11.8" cy="11.6" r="0.45" fill="#FDF4FF" opacity="0.85" />
      <circle cx="15.3" cy="13" r="0.45" fill="#FDF4FF" opacity="0.8" />

      {/* 작은 반짝이 */}
      <path
        d="M7.2 7.2L7.8 8.5L9.1 9.1L7.8 9.7L7.2 11L6.6 9.7L5.3 9.1L6.6 8.5L7.2 7.2Z"
        fill="#F0ABFC"
      />
      <path
        d="M21.2 15.5L21.6 16.4L22.5 16.8L21.6 17.2L21.2 18.1L20.8 17.2L19.9 16.8L20.8 16.4L21.2 15.5Z"
        fill="#C4B5FD"
      />

      {/* 작은 보라 점 */}
      <circle cx="22" cy="8" r="0.8" fill="#D8B4FE" />
      <circle cx="6.2" cy="17.4" r="0.7" fill="#E9D5FF" />
    </svg>
  );
}

export default LavenderIcon;