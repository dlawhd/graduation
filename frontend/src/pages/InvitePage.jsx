import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";
import MemoryJarLogoIcon from "../components/icons/MemoryJarLogoIcon";
import InviteLetterIcon from "../components/icons/InviteLetterIcon";

/*
 * 초대 참여 성공 화면을 보여준 뒤 저금통 상세로 이동하기까지의 시간
 * 1200ms는 1.2초야.
 */
const JOIN_SUCCESS_DELAY_MS = 5000;

/*
 * 로그인하러 갔다가 돌아온 뒤 자동 입장을 이어가기 위해 사용할 sessionStorage 키
 */
const INVITE_AUTO_JOIN_KEY = "inviteAutoJoinCode";

/*
 * 초대 페이지에서 사용할 수 있는 소셜 로그인 Provider 목록이야.
 *
 * Provider 검증 코드를 if문으로 길게 늘리지 않고
 * 한 곳에서 관리할 수 있도록 배열로 모아둔다.
 *
 * 앞으로 새로운 소셜 로그인이 추가돼도
 * 이 배열에 Provider 이름만 추가하면 검증 로직을 재사용할 수 있어.
 */
const SUPPORTED_LOGIN_PROVIDERS = [
  "naver",
  "google",
  "kakao",
];

/*
 * 주소에서 받은 초대코드를 서버가 비교하기 좋은 형태로 정리해.
 */
function normalizeCode(value) {
  return (value || "").trim().toUpperCase();
}

/*
 * 서버 오류를 사용자가 이해하기 쉬운 문장으로 바꿔.
 */
function getInviteErrorMessage(error) {
  const status = error?.response?.status;
  const serverMessage =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "초대장을 확인하는 중 문제가 생겼어요.";

  if (status === 401 || status === 403) {
    return "초대를 받으려면 먼저 로그인이 필요해요.";
  }

  if (serverMessage.includes("찾을 수 없")) {
    return "이 초대장을 찾을 수 없어요. 초대 링크를 다시 확인해 주세요.";
  }

  if (serverMessage.includes("폐기")) {
    return "초대한 사람이 이 초대장을 닫았어요. 새로운 링크를 요청해 주세요.";
  }

  if (serverMessage.includes("만료")) {
    return "이 초대장의 사용 기간이 끝났어요. 새로운 링크를 요청해 주세요.";
  }

  if (serverMessage.includes("최대 사용 횟수")) {
    return "이 초대장은 사용할 수 있는 횟수를 모두 채웠어요.";
  }

  if (serverMessage.includes("이미 이 저금통의 멤버")) {
    return "이미 참여하고 있는 저금통이에요. 내 저금통 목록에서 확인해 주세요.";
  }

  if (serverMessage.includes("정원이 가득")) {
    return "이 저금통은 현재 참여 인원이 모두 찼어요.";
  }

  return serverMessage;
}

/*
 * GoogleLogo 역할
 *
 * 로그인 첫 화면에서 사용하는 Google 로고와
 * 동일한 모양을 초대장 로그인 버튼에서도 보여준다.
 *
 * 별도 이미지 파일 없이 SVG로 직접 그리기 때문에
 * 화면 크기가 달라져도 선명하게 보인다.
 */
function GoogleLogo() {
  return (
    <svg
      viewBox="0 0 48 48"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {/* Google 로고 파란색 부분 */}
      <path
        fill="#4285F4"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />

      {/* Google 로고 빨간색 부분 */}
      <path
        fill="#EA4335"
        d="M2.56 13.22 10.54 19.41C12.43 13.72 17.74 9.5 24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22Z"
      />

      {/* Google 로고 노란색 부분 */}
      <path
        fill="#FBBC05"
        d="M24 48c6.24 0 11.48-2.05 15.31-5.57l-7.36-5.7c-2.04 1.37-4.64 2.18-7.95 2.18-6.04 0-11.16-4.08-12.99-9.56l-8.03 6.19C6.89 43.28 14.85 48 24 48Z"
      />

      {/* Google 로고 초록색 부분 */}
      <path
        fill="#34A853"
        d="M11.01 29.35A14.46 14.46 0 0 1 10.25 24c0-1.86.32-3.67.89-5.35l-8.03-6.19A23.96 23.96 0 0 0 0 24c0 3.87.93 7.53 2.98 10.54l8.03-6.19Z"
      />

      {/* Google G 오른쪽 파란색 부분 */}
      <path
        fill="#4285F4"
        d="M47.5 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h13.2c-.57 2.9-2.27 5.36-4.84 7.01l7.36 5.7C44.02 37.77 47.5 31.93 47.5 24.55Z"
      />
    </svg>
  );
}

