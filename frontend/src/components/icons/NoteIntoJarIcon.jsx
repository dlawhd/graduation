import { useId } from "react";

/*
 * NoteIntoJarIcon 역할
 *
 * 이 컴포넌트는 "쪽지가 저금통으로 들어가려는 느낌"을
 * 심플하고 자연스럽게 보여주는 SVG 아이콘이야.
 *
 * 이번 버전의 핵심:
 * 1. 저금통 몸통은 하얀색 계열로 부드럽게 표현
 * 2. 저금통 안에는 접힌 쪽지 3장이 들어가 보이게 구성
 * 3. 저금통 뚜껑은 마지막에 그려서 앞쪽에 보이게 처리
 */
function NoteIntoJarIcon({
  className = "",
  sizeClass = "h-28 w-28",
  withShadow = true,
}) {
  // SVG 안에서 gradient id가 다른 SVG와 겹치지 않도록 고유 id를 만든다.
  const id = useId();

  // 저금통/쪽지에 사용할 gradient id
  const jarBodyGradientId = `${id}-jar-body`;
  const jarLidGradientId = `${id}-jar-lid`;
  const noteGradientId = `${id}-note`;

  return (
    <div className={`flex w-full justify-center ${className}`}>
      <svg
        viewBox="0 0 260 180"
        className={`${sizeClass} ${
          withShadow
            ? "drop-shadow-[0_12px_24px_rgba(15,23,42,0.14)]"
            : ""
        }`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="저금통에 쪽지를 넣는 아이콘"
      >
        <defs>
          {/* 저금통 몸통 색
              - 흰색 기반이지만 아주 살짝 차가운 톤을 섞어서
                너무 평면적으로 보이지 않게 한다. */}
          <linearGradient
            id={jarBodyGradientId}
            x1="30"
            y1="70"
            x2="118"
            y2="156"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F6FBFF" />
          </linearGradient>

          {/* 저금통 뚜껑 색
              - 완전 새하얀색보다 살짝 따뜻한 흰색 + 연한 하늘색 테두리로
                몸통과 잘 어울리게 표현한다. */}
          <linearGradient
            id={jarLidGradientId}
            x1="28"
            y1="42"
            x2="102"
            y2="60"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F2F8FD" />
          </linearGradient>

          {/* 바깥에서 날아오는 쪽지 색 */}
          <linearGradient
            id={noteGradientId}
            x1="0"
            y1="0"
            x2="44"
            y2="44"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#EEF9FF" />
          </linearGradient>
        </defs>

        {/* 저금통 아래 그림자 */}
        {withShadow && (
          <ellipse
            cx="78"
            cy="156"
            rx="40"
            ry="8"
            fill="rgba(148,163,184,0.18)"
          />
        )}

        {/* 점선 곡선
            - 오른쪽 위의 쪽지가 왼쪽 저금통으로 들어가려는 흐름 */}
        <path
          d="M106 56C144 12 190 12 232 38"
          stroke="#A3A3A3"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="8 9"
          opacity="0.9"
        />

        {/* -------------------------------- */}
        {/* 오른쪽 위: 바깥에 있는 접힌 쪽지 */}
        {/* -------------------------------- */}
        <g transform="translate(194 14) rotate(10) scale(1.18)">
          {/* 왼쪽 종이 면 */}
          <path
            d="M0 22L16 8L18 38L0 22Z"
            fill={`url(#${noteGradientId})`}
            stroke="#5ECFFF"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />

          {/* 오른쪽 종이 면 */}
          <path
            d="M44 22L28 8L26 38L44 22Z"
            fill="#F8FDFF"
            stroke="#5ECFFF"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />

          {/* 위쪽 종이 면 */}
          <path
            d="M6 0H38L28 12H16L6 0Z"
            fill="#FFFFFF"
            stroke="#5ECFFF"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />

          {/* 왼쪽 접힌 면 */}
          <path
            d="M6 0L16 12L0 22L6 0Z"
            fill="#F1FAFF"
            stroke="#5ECFFF"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />

          {/* 오른쪽 접힌 면 */}
          <path
            d="M38 0L28 12L44 22L38 0Z"
            fill="#EAF8FF"
            stroke="#5ECFFF"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />

          {/* 가운데 접힘선 */}
          <path
            d="M16 12L26 38"
            stroke="#5ECFFF"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>

        {/* -------------------------------- */}
        {/* 왼쪽 아래: 저금통 */}
        {/* -------------------------------- */}
        <g transform="translate(14 40) scale(1.5)">
          {/* 저금통 몸통
              - 몸통은 먼저 그리고 */}
          <path
            d="M24 18
               C14 28, 8 42, 8 58
               V72
               C8 90, 22 102, 38 102
               H62
               C78 102, 92 90, 92 72
               V58
               C92 42, 86 28, 76 18
               C70 12, 63 9, 56 9
               H44
               C37 9, 30 12, 24 18Z"
            fill={`url(#${jarBodyGradientId})`}
            stroke="#D6EAF7"
            strokeWidth="4"
            strokeLinejoin="round"
          />

          {/* 저금통 안쪽 하이라이트 */}
          <ellipse
            cx="50"
            cy="57"
            rx="24"
            ry="31"
            fill="rgba(255,255,255,0.42)"
          />

          {/* -------------------------------- */}
          {/* 저금통 안의 쪽지 3장 */}
          {/* -------------------------------- */}

          {/* 1번 쪽지 - 왼쪽 */}
          <g transform="translate(29 44) rotate(-18) scale(0.58)">
            <path
              d="M0 22L16 8L18 38L0 22Z"
              fill="#FFFFFF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M44 22L28 8L26 38L44 22Z"
              fill="#F9FDFF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M6 0H38L28 12H16L6 0Z"
              fill="#FFFFFF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M6 0L16 12L0 22L6 0Z"
              fill="#F3FBFF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M38 0L28 12L44 22L38 0Z"
              fill="#EEF9FF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M16 12L26 38"
              stroke="#A9DEF9"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* 2번 쪽지 - 가운데 뒤쪽 */}
          <g transform="translate(41 36) rotate(6) scale(0.62)">
            <path
              d="M0 22L16 8L18 38L0 22Z"
              fill="#FFFFFF"
              stroke="#B4E3FA"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M44 22L28 8L26 38L44 22Z"
              fill="#F9FDFF"
              stroke="#B4E3FA"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M6 0H38L28 12H16L6 0Z"
              fill="#FFFFFF"
              stroke="#B4E3FA"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M6 0L16 12L0 22L6 0Z"
              fill="#F3FBFF"
              stroke="#B4E3FA"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M38 0L28 12L44 22L38 0Z"
              fill="#EEF9FF"
              stroke="#B4E3FA"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M16 12L26 38"
              stroke="#B4E3FA"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* 3번 쪽지 - 오른쪽 */}
          <g transform="translate(54 47) rotate(18) scale(0.56)">
            <path
              d="M0 22L16 8L18 38L0 22Z"
              fill="#FFFFFF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M44 22L28 8L26 38L44 22Z"
              fill="#F9FDFF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M6 0H38L28 12H16L6 0Z"
              fill="#FFFFFF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M6 0L16 12L0 22L6 0Z"
              fill="#F3FBFF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M38 0L28 12L44 22L38 0Z"
              fill="#EEF9FF"
              stroke="#A9DEF9"
              strokeWidth="2.3"
              strokeLinejoin="round"
            />
            <path
              d="M16 12L26 38"
              stroke="#A9DEF9"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* -------------------------------- */}
          {/* 저금통 뚜껑 */}
          {/* -------------------------------- */}
          {/* 뚜껑은 마지막에 그려서 "앞에" 보이게 만든다. */}
          <rect
            x="12"
            y="0"
            width="76"
            height="22"
            rx="11"
            fill={`url(#${jarLidGradientId})`}
            stroke="#D6EAF7"
            strokeWidth="2.3"
          />

          {/* 저금통 입구도 뚜껑과 함께 마지막에 그린다. */}
          <rect
            x="34"
            y="8"
            width="32"
            height="6"
            rx="3"
            fill="#5F4A3A"
            opacity="0.88"
          />
        </g>
      </svg>
    </div>
  );
}

export default NoteIntoJarIcon;