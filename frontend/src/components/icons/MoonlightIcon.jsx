import { useId } from "react";

/*
 * MoonlightIcon 역할
 *
 * 달빛 테마를 보여주는 작은 SVG 아이콘 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 남색 밤하늘 배경
 * - 은은한 초승달
 * - 작은 별
 * - 아래쪽 하얀 구름
 * 을 코드로 그린 아이콘이야.
 *
 * 사용하는 방법:
 * <MoonlightIcon />
 * <MoonlightIcon size={64} />
 */
function MoonlightIcon({ size = 28 }) {
  // 같은 아이콘이 여러 번 나와도 gradient id가 겹치지 않게 해준다.
  const id = useId();

  const bgGradientId = `${id}-moonlight-bg`;
  const cloudGradientId = `${id}-moonlight-cloud`;
  const moonGlowId = `${id}-moonlight-glow`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="moonlight theme icon"
    >
      <defs>
        {/* 밤하늘 배경 그라데이션 */}
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E1B4B" />
          <stop offset="48%" stopColor="#312E81" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>

        {/* 구름용 은빛 그라데이션 */}
        <linearGradient id={cloudGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="55%" stopColor="#E0E7FF" />
          <stop offset="100%" stopColor="#C7D2FE" />
        </linearGradient>

        {/* 달 주변 빛 번짐 */}
        <radialGradient id={moonGlowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.75" />
          <stop offset="55%" stopColor="#E0E7FF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#E0E7FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 전체 원형 밤하늘 배경 */}
      <circle cx="14" cy="14" r="13" fill={`url(#${bgGradientId})`} />

      {/* 은은한 테두리 */}
      <circle
        cx="14"
        cy="14"
        r="12.5"
        fill="none"
        stroke="#C7D2FE"
        strokeWidth="1"
        opacity="0.8"
      />

      {/* 달 주변 빛 */}
      <circle cx="18" cy="9.5" r="6.3" fill={`url(#${moonGlowId})`} />

      {/* 초승달 만들기
          큰 흰 원 위에 밤하늘색 원을 살짝 덮어서 초승달처럼 보이게 한다. */}
      <circle cx="18" cy="9.5" r="4.1" fill="#F8FAFC" />
      <circle cx="19.8" cy="8.4" r="4.1" fill="#312E81" />

      {/* 초승달 하이라이트 */}
      <path
        d="M16.1 7.3C15.3 8.6 15.4 10.4 16.4 11.8"
        stroke="#E0E7FF"
        strokeWidth="0.75"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* 큰 별 */}
      <path
        d="M8.2 6.2L8.9 7.8L10.5 8.5L8.9 9.2L8.2 10.8L7.5 9.2L5.9 8.5L7.5 7.8L8.2 6.2Z"
        fill="#FDE68A"
      />

      {/* 작은 별 1 */}
      <path
        d="M22.3 15.2L22.7 16.1L23.6 16.5L22.7 16.9L22.3 17.8L21.9 16.9L21 16.5L21.9 16.1L22.3 15.2Z"
        fill="#FFFFFF"
        opacity="0.95"
      />

      {/* 작은 별 2 */}
      <path
        d="M12.2 11.6L12.6 12.4L13.4 12.8L12.6 13.2L12.2 14L11.8 13.2L11 12.8L11.8 12.4L12.2 11.6Z"
        fill="#E0E7FF"
      />

      {/* 작은 별 점들 */}
      <circle cx="6.5" cy="14.2" r="0.7" fill="#F8FAFC" opacity="0.85" />
      <circle cx="13.4" cy="5.4" r="0.65" fill="#C7D2FE" opacity="0.9" />
      <circle cx="23" cy="7.2" r="0.55" fill="#FFFFFF" opacity="0.8" />

      {/* 아래쪽 구름 */}
      <path
        d="M5.2 20.7C5.7 18.9 7.3 17.9 9 18.3C9.8 16.7 11.3 15.8 13.1 15.9C15.1 16 16.6 17.2 17.2 18.8C18.3 18.2 19.8 18.5 20.6 19.5C22.1 19.6 23.3 20.7 23.5 22.1C21 22.9 17.7 23.2 14.1 23.1C10.4 23 7.3 22.3 5.2 20.7Z"
        fill={`url(#${cloudGradientId})`}
        opacity="0.95"
      />

      {/* 구름 아래 은은한 그림자 */}
      <path
        d="M6.5 21.2C8.5 22.1 11.2 22.5 14.1 22.6C17.1 22.6 19.8 22.4 22 21.7"
        stroke="#A5B4FC"
        strokeWidth="0.7"
        strokeLinecap="round"
        fill="none"
        opacity="0.65"
      />

      {/* 작은 달빛 점 */}
      <circle cx="10.1" cy="18.5" r="0.65" fill="#FFFFFF" opacity="0.8" />
      <circle cx="17.8" cy="20.1" r="0.55" fill="#FFFFFF" opacity="0.75" />
    </svg>
  );
}

export default MoonlightIcon;