/*
 * KakaoLogo 역할
 *
 * 초대 페이지의 카카오 로그인 버튼에 보여줄
 * 말풍선 모양 아이콘이야.
 *
 * 별도 이미지 파일이나 외부 URL을 사용하지 않고
 * SVG로 직접 표시해서 화면 크기가 달라도 선명하게 보여.
 *
 * 버튼 안에 이미 "카카오 로그인"이라는 글자가 있으므로
 * 스크린리더가 아이콘을 따로 읽지 않도록 aria-hidden을 사용해.
 */
function KakaoLogo() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="h-6 w-6"
      aria-hidden="true"
    >
      {/* 카카오를 쉽게 알아볼 수 있도록 검은색 말풍선 모양을 보여줘. */}
      <path
        fill="currentColor"
        d="M16 5C9.37 5 4 9.14 4 14.25c0 3.3 2.25 6.2 5.64 7.84l-1.43 5.22c-.12.43.37.77.74.52l5.97-3.94c.35.03.71.04 1.08.04 6.63 0 12-4.14 12-9.68S22.63 5 16 5Z"
      />
    </svg>
  );
}

/*
 * InviteLetterVisual 역할
 *
 * 초대 페이지에서 메인 비주얼을 담당해.
 * 준비 상태에서는 닫힌 초대 봉투를,
 * 성공 상태에서는 펼쳐진 초대 편지를 보여줘.
 *
 * 이번 버전에서는 반짝이 장식, 동그란 체크/느낌표 배지를 모두 제거해서
 * 초대장 자체의 분위기에 더 집중하도록 구성했어.
 */
function InviteLetterVisual({ state }) {
  const isSuccess = state === "success";
  const isError = state === "error";
  const isJoining = state === "joining";

  /*
   * 상태에 따라 편지 크기를 조금 다르게 준다.
   *
   * - 초대 도착(닫힌 봉투): 크게
   * - 초대 수락 완료(열린 편지): 더 크게
   */
  const letterSizeClass = isSuccess
    ? "h-52 w-52 sm:h-64 sm:w-64"    // 열림
    : "h-52 w-52 sm:h-64 sm:w-64";   // 닫힘

  return (
    <div className="relative mx-auto mt-3 flex h-64 w-64 items-center justify-center sm:h-80 sm:w-80">
      {/* 배경 빛 */}
      <div
        className={[
          "absolute inset-6 rounded-full blur-3xl motion-safe:animate-pulse",
          isError
            ? "bg-rose-200/60"
            : isSuccess
              ? "bg-emerald-200/70"
              : "bg-cyan-200/60",
        ].join(" ")}
      />

      {/* 초대 편지 SVG만 중심에 보여준다. */}
      <div
        className={[
          "relative z-10 rounded-[36px] border border-white/90 bg-white/55 p-2 shadow-[0_28px_80px_rgba(15,23,42,0.10)] backdrop-blur-sm",
          isJoining ? "motion-safe:animate-pulse" : "",
        ].join(" ")}
      >
        <InviteLetterIcon
          opened={isSuccess}
          className={letterSizeClass}
        />
      </div>
    </div>
  );
}

/*
 * InvitePage 역할
 *
 * 초대 링크로 들어온 사용자에게 초대 편지를 보여주고,
 * 로그인 여부에 따라 로그인 또는 저금통 참여를 진행해.
 *
 * 특히 로그인하러 이동한 사용자가 다시 이 페이지로 돌아오면
 * 버튼을 한 번 더 누르지 않아도 자동으로 초대 참여를 이어서 처리해.
 */
