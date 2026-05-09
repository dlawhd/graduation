// --------------------------------------------------------
// SandIcon
// - 모래 테마를 보여주는 작은 SVG 아이콘 컴포넌트
// - React에서 <SandIcon /> 형태로 사용할 수 있다.
// --------------------------------------------------------
const SandIcon = ({ size = 28 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="sand theme icon"
    >
      {/* 배경 그라데이션 정의 */}
      <defs>
        <linearGradient id="sandBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFF7ED" />
          <stop offset="100%" stopColor="#FDE7C7" />
        </linearGradient>

        <linearGradient id="sandDune" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E9C58A" />
          <stop offset="100%" stopColor="#D8A86B" />
        </linearGradient>
      </defs>

      {/* 전체 둥근 배경 */}
      <circle cx="14" cy="14" r="13" fill="url(#sandBg)" />
      <circle cx="14" cy="14" r="12.5" fill="none" stroke="#F3D7AE" strokeWidth="1" />

      {/* 모래 언덕 1 */}
      <path
        d="M4 18C6.2 16.1 8.9 15.4 11.6 16.2C13 16.6 14.4 17.4 16.1 17.4C18.2 17.4 19.5 16.2 21.2 15.7C23.1 15.1 24.5 15.7 26 16.8V24H4V18Z"
        fill="url(#sandDune)"
      />

      {/* 모래 언덕 2 */}
      <path
        d="M2 20C4.4 18 7.5 17.5 10.1 18.4C12.4 19.2 14.1 20.4 16.6 20.2C18.8 20.1 20.6 18.8 22.4 18.7C24 18.7 25.2 19.3 26 20.1V24H2V20Z"
        fill="#E2B878"
      />

      {/* 작은 햇빛 느낌 */}
      <path
        d="M18.2 9.2C18.9 7.9 20.3 7 21.8 7C22.7 7 23.6 7.3 24.3 7.9C23.5 8 22.8 8.3 22.2 8.8C21.3 9.5 20.7 10.5 20.5 11.6C19.4 11.1 18.6 10.3 18.2 9.2Z"
        fill="#FFE5A8"
      />
      <path
        d="M18.2 9.2C18.9 7.9 20.3 7 21.8 7C22.7 7 23.6 7.3 24.3 7.9C23.5 8 22.8 8.3 22.2 8.8C21.3 9.5 20.7 10.5 20.5 11.6C19.4 11.1 18.6 10.3 18.2 9.2Z"
        fill="none"
        stroke="#F6C56B"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />

      {/* 조개 */}
      <path
        d="M8.5 10.8C8.9 9.2 10.2 8 11.8 8C13.6 8 15 9.4 15 11.2C15 13.6 12.1 14.9 10.4 16.8C9.1 15.4 7.9 13.6 8.5 10.8Z"
        fill="#FFF4E1"
        stroke="#E4C39A"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 11.1C10.8 10.5 11.9 10.5 12.5 11.1"
        stroke="#D2A87A"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M9.9 12.8C10.6 13.3 11.6 13.3 12.3 12.8"
        stroke="#D2A87A"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* 반짝이 점 */}
      <circle cx="7.2" cy="7.2" r="0.9" fill="#FFEAA7" />
      <circle cx="16.4" cy="6.2" r="0.7" fill="#FFF5CC" />
      <circle cx="17.6" cy="12.8" r="0.8" fill="#FFF5CC" />
    </svg>
  );
};

export default SandIcon;