/*
 * InviteLetterIcon 역할
 *
 * 초대 페이지에서 사용하는 초대 편지 SVG 아이콘이야.
 *
 * opened = false
 * - 닫힌 봉투 형태의 "초대장을 받기 전" 상태를 보여줘.
 *
 * opened = true
 * - 펼쳐진 초대 편지/초대 카드 형태의
 *   "초대장을 열어보고 수락한 뒤" 상태를 보여줘.
 *
 * 불필요한 반짝이 장식 없이,
 * 초대장 자체가 주인공이 되도록 단순하게 구성했어.
 */
export default function InviteLetterIcon({
  className = "h-40 w-40",
  opened = false,
}) {
  return (
    <svg
      viewBox="0 0 240 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/*
       * 편지 전체를 천천히 위아래로 움직이는 애니메이션
       *
       * 배경 원은 움직이지 않고,
       * 아래에서 invite-letter-float 클래스가 붙은 편지만 움직여.
       */}
      <style>
        {`
          .invite-letter-float {
            transform-box: fill-box;
            transform-origin: center;
            animation: invite-letter-floating 3.6s ease-in-out infinite;
          }

          @keyframes invite-letter-floating {
            0%,
            100% {
              transform: translateY(-4px);
            }

            50% {
              transform: translateY(5px);
            }
          }

          /*
           * 사용자가 기기에서 애니메이션 줄이기를 설정했다면
           * 편지를 움직이지 않게 해서 화면을 편안하게 보여줘.
           */
          @media (prefers-reduced-motion: reduce) {
            .invite-letter-float {
              animation: none;
            }
          }
        `}
      </style>

      <defs>
        <linearGradient id="invite-soft-bg" x1="35" y1="25" x2="205" y2="215">
          <stop offset="0%" stopColor="#F1FCF8" />
          <stop offset="52%" stopColor="#F8FCFF" />
          <stop offset="100%" stopColor="#F7F3FF" />
        </linearGradient>

        <linearGradient id="invite-envelope-body" x1="56" y1="78" x2="188" y2="178">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F1F7FD" />
        </linearGradient>

        <linearGradient id="invite-envelope-flap" x1="74" y1="68" x2="168" y2="136">
          <stop offset="0%" stopColor="#EAF8F4" />
          <stop offset="100%" stopColor="#EAF0FF" />
        </linearGradient>

        <linearGradient id="invite-paper" x1="70" y1="40" x2="170" y2="155">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F9FBFF" />
        </linearGradient>

        <linearGradient id="invite-accent" x1="80" y1="80" x2="165" y2="170">
          <stop offset="0%" stopColor="#22C55E" />
          <stop offset="48%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>

        <filter
          id="invite-shadow"
          x="24"
          y="24"
          width="192"
          height="192"
          filterUnits="userSpaceOnUse"
        >
          <feDropShadow
            dx="0"
            dy="16"
            stdDeviation="14"
            floodColor="#0F172A"
            floodOpacity="0.10"
          />
        </filter>
      </defs>

      {/* 뒤 배경은 움직이지 않고 제자리에 고정한다. */}
      <circle cx="120" cy="120" r="96" fill="url(#invite-soft-bg)" />

      {/*
       * 닫힌 봉투와 열린 편지를 모두 감싸는 움직임 영역
       *
       * 이 그룹만 위아래로 움직이기 때문에
       * 배경 원까지 흔들리지 않고 편지만 둥실둥실 떠 보여.
       */}
      <g className="invite-letter-float">
        {!opened ? (
        <>
          {/*
           * 완전히 닫힌 초대 봉투
           *
           * 위로 튀어나오는 편지나 열린 덮개 없이,
           * 봉투 앞면 위에 아래 방향 삼각형 덮개를 올려서
           * 확실하게 닫힌 봉투처럼 보이게 한다.
           */}
          <g filter="url(#invite-shadow)">
            {/*
             * 봉투 본체
             *
             * 채우기 영역과 테두리를 따로 그려서,
             * 봉투 위쪽에 가로 테두리가 보이지 않게 한다.
             */}
            <path
              d="
                M52 100
                H188
                V158
                C188 166.284 181.284 173 173 173
                H67
                C58.716 173 52 166.284 52 158
                Z
              "
              fill="url(#invite-envelope-body)"
            />

            {/*
             * 봉투 외곽선
             *
             * 위쪽 선은 그리지 않고
             * 왼쪽, 아래쪽, 오른쪽 테두리만 그린다.
             */}
            <path
              d="
                M52 100
                V158
                C52 166.284 58.716 173 67 173
                H173
                C181.284 173 188 166.284 188 158
                V100
              "
              fill="none"
              stroke="#D9E7F4"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* 봉투 아래 양쪽 종이가 접힌 선 */}
            <path
              d="M52 158L103 119"
              stroke="#DCE9F5"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            <path
              d="M188 158L137 119"
              stroke="#DCE9F5"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/*
             * 닫힌 윗덮개
             *
             * 이전 코드의 y=66까지 올라가던 부분을 제거했다.
             * 봉투 위쪽 두 끝에서 가운데 아래로 내려오는
             * 단순한 삼각형이므로 닫힌 상태로 보인다.
             */}
            <path
              d="M52 100L120 143L188 100Z"
              fill="url(#invite-envelope-flap)"
              stroke="#D3E3F2"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </g>
        </>
      ) : (
        <>
          {/*
           * 열린 초대 편지
           *
           * 편지지 두 장을 겹치는 방식 대신,
           * 열린 봉투에서 편지지가 위로 나온 모습을 표현한다.
           *
           * 그림을 약간 확대해서 성공 화면에서도
           * 편지와 봉투가 충분히 크게 보이게 한다.
           */}
          <g
            filter="url(#invite-shadow)"
            transform="translate(-12 -10) scale(1.1)"
          >
            {/*
             * 열린 봉투의 뒤쪽 덮개
             *
             * 봉투가 열리면서 뒤로 펼쳐진 삼각형 부분이다.
             * 편지지보다 먼저 그려 편지 뒤에 보이도록 한다.
             */}
            <path
              d="M50 112L120 53L190 112Z"
              fill="url(#invite-envelope-flap)"
              stroke="#D6E5F3"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/*
             * 봉투에서 꺼낸 편지지
             *
             * 아래쪽 일부는 나중에 그리는 봉투 본체에 가려져서
             * 실제로 봉투 안에서 편지가 나온 것처럼 보인다.
             */}
            <rect
              x="72"
              y="42"
              width="96"
              height="120"
              rx="15"
              fill="url(#invite-paper)"
              stroke="#E0EAF4"
              strokeWidth="2"
            />

            {/* 편지지 상단의 초대장 라벨 */}
            <rect
              x="88"
              y="58"
              width="64"
              height="18"
              rx="9"
              fill="#ECFDF5"
            />

            <text
              x="120"
              y="70"
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="#10B981"
              letterSpacing="1.4"
            >
              초대장
            </text>

            {/* 편지 내용을 표현하는 줄 */}
            <path
              d="M87 91H153"
              stroke="#D8E7F4"
              strokeWidth="5"
              strokeLinecap="round"
            />

            <path
              d="M87 106H145"
              stroke="#E1ECF6"
              strokeWidth="5"
              strokeLinecap="round"
            />

            <path
              d="M87 121H137"
              stroke="#E8F0F8"
              strokeWidth="5"
              strokeLinecap="round"
            />

            {/* Memory Jar 색상을 나타내는 작은 서명선 */}
            <path
              d="M88 138H126"
              stroke="url(#invite-accent)"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/*
             * 열린 봉투의 본체
             *
             * 편지지의 아래쪽을 덮어서
             * 편지지가 봉투 안에 들어 있는 것처럼 보여준다.
             */}
            <path
              d="
                M50 112
                H190
                V162
                C190 171.941 181.941 180 172 180
                H68
                C58.059 180 50 171.941 50 162
                Z
              "
              fill="url(#invite-envelope-body)"
              stroke="#D8E6F3"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/* 봉투 왼쪽에서 가운데로 접힌 종이 */}
            <path
              d="M50 113L120 158L50 178Z"
              fill="#F5F9FD"
              stroke="#DCE9F5"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/* 봉투 오른쪽에서 가운데로 접힌 종이 */}
            <path
              d="M190 113L120 158L190 178Z"
              fill="#F2F8FC"
              stroke="#DCE9F5"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/*
             * 봉투 앞쪽 아래 덮개
             *
             * 좌우 접힌 부분보다 나중에 그려서
             * 봉투 앞면이 자연스럽게 겹쳐 보이게 한다.
             */}
            <path
              d="M50 178L120 134L190 178Z"
              fill="#FBFDFF"
              stroke="#D7E6F4"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </g>
        </>
        )}
      </g>
    </svg>
  );
}