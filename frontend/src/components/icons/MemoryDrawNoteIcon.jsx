/*
 * MemoryDrawNoteIcon 역할
 *
 * 이 컴포넌트는 "접힌 쪽지 모양" 공용 SVG 아이콘이다.
 *
 * 쉽게 말하면:
 * - 추억 쪽지 뽑기 모달에서도 쓸 수 있고
 * - 새 쪽지 쓰기 버튼/아이콘에서도 쓸 수 있다.
 *
 * 옵션:
 * - sizeClass: 아이콘 크기 조절
 * - withShadow: 아래 그림자 표시 여부
 * - withDecorations: 하트/반짝이/포인트선 장식 표시 여부
 * - centered: 부모 안에서 가운데 정렬할지 여부
 */
function MemoryDrawNoteIcon({
  className = "",
  sizeClass = "h-24 w-24",
  withShadow = true,
  withDecorations = true,
  centered = true,
}) {
  return (
    <div
      className={`${
        centered ? "flex w-full justify-center" : "inline-flex"
      } ${className}`}
    >
      <svg
        viewBox="0 0 150 150"
        className={`${sizeClass} ${
          withShadow
            ? "drop-shadow-[0_12px_24px_rgba(15,23,42,0.14)]"
            : ""
        }`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="접힌 쪽지 아이콘"
      >
        {/* 바닥 그림자
            - 모달에서는 있으면 더 예쁘고
            - 버튼용 작은 아이콘에서는 없어도 된다. */}
        {withShadow && (
          <ellipse
            cx="76"
            cy="122"
            rx="36"
            ry="8"
            fill="rgba(148,163,184,0.18)"
          />
        )}

        {/* 왼쪽 아래 접힌 종이 면 */}
        <path
          d="M28 82L70 52L72 114L28 82Z"
          fill="#FFFFFF"
          stroke="#5ECFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />

        {/* 오른쪽 아래 접힌 종이 면 */}
        <path
          d="M122 82L80 52L78 114L122 82Z"
          fill="#F8FDFF"
          stroke="#5ECFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />

        {/* 위쪽 큰 종이 면 */}
        <path
          d="M35 34H115L78 66H72L35 34Z"
          fill="#FFFFFF"
          stroke="#5ECFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />

        {/* 가운데 접힌 삼각형 면 */}
        <path
          d="M35 34L72 66L28 82L35 34Z"
          fill="#F1FAFF"
          stroke="#5ECFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />

        {/* 오른쪽 접힌 삼각형 면 */}
        <path
          d="M115 34L78 66L122 82L115 34Z"
          fill="#EAF8FF"
          stroke="#5ECFFF"
          strokeWidth="3.2"
          strokeLinejoin="round"
        />

        {/* 가운데 아래로 내려가는 접힘선 */}
        <path
          d="M72 66L78 114"
          stroke="#5ECFFF"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* 가운데 접힌 부분 강조 */}
        <path
          d="M72 66H78"
          stroke="#38BDF8"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* 장식 요소
            - 모달에서는 감성 있게 보이도록 켜고
            - 새 쪽지 쓰기 작은 아이콘에서는 끄는 걸 추천 */}
        {withDecorations && (
          <>
            {/* 작은 하트 장식 */}
            <path
              d="M70.1 91.5C70.1 91.5 64.8 88.2 64.8 84C64.8 81.8 66.6 80 68.8 80C70.1 80 71.3 80.7 72 81.7C72.7 80.7 73.9 80 75.2 80C77.4 80 79.2 81.8 79.2 84C79.2 88.2 73.9 91.5 73.9 91.5L72 92.8L70.1 91.5Z"
              fill="#FB7185"
            />

            {/* 왼쪽 작은 반짝이 */}
            <path
              d="M44 62L45.4 65.6L49 67L45.4 68.4L44 72L42.6 68.4L39 67L42.6 65.6L44 62Z"
              fill="#FDBA74"
            />

            {/* 오른쪽 작은 반짝이 */}
            <path
              d="M105 64L106.6 68.2L111 70L106.6 71.8L105 76L103.4 71.8L99 70L103.4 68.2L105 64Z"
              fill="#FBBF24"
            />

            {/* 위쪽 작은 포인트 선 */}
            <path
              d="M55 43H94"
              stroke="#FDBA74"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.8"
            />
          </>
        )}
      </svg>
    </div>
  );
}

export default MemoryDrawNoteIcon;