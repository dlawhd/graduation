import { useId } from "react";

/*
 * MemoryJarLogoIcon 역할
 *
 * 상단 헤더에서 MEMORY JAR 브랜드 옆에 보여주는
 * 작은 유리 저금통 로고 아이콘이야.
 *
 * 로그인 화면의 저금통과 같은 특징을 사용해.
 * - 무색 반투명 유리 몸통
 * - 햇빛을 받은 듯한 옅은 무지개 테두리
 * - 무색 유리 뚜껑
 * - 안쪽에 담긴 작은 하트 쪽지
 *
 * SVG로 만들었기 때문에 화면 크기가 바뀌어도 선명하게 보여.
 */
export default function MemoryJarLogoIcon({
  className = "h-9 w-9",
}) {
  /*
   * 같은 화면에서 아이콘이 여러 번 사용되어도
   * SVG gradient ID가 서로 겹치지 않도록 고유 ID를 만든다.
   */
  const rawId = useId().replaceAll(":", "");

  const edgeGradientId = `${rawId}-logo-edge`;
  const glassGradientId = `${rawId}-logo-glass`;
  const lidGradientId = `${rawId}-logo-lid`;

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* 병 가장자리에 보이는 옅은 무지개빛 */}
        <linearGradient
          id={edgeGradientId}
          x1="9"
          y1="11"
          x2="39"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7DD3FC" />
          <stop offset="0.25" stopColor="#C4B5FD" />
          <stop offset="0.48" stopColor="#FBCFE8" />
          <stop offset="0.68" stopColor="#FEF08A" />
          <stop offset="0.84" stopColor="#A7F3D0" />
          <stop offset="1" stopColor="#7DD3FC" />
        </linearGradient>

        {/* 투명한 유리 몸통 안쪽 색상 */}
        <linearGradient
          id={glassGradientId}
          x1="15"
          y1="16"
          x2="33"
          y2="42"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" stopOpacity="0.96" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.82" />
          <stop offset="1" stopColor="#ECFDF5" stopOpacity="0.9" />
        </linearGradient>

        {/* 무색 유리 뚜껑 안쪽 색상 */}
        <linearGradient
          id={lidGradientId}
          x1="13"
          y1="6"
          x2="35"
          y2="13"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" stopOpacity="0.96" />
          <stop offset="0.5" stopColor="#F8FAFC" stopOpacity="0.88" />
          <stop offset="1" stopColor="#ECFEFF" stopOpacity="0.92" />
        </linearGradient>
      </defs>

      {/* ==================================================
          무색 유리 뚜껑
         ================================================== */}

      {/* 뚜껑 바깥의 무지개 테두리 */}
      <rect
        x="11"
        y="5"
        width="26"
        height="10"
        rx="5"
        fill={`url(#${edgeGradientId})`}
      />

      {/* 실제 무색 뚜껑 안쪽 */}
      <rect
        x="12.4"
        y="6.4"
        width="23.2"
        height="7.2"
        rx="3.6"
        fill={`url(#${lidGradientId})`}
      />

      {/* 쪽지를 넣는 투입구 */}
      <rect
        x="18"
        y="8.7"
        width="12"
        height="2.4"
        rx="1.2"
        fill="#94A3B8"
        fillOpacity="0.62"
      />

      {/* 뚜껑 위쪽 반사광 */}
      <path
        d="M15.5 7.7H22"
        stroke="white"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />

      {/* ==================================================
          무색 유리 저금통 몸통
         ================================================== */}

      {/* 몸통 바깥쪽 무지개 테두리 */}
      <path
        d="M14.2 14.5C11.4 17 10 20.4 10 24.2V33.2C10 39.7 15.1 44 21.3 44H26.7C32.9 44 38 39.7 38 33.2V24.2C38 20.4 36.6 17 33.8 14.5H14.2Z"
        fill={`url(#${edgeGradientId})`}
      />

      {/* 실제 무색 유리 몸통 */}
      <path
        d="M15.4 16.1C13 18.3 11.7 21.1 11.7 24.5V32.9C11.7 38.4 16 42.3 21.5 42.3H26.5C32 42.3 36.3 38.4 36.3 32.9V24.5C36.3 21.1 35 18.3 32.6 16.1H15.4Z"
        fill={`url(#${glassGradientId})`}
      />

      {/* 왼쪽 유리 반사광 */}
      <path
        d="M14.6 21.3C13.8 25.6 13.9 32.7 15.1 36.3"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeOpacity="0.78"
      />

      {/* 오른쪽의 아주 옅은 유리 반사광 */}
      <path
        d="M33.7 22.6C34.2 26 34.2 30.2 33.8 32.6"
        stroke="#CFFAFE"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />

      {/* ==================================================
          저금통 안에 들어 있는 하트 쪽지
         ================================================== */}

      {/* 쪽지 본체 */}
      <path
        d="M19.2 23H26.6L29 25.4V34C29 35.1 28.1 36 27 36H19.2C18.1 36 17.2 35.1 17.2 34V25C17.2 23.9 18.1 23 19.2 23Z"
        fill="white"
        fillOpacity="0.92"
        stroke="#7DD3FC"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* 쪽지 접힌 모서리 */}
      <path
        d="M26.6 23V25.4H29"
        stroke="#7DD3FC"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* 쪽지 안의 작은 하트 */}
      <path
        d="M23.1 29.2C22 27.9 20 28.7 20.2 30.2C20.5 31.5 23.1 33 23.1 33C23.1 33 25.7 31.5 26 30.2C26.2 28.7 24.2 27.9 23.1 29.2Z"
        fill="#34D399"
        fillOpacity="0.22"
        stroke="#10B981"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />

      {/* 작은 반짝임 */}
      <path
        d="M32.2 18V21M30.7 19.5H33.7"
        stroke="#67E8F9"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}