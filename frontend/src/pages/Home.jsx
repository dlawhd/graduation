// src/pages/Home.jsx

// ------------------------------------------------------------
// 이 파일은 서비스 첫 화면(랜딩) + 로그인 시작 화면 역할을 해요.
// 이미 로그인된 사용자는 /jars 로 보내고,
// 로그인 전 사용자는 예쁜 소개 화면과 로그인 버튼을 보게 돼요.
// 공통 헤더는 App.jsx 에서 보여주기 때문에,
// 이 파일 안에는 헤더를 따로 만들지 않아요.
// ------------------------------------------------------------
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  SecureMemoryIcon,
  SharedMemoryIcon,
  SpecialOpenIcon,
} from "../components/icons/LandingFeatureIcons";
import LoginJarCard from "../components/landing/LoginJarCard";

/*
 * Home 역할
 *
 * App.jsx가 이미 확인한 로그인 정보를 받아서
 * 첫 화면을 보여주는 랜딩 페이지다.
 *
 * Home에서는 /api/v1/me를 다시 요청하지 않는다.
 *
 * me:
 * - 로그인된 사용자 정보
 * - 로그인하지 않았으면 null
 *
 * checkingAuth:
 * - App.jsx가 로그인 상태를 확인하고 있는지 여부
 */
