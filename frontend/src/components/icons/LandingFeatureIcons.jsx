/*
 * LandingFeatureIcons 역할
 *
 * 로그인 전 랜딩 화면의 기능 카드에서 사용하는 공용 SVG 아이콘 모음이야.
 * 운영체제마다 모양이 달라지는 이모지 대신,
 * 같은 선 굵기와 둥근 모서리를 사용하는 SVG 아이콘으로 통일해서
 * 카드 제목과 더 잘 어울리도록 만든다.
 *
 * 중요:
 * - 함수 이름은 기존과 동일하게 유지해서 Home.jsx import를 바꾸지 않아도 된다.
 * - 아이콘 의미만 새 컨셉으로 변경했다.
 *
 * 새 컨셉
 * 1) SecureMemoryIcon  -> "추억을 담는 시간"
 *    하트 쪽지 ↓ 작은 저금통
 *
 * 2) SharedMemoryIcon  -> "함께 채우는 마음"
 *    좌우 위쪽의 하트 쪽지 2장 → 가운데 작은 저금통
 *
 * 3) SpecialOpenIcon   -> "다시 만나는 순간"
 *    열린 저금통 ↑ 쪽지 ✦ ♡ ✦
 */

/*
 * SecureMemoryIcon 역할
 *
 * "추억을 담는 시간" 카드에 사용하는 아이콘이야.
 * 하트가 담긴 쪽지가 아래 저금통으로 들어가는 모습을 표현해.
 */
export function SecureMemoryIcon({ className = "h-12 w-14" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 아래쪽 작은 저금통 몸통 */}
      <path
        d="M15 24.5C12.8 27 11.5 30.2 11.5 33.7V35.6C11.5 39.7 14.8 43 18.9 43H29.1C33.2 43 36.5 39.7 36.5 35.6V33.7C36.5 30.2 35.2 27 33 24.5H15Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />

      {/* 저금통 입구 */}
      <path
        d="M17.5 21.5H30.5"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* 저금통 앞쪽 하트 */}
      <path
        d="M24 31.6C22.2 29.4 19.1 30.7 19.5 33.2C19.9 35.4 24 37.8 24 37.8C24 37.8 28.1 35.4 28.5 33.2C28.9 30.7 25.8 29.4 24 31.6Z"
        fill="white"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />

      {/* 위쪽 하트 쪽지 */}
      <path
        d="M18 7.5H28.8L32 10.7V18.8C32 20 31 21 29.8 21H18C16.8 21 15.8 20 15.8 18.8V9.7C15.8 8.5 16.8 7.5 18 7.5Z"
        fill="white"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M28.8 7.5V10.8H32"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* 쪽지 안의 작은 하트 */}
      <path
        d="M23.9 17.1C22.6 15.6 20.3 16.5 20.6 18.1C20.8 19.5 23.9 21.3 23.9 21.3C23.9 21.3 27 19.5 27.2 18.1C27.5 16.5 25.2 15.6 23.9 17.1Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* 아래 방향 화살표 */}
      <path
        d="M24 22.8V26.5"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <path
        d="M21.7 24.8L24 27.1L26.3 24.8"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 작은 반짝이 */}
      <path
        d="M34.8 9.2V12M33.4 10.6H36.2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/*
 * SharedMemoryIcon 역할
 *
 * "함께 채우는 마음" 카드에 사용하는 아이콘이야.
 * 좌우의 하트 쪽지 두 장이 하나의 저금통으로 모이는 모습을 표현해.
 */