export default function InvitePage({ me, checkingAuth }) {
  const navigate = useNavigate();
  const { code: rawCode } = useParams();

  const backendUrl = import.meta.env.VITE_API_BASE_URL;
  const inviteCode = useMemo(() => normalizeCode(rawCode), [rawCode]);

  // 초대 참여 요청 중인지
  const [joining, setJoining] = useState(false);

  // 초대 참여 성공 응답
  const [joined, setJoined] = useState(null);

  // 사용자에게 보여줄 오류 문구
  const [error, setError] = useState("");

  // 로그인 쿠키가 만료된 경우 로그인 버튼으로 다시 전환하기 위한 상태
  const [loginRequired, setLoginRequired] = useState(false);

  // --------------------------------------------------------
  // 현재 어떤 소셜 로그인 화면으로 이동 중인지 저장해.
  //
  // null     : 이동 중 아님
  // "naver"  : 네이버 로그인으로 이동 중
  // "google" : Google 로그인으로 이동 중
  // "kakao"  : 카카오 로그인으로 이동 중
  //
  // 사용자가 로그인 버튼을 여러 번 누르는 것을 막고,
  // 어떤 로그인 화면으로 이동 중인지 정확하게 보여주기 위해 사용해.
  // --------------------------------------------------------
  const [redirectingProvider, setRedirectingProvider] = useState(null);

  // 자동 입장 처리를 한 번만 실행하기 위한 표시
  const autoJoinStartedRef = useRef(false);

  /*
   * App에서 사용자 정보가 다시 확인되면 로그인 만료 표시를 해제해.
   */
  useEffect(() => {
    if (me) {
      setLoginRequired(false);
    }
  }, [me]);

  /*
   * 참여 성공 후 저금통 상세 화면으로 자동 이동해.
   */
  useEffect(() => {
    if (!joined?.jarId) {
      return undefined;
    }

    const moveTimer = window.setTimeout(() => {
      navigate(`/jars/${joined.jarId}`, { replace: true });
    }, JOIN_SUCCESS_DELAY_MS);

    return () => {
      window.clearTimeout(moveTimer);
    };
  }, [joined, navigate]);

  /*
   * 초대 링크에서 소셜 로그인을 시작해.
   *
   * provider:
   * - "naver"  → 네이버 로그인
   * - "google" → Google 로그인
   * - "kakao"  → 카카오 로그인
   *
   * NAVER / GOOGLE / KAKAO 모두
   * 같은 OAuth 로그인 흐름을 사용한다.
   *
   * 어떤 로그인 방법을 선택하더라도 로그인 성공 후에는
   * 다시 현재 초대 페이지로 돌아오고,
   * 기존 자동 참여 로직이 이어서 실행돼.
   */
  const handleLogin = useCallback(
    (provider) => {
      if (!backendUrl) {
        setError(
          "로그인 서버 주소를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      if (!inviteCode) {
        setError("초대코드가 비어 있어요. 초대 링크를 다시 확인해 주세요.");
        return;
      }

      /*
       * Memory Jar가 지원하는 로그인 Provider인지 확인해.
       *
       * Provider 이름을 배열 한 곳에서 관리하므로
       * NAVER / GOOGLE / KAKAO마다 조건문을 계속 늘릴 필요가 없어.
       */
      if (!SUPPORTED_LOGIN_PROVIDERS.includes(provider)) {
        setError("지원하지 않는 로그인 방법이에요.");
        return;
      }

      setError("");

      // 어떤 로그인 화면으로 이동 중인지 저장해.
      setRedirectingProvider(provider);

      /*
       * OAuth 로그인이 끝난 뒤 다시 현재 초대 페이지로
       * 돌아오기 위해 목적지를 저장해.
       */
      sessionStorage.setItem(
        "postLoginRedirect",
        `/invite/${inviteCode}`,
      );

      /*
       * 로그인 후 초대 페이지에 돌아왔을 때
       * 사용자가 버튼을 다시 누르지 않아도
       * 자동으로 초대 참여를 실행하기 위한 표시야.
       */
      sessionStorage.setItem(
        INVITE_AUTO_JOIN_KEY,
        inviteCode,
      );

      /*
       * Spring Security의 각 OAuth 로그인 시작 주소로 이동해.
       *
       * naver  → /oauth2/authorization/naver
       * google → /oauth2/authorization/google
       * kakao  → /oauth2/authorization/kakao
       *
       * 실제 OAuth 흐름은 백엔드가 담당하므로
       * 프론트에서는 Provider 이름만 바꿔 같은 코드를 재사용한다.
       */
      window.location.href =
        `${backendUrl}/oauth2/authorization/${provider}`;
    },
    [backendUrl, inviteCode],
  );

  /*
   * 로그인한 사용자가 초대코드로 저금통에 참여해.
   */
  const handleJoin = useCallback(async () => {
    if (!inviteCode) {
      setError("초대코드가 비어 있어요. 초대 링크를 다시 확인해 주세요.");
      return;
    }

    setJoining(true);
    setError("");
    setJoined(null);

    try {
      // POST 요청에 필요한 CSRF 토큰을 먼저 준비해.
      await fetchCsrf();

      const response = await apiClient.post("/api/v1/jars/invites/join", {
        code: inviteCode,
      });

      const joinedData = response.data?.data;

      if (!joinedData?.jarId) {
        throw new Error("저금통 참여 결과를 확인하지 못했어요.");
      }

      // 자동 입장 플래그를 정리해 다음 방문에 다시 실행되지 않게 해.
      sessionStorage.removeItem(INVITE_AUTO_JOIN_KEY);
      setLoginRequired(false);
      setJoined(joinedData);
    } catch (requestError) {
      const status = requestError?.response?.status;

      if (status === 401 || status === 403) {
        // 다시 로그인한 뒤 현재 초대 페이지로 돌아오게 해.
        sessionStorage.setItem("postLoginRedirect", `/invite/${inviteCode}`);
        sessionStorage.setItem(INVITE_AUTO_JOIN_KEY, inviteCode);
        setLoginRequired(true);
      } else {
        // 인증 오류가 아닌 경우에는 자동 입장 플래그를 지워서
        // 페이지 새로고침 시 같은 자동 요청이 반복되지 않게 해.
        sessionStorage.removeItem(INVITE_AUTO_JOIN_KEY);
      }

      setError(getInviteErrorMessage(requestError));

      if (import.meta.env.DEV) {
        console.error("초대코드 참여 오류", requestError);
      }
    } finally {
      setJoining(false);
    }
  }, [inviteCode]);

  /*
   * 로그인하러 갔다가 다시 돌아온 사용자라면,
   * 버튼을 한 번 더 누르지 않아도 자동으로 초대 참여를 이어서 처리해.
   */
  useEffect(() => {
    const savedAutoJoinCode = sessionStorage.getItem(INVITE_AUTO_JOIN_KEY);

    const shouldAutoJoin =
      savedAutoJoinCode &&
      savedAutoJoinCode === inviteCode &&
      Boolean(me) &&
      !checkingAuth &&
      !joining &&
      !joined &&
      !loginRequired;

    if (!shouldAutoJoin || autoJoinStartedRef.current) {
      return;
    }

    autoJoinStartedRef.current = true;
    handleJoin();
  }, [checkingAuth, handleJoin, inviteCode, joined, joining, loginRequired, me]);

  /*
   * 다른 초대코드 페이지로 이동하면 자동 입장 실행 여부를 초기화해.
   */
  useEffect(() => {
    autoJoinStartedRef.current = false;
  }, [inviteCode]);

  const canJoin = Boolean(me) && !loginRequired;
  const userName = me?.name?.trim();

  // 로그인 후 돌아온 상태인지 확인해서
  // 안내 문구를 조금 더 자연스럽게 바꿔준다.
  const returnedFromLogin =
    sessionStorage.getItem(INVITE_AUTO_JOIN_KEY) === inviteCode && Boolean(me);

  const visualState = joined
    ? "success"
    : error
      ? "error"
      : joining
        ? "joining"
        : "ready";

  return (
    <div className="relative min-h-[calc(100vh-92px)] overflow-hidden bg-gradient-to-br from-emerald-50 via-cyan-50 to-violet-50 px-4 py-10 sm:px-6 sm:py-14">
      {/* 배경 색 번짐 */}
      <div className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full bg-emerald-200/45 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-violet-200/45 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-100/60 blur-3xl" />

      <section
        aria-labelledby="invite-page-title"
        className="relative z-10 mx-auto w-full max-w-2xl rounded-[40px] border border-white/85 bg-white/75 px-6 py-8 text-center shadow-[0_28px_90px_rgba(15,23,42,0.13)] backdrop-blur-xl sm:px-12 sm:py-10"
      >
        {/* 브랜드 표시 */}
        <div className="inline-flex items-center gap-3 rounded-full border border-white bg-white/90 px-4 py-2 shadow-sm">
          <MemoryJarLogoIcon className="h-8 w-8" />
          <span className="text-sm font-black uppercase tracking-[0.26em] text-emerald-600">
            Memory Jar
          </span>
        </div>

        <InviteLetterVisual state={visualState} />

        {joined ? (
          /* 참여 성공 화면 */
          <>
            {/* 초대 참여가 완료된 상태를 이전보다 조금 크게 보여준다. */}
            <p className="text-base font-black tracking-[0.14em] text-emerald-500 sm:text-lg">
              초대 수락 완료
            </p>

            {/*
             * 사용자가 어떤 저금통에 참여했는지
             * 가장 중요한 정보를 제목에서 바로 보여준다.
             */}
            <h1
              id="invite-page-title"
              className="mx-auto mt-3 max-w-xl break-words text-2xl font-black leading-snug text-slate-900 sm:text-3xl"
            >
              “{joined.name}” 에 참여했어요!
            </h1>

            {/* 참여 이후에 할 수 있는 일을 짧고 감성적으로 안내한다. */}
            <p className="mx-auto mt-4 max-w-lg text-base leading-8 text-slate-500">
              이제 함께 소중한 추억을 차곡차곡 모아보세요.
              <br className="hidden sm:block" />
              잠시 후 저금통으로 이동해요.
            </p>

            <button
              type="button"
              onClick={() => navigate(`/jars/${joined.jarId}`, { replace: true })}
              className="mt-7 w-full rounded-2xl bg-emerald-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-200/70 transition hover:-translate-y-0.5 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
            >
              바로 저금통으로 이동하기
            </button>
          </>
        ) : (
          /* 초대 대기 화면 */
          <>
            <p className="text-sm font-black tracking-[0.16em] text-cyan-500">
              함께 모으는 추억의 시작
            </p>

            <h1
              id="invite-page-title"
              className="mt-3 text-3xl font-black leading-tight text-slate-900 sm:text-4xl"
            >
              초대장이 도착했어요!
            </h1>

            <p className="mx-auto mt-4 max-w-lg text-base leading-8 text-slate-500">
              함께 추억을 쌓을 저금통이 기다리고 있어요.
              <br className="hidden sm:block" />
              초대를 수락하면 바로 멤버로 참여할 수 있어요.
            </p>



            {/* 로그인 여부 안내 */}
            <div
              className="mx-auto mt-4 max-w-md rounded-[22px] border border-cyan-100 bg-cyan-50/70 px-5 py-3 text-sm font-semibold leading-6 text-cyan-800 shadow-sm"
              role="status"
              aria-live="polite"
            >
              {checkingAuth
                ? "로그인 상태를 확인하고 있어요."
                : joining && returnedFromLogin
                  ? "로그인이 확인됐어요. 초대장을 바로 열어보고 있어요."
                  : canJoin
                    ? `${userName ? `${userName}님, ` : ""}초대를 받을 준비가 됐어요.`
                    : "초대를 받으려면 먼저 로그인이 필요해요."}
            </div>

            {/* 오류 안내 */}
            {error && (
              <div
                className="mx-auto mt-4 max-w-md rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-7 text-rose-700"
                role="alert"
              >
                {error}
              </div>
            )}

            {/* ==================================================
                로그인 / 초대 참여 버튼 영역

                로그인된 사용자:
                → 기존처럼 바로 저금통 참여 버튼을 보여줘.

                로그인되지 않은 사용자:
                → NAVER / GOOGLE / KAKAO 중 원하는 로그인 방법을 선택하게 해.
               ================================================== */}

            {canJoin ? (
              /*
               * 이미 로그인된 사용자
               *
               * 로그인 과정이 필요 없으므로
               * 기존 초대 참여 버튼을 그대로 사용해.
               */
              <button
                type="button"
                onClick={handleJoin}
                disabled={checkingAuth || joining || !inviteCode}
                className="mt-7 w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-cyan-200/70 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
              >
                {checkingAuth
                  ? "로그인 상태 확인 중..."
                  : joining
                    ? "초대장을 열어보고 있어요..."
                    : "초대받은 저금통 들어가기"}
              </button>
            ) : (
              /*
               * 로그인되지 않은 사용자
               *
               * 로그인 첫 화면과 디자인을 통일해서
               * NAVER / GOOGLE / KAKAO를
               * 동그란 아이콘 3개로 보여준다.
               *
               * 실제 OAuth 로그인 로직은 기존 handleLogin(provider)를
               * 그대로 사용하므로 기능 변경은 없다.
               */
              <div className="mx-auto mt-7 w-full max-w-md">

                {/* 소셜 로그인 안내 */}
                <p className="mb-4 text-[11px] font-bold text-slate-400">
                  소셜 계정으로 로그인하고 초대를 받아보세요.
                </p>


                {/* ==================================================
                    NAVER / GOOGLE / KAKAO

                    로그인 첫 화면과 동일하게
                    아이콘만 가로 한 줄로 보여준다.
                   ================================================== */}
                <div className="flex items-center justify-center gap-6">

                  {/* ==================================================
                      NAVER 로그인
                     ================================================== */}
                  <button
                    type="button"
                    onClick={() => handleLogin("naver")}
                    disabled={
                      checkingAuth ||
                      joining ||
                      Boolean(redirectingProvider) ||
                      !inviteCode
                    }
                    aria-label="네이버 로그인"
                    title="네이버 로그인"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-[#03C75A] text-white shadow-md shadow-emerald-200/70 transition hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                  >
                    {redirectingProvider === "naver" ? (
                      /*
                       * 네이버 인증 화면으로 이동 중일 때
                       * N 대신 로딩 표시를 보여준다.
                       */
                      <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white/35 border-t-white" />
                    ) : (
                      <span className="text-lg font-black">
                        N
                      </span>
                    )}
                  </button>


                  {/* ==================================================
                      GOOGLE 로그인
                     ================================================== */}
                  <button
                    type="button"
                    onClick={() => handleLogin("google")}
                    disabled={
                      checkingAuth ||
                      joining ||
                      Boolean(redirectingProvider) ||
                      !inviteCode
                    }
                    aria-label="Google 로그인"
                    title="Google 로그인"
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md shadow-slate-200/70 transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                  >
                    {redirectingProvider === "google" ? (
                      <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
                    ) : (
                      <GoogleLogo />
                    )}
                  </button>


                  {/* ==================================================
                      KAKAO 로그인
                     ================================================== */}
                  <button
                    type="button"
                    onClick={() => handleLogin("kakao")}
                    disabled={
                      checkingAuth ||
                      joining ||
                      Boolean(redirectingProvider) ||
                      !inviteCode
                    }
                    aria-label="카카오 로그인"
                    title="카카오 로그인"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEE500] text-[#191919] shadow-md shadow-yellow-200/70 transition hover:-translate-y-1 hover:bg-[#f5dc00] hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                  >
                    {redirectingProvider === "kakao" ? (
                      <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-black/15 border-t-black/70" />
                    ) : (
                      <KakaoLogo />
                    )}
                  </button>

                </div>


                {/* ==================================================
                    OAuth 이동 상태

                    어떤 로그인 화면으로 이동하고 있는지
                    아이콘 아래에 한 줄만 보여준다.
                   ================================================== */}
                {redirectingProvider && (
                  <p
                    className="mt-3 text-center text-[11px] font-semibold text-slate-400"
                    role="status"
                    aria-live="polite"
                  >
                    {redirectingProvider === "naver"
                      ? "네이버 인증 화면으로 이동하고 있어요."
                      : redirectingProvider === "google"
                        ? "Google 인증 화면으로 이동하고 있어요."
                        : "카카오 인증 화면으로 이동하고 있어요."}
                  </p>
                )}

              </div>
            )}

            {/* 오류가 났을 때 빠져나갈 수 있는 보조 버튼 */}
            {error && (
              <button
                type="button"
                onClick={() => navigate("/jars")}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200"
              >
                내 저금통 목록 보기
              </button>
            )}



          </>
        )}
      </section>
    </div>
  );
}