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
   * 로그인 후 다시 현재 초대 페이지로 돌아오기 위해 주소를 저장해.
   * 동시에 "돌아오면 자동 입장" 플래그도 함께 기록해.
   */
  const handleLogin = useCallback(() => {
    if (!backendUrl) {
      setError("로그인 서버 주소를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (!inviteCode) {
      setError("초대코드가 비어 있어요. 초대 링크를 다시 확인해 주세요.");
      return;
    }

    setError("");
    sessionStorage.setItem("postLoginRedirect", `/invite/${inviteCode}`);
    sessionStorage.setItem(INVITE_AUTO_JOIN_KEY, inviteCode);
    window.location.href = `${backendUrl}/oauth2/authorization/naver`;
  }, [backendUrl, inviteCode]);

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

            {/* 중복 없이 초대코드를 한 번만 보여줘. */}
            <div className="mx-auto mt-7 max-w-md rounded-3xl border border-slate-200/80 bg-white/85 px-5 py-4 text-left shadow-sm">
              <p className="text-xs font-black tracking-[0.18em] text-slate-400">
                초대코드
              </p>
              <p className="mt-2 break-all font-mono text-lg font-black tracking-[0.2em] text-slate-800 sm:text-xl">
                {inviteCode || "코드 없음"}
              </p>
            </div>

            {/* 로그인 여부 안내 */}
            <div
              className="mx-auto mt-4 max-w-md rounded-2xl border border-cyan-100 bg-cyan-50/75 px-4 py-3 text-sm font-semibold leading-6 text-cyan-800"
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

            {/* 로그인 여부에 따라 버튼 역할을 바꿔. */}
            <button
              type="button"
              onClick={canJoin ? handleJoin : handleLogin}
              disabled={checkingAuth || joining || !inviteCode}
              className="mt-7 w-113 rounded-2xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-violet-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-cyan-200/70 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
            >
              {checkingAuth
                ? "로그인 상태 확인 중..."
                : joining
                  ? "초대장을 열어보고 있어요..."
                  : canJoin
                    ? "초대받은 저금통 들어가기"
                    : "네이버 로그인"}
            </button>

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