export function SharedMemoryIcon({ className = "h-12 w-14" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 가운데 작은 저금통 */}
      <path
        d="M15.5 24.8C13.5 27 12.3 29.9 12.3 33V34.8C12.3 38.5 15.3 41.5 19 41.5H29C32.7 41.5 35.7 38.5 35.7 34.8V33C35.7 29.9 34.5 27 32.5 24.8H15.5Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />

      {/* 저금통 입구 */}
      <path
        d="M18 22.1H30"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* 저금통 안의 작은 하트 */}
      <path
        d="M24 31.4C22.6 29.8 20.1 30.8 20.4 32.7C20.7 34.3 24 36.2 24 36.2C24 36.2 27.3 34.3 27.6 32.7C27.9 30.8 25.4 29.8 24 31.4Z"
        fill="white"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* 왼쪽 하트 쪽지 */}
      <path
        d="M8.7 9.5H17.2L19.4 11.7V17.4C19.4 18.5 18.5 19.4 17.4 19.4H8.7C7.6 19.4 6.7 18.5 6.7 17.4V11.5C6.7 10.4 7.6 9.5 8.7 9.5Z"
        fill="white"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M17.2 9.5V11.7H19.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M13.1 16.2C12.1 15.1 10.4 15.7 10.6 17C10.8 18 13.1 19.3 13.1 19.3C13.1 19.3 15.4 18 15.6 17C15.8 15.7 14.1 15.1 13.1 16.2Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* 오른쪽 하트 쪽지 */}
      <path
        d="M30.8 9.5H39.3L41.5 11.7V17.4C41.5 18.5 40.6 19.4 39.5 19.4H30.8C29.7 19.4 28.8 18.5 28.8 17.4V11.5C28.8 10.4 29.7 9.5 30.8 9.5Z"
        fill="white"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M39.3 9.5V11.7H41.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M35.2 16.2C34.2 15.1 32.5 15.7 32.7 17C32.9 18 35.2 19.3 35.2 19.3C35.2 19.3 37.5 18 37.7 17C37.9 15.7 36.2 15.1 35.2 16.2Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* 왼쪽 쪽지에서 저금통으로 향하는 곡선 */}
      <path
        d="M16.8 21.3C18.3 22 19.6 22.9 20.8 24.3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M18.8 23.6L20.9 24.4L19.9 26.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 오른쪽 쪽지에서 저금통으로 향하는 곡선 */}
      <path
        d="M31.2 21.3C29.7 22 28.4 22.9 27.2 24.3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M29.2 23.6L27.1 24.4L28.1 26.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/*
 * SpecialOpenIcon 역할
 *
 * "다시 만나는 순간" 카드에 사용하는 아이콘이야.
 *
 * 저금통 뚜껑이 오른쪽 위로 완전히 열리고,
 * 열린 입구에서 하트 쪽지가 올라오는 모습을 표현해.
 *
 * 뚜껑과 몸통 사이를 확실하게 벌려 두어서
 * 작은 크기에서도 "저금통이 열렸다"는 상태를 쉽게 알아볼 수 있어.
 */
export function SpecialOpenIcon({ className = "h-12 w-14" }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* 오른쪽 위로 열린 저금통 뚜껑
          몸통과 떨어뜨리고 살짝 기울여서 열린 상태를 명확히 보여준다. */}
      <rect
        x="27"
        y="7"
        width="14"
        height="5.5"
        rx="2.75"
        fill="white"
        stroke="currentColor"
        strokeWidth="2.2"
        transform="rotate(14 34 9.75)"
      />

      {/* 뚜껑 안쪽 선 */}
      <path
        d="M30.4 9.3L37.2 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* 열린 저금통 몸통 */}
      <path
        d="M14.5 21.5C12.2 24 11 27.2 11 30.7V33.2C11 38.1 14.9 42 19.8 42H28.2C33.1 42 37 38.1 37 33.2V30.7C37 27.2 35.8 24 33.5 21.5H14.5Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />

      {/* 저금통의 열린 입구
          타원으로 그려서 안쪽이 열려 있다는 느낌을 준다. */}
      <ellipse
        cx="24"
        cy="21.5"
        rx="9.5"
        ry="3.2"
        fill="white"
        stroke="currentColor"
        strokeWidth="2.2"
      />

      {/* 입구 안쪽의 그림자 */}
      <path
        d="M17 21.8C20.8 23.5 27.2 23.5 31 21.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
      />

      {/* 열린 입구에서 올라오는 쪽지 */}
      <path
        d="M19.2 9.5H26.5L29.2 12.2V21C29.2 22 28.4 22.8 27.4 22.8H19.2C18.2 22.8 17.4 22 17.4 21V11.3C17.4 10.3 18.2 9.5 19.2 9.5Z"
        fill="white"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* 쪽지의 접힌 모서리 */}
      <path
        d="M26.5 9.5V12.2H29.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* 쪽지 안의 하트 */}
      <path
        d="M23.3 16.1C22.1 14.7 20.1 15.5 20.3 17.1C20.6 18.4 23.3 20 23.3 20C23.3 20 26 18.4 26.3 17.1C26.5 15.5 24.5 14.7 23.3 16.1Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* 쪽지가 올라오는 움직임을 보여주는 왼쪽 선 */}
      <path
        d="M14.5 15.7L12.6 13.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />

      {/* 쪽지가 올라오는 움직임을 보여주는 위쪽 선 */}
      <path
        d="M20.6 6.5V3.8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />

      {/* 뚜껑이 열린 순간의 오른쪽 반짝이 */}
      <path
        d="M41 18V22M39 20H43"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* 왼쪽 작은 반짝이 */}
      <path
        d="M8.5 21V24M7 22.5H10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />

      {/* 몸통 안에 남아 있는 작은 하트 */}
      <path
        d="M24 30.4C22.3 28.4 19.4 29.6 19.8 31.8C20.1 33.7 24 35.9 24 35.9C24 35.9 27.9 33.7 28.2 31.8C28.6 29.6 25.7 28.4 24 30.4Z"
        fill="white"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}