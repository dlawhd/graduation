import { useId } from "react";

/*
 * DewIcon 역할
 *
 * 이슬 테마를 보여주는 작은 SVG 아이콘 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 연하늘/민트색 둥근 배경
 * - 투명한 물방울
 * - 작은 거품
 * - 초록 잎
 * - 하얀 반짝이
 * 를 코드로 그린 아이콘이야.
 *
 * 사용하는 방법:
 * <DewIcon />
 * <DewIcon size={64} />
 */
function DewIcon({ size = 28 }) {
  // 같은 아이콘이 여러 번 나와도 gradient id가 겹치지 않게 해준다.
  const rawId = useId();

  // React useId에는 ":" 문자가 들어갈 수 있어서 SVG id용으로 깔끔하게 정리한다.
  const safeId = rawId.replace(/:/g, "");

  const bgGradientId = `${safeId}-dew-bg`;
  const dropGradientId = `${safeId}-dew-drop`;
  const leafGradientId = `${safeId}-dew-leaf`;
  const bubbleGradientId = `${safeId}-dew-bubble`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="dew theme icon"
    >
      <defs>
        {/* 연하늘 + 민트 느낌의 둥근 배경 */}
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ECFEFF" />
          <stop offset="48%" stopColor="#F0FDFA" />
          <stop offset="100%" stopColor="#DBEAFE" />
        </linearGradient>

        {/* 투명한 물방울 느낌 */}
        <linearGradient id={dropGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#A7F3D0" stopOpacity="0.86" />
          <stop offset="100%" stopColor="#7DD3FC" stopOpacity="0.88" />
        </linearGradient>

        {/* 초록 잎 그라데이션 */}
        <linearGradient id={leafGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#BBF7D0" />
          <stop offset="55%" stopColor="#5EEAD4" />
          <stop offset="100%" stopColor="#14B8A6" />
        </linearGradient>

        {/* 작은 거품 그라데이션 */}
        <radialGradient id={bubbleGradientId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#BAE6FD" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#67E8F9" stopOpacity="0.35" />
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
        stroke="#A7F3D0"
        strokeWidth="1"
        opacity="0.85"
      />

      {/* 뒤쪽 민트빛 번짐 */}
      <circle cx="10.2" cy="18.4" r="5" fill="#CCFBF1" opacity="0.55" />
      <circle cx="19.2" cy="9.2" r="4.2" fill="#BAE6FD" opacity="0.48" />

      {/* 아래쪽 초록 잎 */}
      <path
        d="M7.2 19.9C9.7 16.9 13.5 16.4 16.9 18.4C14.8 21.1 10.6 22.1 7.2 19.9Z"
        fill={`url(#${leafGradientId})`}
        stroke="#14B8A6"
        strokeWidth="0.65"
        strokeLinejoin="round"
      />

      {/* 잎의 가운데 선 */}
      <path
        d="M8.7 19.7C11 19.1 13.2 18.8 15.8 18.7"
        stroke="#F0FDFA"
        strokeWidth="0.7"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* 메인 물방울 */}
      <path
        d="M14.3 5.7C11.8 8.9 9.2 12.3 9.2 15.6C9.2 18.8 11.4 21.1 14.3 21.1C17.2 21.1 19.4 18.8 19.4 15.6C19.4 12.3 16.8 8.9 14.3 5.7Z"
        fill={`url(#${dropGradientId})`}
        stroke="#38BDF8"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />

      {/* 물방울 안쪽 하이라이트 */}
      <path
        d="M12.3 11.2C11.4 12.6 11.1 14.4 11.6 16.1"
        stroke="#FFFFFF"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />

      {/* 물방울 아래쪽 그림자 */}
      <path
        d="M11.3 17.3C12.2 18.6 13.4 19.2 14.8 19.1C16.1 19 17 18.4 17.6 17.4"
        stroke="#0891B2"
        strokeWidth="0.55"
        strokeLinecap="round"
        fill="none"
        opacity="0.35"
      />

      {/* 작은 거품들 */}
      <circle
        cx="7.6"
        cy="10.6"
        r="2"
        fill={`url(#${bubbleGradientId})`}
        stroke="#A5F3FC"
        strokeWidth="0.5"
        opacity="0.95"
      />
      <circle
        cx="21.2"
        cy="15.4"
        r="1.7"
        fill={`url(#${bubbleGradientId})`}
        stroke="#BAE6FD"
        strokeWidth="0.5"
        opacity="0.9"
      />
      <circle
        cx="20.6"
        cy="7.2"
        r="1"
        fill="#FFFFFF"
        opacity="0.82"
      />

      {/* 작은 반짝이 */}
      <path
        d="M6.4 15.2L6.8 16.1L7.7 16.5L6.8 16.9L6.4 17.8L6 16.9L5.1 16.5L6 16.1L6.4 15.2Z"
        fill="#67E8F9"
        opacity="0.95"
      />

      <path
        d="M22.3 10.2L22.7 11L23.5 11.4L22.7 11.8L22.3 12.6L21.9 11.8L21.1 11.4L21.9 11L22.3 10.2Z"
        fill="#FFFFFF"
        opacity="0.95"
      />

      {/* 작은 물빛 점 */}
      <circle cx="8.8" cy="6.5" r="0.65" fill="#A5F3FC" />
      <circle cx="17.8" cy="6.1" r="0.55" fill="#FFFFFF" opacity="0.85" />
    </svg>
  );
}

export default DewIcon;