export default function Home({
  me,
  checkingAuth,
}) {
  const navigate = useNavigate();

  // 백엔드 주소
  // 예: https://api.esjh.shop
  const BACKEND = import.meta.env.VITE_API_BASE_URL;

  // --------------------------------------------------------
  // 현재 어떤 OAuth 로그인 화면으로 이동 중인지 저장한다.
  //
  // null     : 이동 중 아님
  // "naver"  : 네이버 로그인 화면으로 이동 중
  // "google" : Google 로그인 화면으로 이동 중
  // "kakao"  : 카카오 로그인 화면으로 이동 중
  //
  // 단순히 true / false만 저장하지 않고
  // Provider 이름 자체를 저장한다.
  //
  // 이렇게 하면 사용자가 어떤 로그인 버튼을 눌렀는지에 따라
  // "네이버로 이동 중..."
  // "Google로 이동 중..."
  // "카카오로 이동 중..."
  // 문구를 정확하게 보여줄 수 있다.
  // --------------------------------------------------------
  const [redirectingProvider, setRedirectingProvider] = useState(null);

  // 사용자에게 보여줄 에러 문구
  const [errorMessage, setErrorMessage] = useState("");

  /*
   * App.jsx의 로그인 확인이 끝난 뒤
   * 이미 로그인된 사용자라면 저금통 목록으로 이동한다.
   *
   * 여기서는 서버에 /api/v1/me를 다시 요청하지 않는다.
   * App이 확인한 me 값을 그대로 사용한다.
   */
  useEffect(() => {
    /*
     * 아직 App이 로그인 상태를 확인 중이라면
     * 결과가 나올 때까지 기다린다.
     */
    if (checkingAuth) {
      return;
    }

    /*
     * 로그인한 사용자 정보가 있으면
     * 랜딩 페이지에 머물 필요가 없으므로
     * 저금통 목록으로 이동한다.
     */
    if (me) {
      navigate("/jars", {
        replace: true,
      });
    }
  }, [
    checkingAuth,
    me,
    navigate,
  ]);

  // --------------------------------------------------------
  // 소셜 로그인 시작
  //
  // provider 값에 따라 Spring Security의 OAuth 시작 주소로 이동한다.
  //
  // naver  → /oauth2/authorization/naver
  // google → /oauth2/authorization/google
  // kakao  → /oauth2/authorization/kakao
  //
  // NAVER / GOOGLE / KAKAO 모두
  // Spring Security OAuth2의 같은 시작 구조를 사용한다.
  //
  // 그래서 Provider마다 로그인 함수를 따로 만들지 않고,
  // 하나의 공통 함수에 provider 이름만 전달한다.
  // --------------------------------------------------------
  const handleOAuthLogin = (provider) => {
    if (!BACKEND) {
      setErrorMessage(
        "로그인 연결 주소가 아직 설정되지 않았어요. 환경변수를 확인해 주세요.",
      );
      return;
    }

    // 이전 오류 문구가 남아 있다면 지운다.
    setErrorMessage("");

    // 어떤 로그인 화면으로 이동 중인지 저장한다.
    setRedirectingProvider(provider);

    // Spring Security OAuth 로그인 시작 주소로 이동한다.
    window.location.href = `${BACKEND}/oauth2/authorization/${provider}`;
  };

  return (
    // 헤더 높이(h-20 = 80px)를 빼고 화면을 채우도록 계산
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden bg-[#eef8f5]">
      {/* -------------------------------------------------- */}
      {/* 배경 장식 1: 왼쪽 위 큰 민트 블러 */}
      {/* -------------------------------------------------- */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/50 blur-3xl" />

      {/* -------------------------------------------------- */}
      {/* 배경 장식 2: 오른쪽 위 하늘색 블러 */}
      {/* -------------------------------------------------- */}
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-cyan-200/40 blur-3xl" />

      {/* -------------------------------------------------- */}
      {/* 배경 장식 3: 아래쪽 노란빛 블러 */}
      {/* -------------------------------------------------- */}
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-amber-100/60 blur-3xl" />

      {/* 전체 내용 영역 */}
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-7xl items-center px-6 py-8">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          {/* ==================================================
              왼쪽 소개 영역
             ================================================== */}
          <section className="relative">
            {/* 작은 배지 */}
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-bold text-emerald-700 shadow-sm backdrop-blur">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              함께 모으는 추억 저금통
            </div>

            {/* 큰 제목 */}
            <h1 className="max-w-3xl text-4xl font-black leading-tight text-slate-900 sm:text-5xl lg:text-6xl">
              우리만의 저금통에
              <br />
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
                추억을 차곡차곡
              </span>
              <br />
              담아봐요
            </h1>

            {/* 설명 */}
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              혼자 쓰는 메모장이 아니라 함께 기억을 모으는 공간이에요.
              소중한 말, 사진, 마음을 저금통에 담아두고
              약속한 날이 되면 다시 열어볼 수 있어요.
            </p>

            {/* 기능 카드 3개 */}
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {/* 첫 번째 기능 카드: 쪽지와 사진 보관 */}
              <div className="relative h-full overflow-hidden rounded-3xl border border-white/70 bg-white/75 p-5 shadow-lg shadow-emerald-100/50 backdrop-blur transition duration-300 ease-out hover:-translate-y-1 hover:border-emerald-200/80 hover:shadow-xl hover:shadow-emerald-200/60 motion-reduce:transform-none">
                {/* 카드 위쪽의 얇은 민트색 포인트 선 */}
                <div
                  className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-300 via-emerald-500 to-teal-400"
                  aria-hidden="true"
                />
                <div className="mb-3 flex h-12 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <SecureMemoryIcon />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  추억을 담는 시간
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  약속한 오픈일까지 쪽지와 사진을 저금통에 보관해요.
                </p>
              </div>

              {/* 두 번째 기능 카드: 여러 사람이 함께 참여 */}
              <div className="relative h-full overflow-hidden rounded-3xl border border-white/70 bg-white/75 p-5 shadow-lg shadow-cyan-100/50 backdrop-blur transition duration-300 ease-out hover:-translate-y-1 hover:border-cyan-200/80 hover:shadow-xl hover:shadow-cyan-200/60 motion-reduce:transform-none">
                {/* 카드 위쪽의 얇은 하늘색 포인트 선 */}
                <div
                  className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-300 via-cyan-500 to-sky-400"
                  aria-hidden="true"
                />
                <div className="mb-3 flex h-12 w-14 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-600">
                  <SharedMemoryIcon />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  함께 채우는 마음
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  커플, 친구, 가족이 같은 저금통에 추억을 함께 모을 수 있어요.
                </p>
              </div>

              {/* 세 번째 기능 카드: 약속한 날짜에 저금통 오픈 */}
              <div className="relative h-full overflow-hidden rounded-3xl border border-white/70 bg-white/75 p-5 shadow-lg shadow-amber-100/50 backdrop-blur transition duration-300 ease-out hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-xl hover:shadow-amber-200/60 motion-reduce:transform-none">
                {/* 카드 위쪽의 얇은 노란색 포인트 선 */}
                <div
                  className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400"
                  aria-hidden="true"
                />
                <div className="mb-3 flex h-12 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <SpecialOpenIcon />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">
                  다시 만나는 순간
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  약속한 날 저금통이 열리면 모아둔 추억을 볼 수 있어요.
                </p>
              </div>
            </div>

            {/* 아래 작은 강조 문구 */}

          </section>

          {/* ==================================================
              오른쪽 저금통 모양 로그인 영역
             ================================================== */}
          <section className="relative flex items-center justify-center py-4">
            {/* 저금통 뒤쪽의 은은한 장식 */}
            <div className="pointer-events-none absolute -right-6 top-10 h-36 w-36 rounded-full bg-emerald-200/45 blur-2xl" />

            <div className="pointer-events-none absolute -bottom-4 left-0 h-32 w-32 rounded-full bg-cyan-200/45 blur-2xl" />

            {/* 실제 로그인 동작을 포함한 저금통 컴포넌트 */}
            <LoginJarCard
              checkingSession={checkingAuth}
              redirectingProvider={redirectingProvider}
              errorMessage={errorMessage}

              // 네이버 로그인 버튼을 누르면 네이버 OAuth를 시작한다.
              onNaverLogin={() => handleOAuthLogin("naver")}

              // Google 로그인 버튼을 누르면 Google OAuth를 시작한다.
              onGoogleLogin={() => handleOAuthLogin("google")}

              // 카카오 로그인 버튼을 누르면 Kakao OAuth를 시작한다.
              onKakaoLogin={() => handleOAuthLogin("kakao")}
            />
          </section>
        </div>
      </div>
    </div>
  );
}