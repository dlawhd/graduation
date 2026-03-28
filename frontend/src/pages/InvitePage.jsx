import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";

const ROLE_LABEL = {
  OWNER: "방장",
  ADMIN: "관리자",
  MEMBER: "멤버",
};

// 초대코드를 보기 좋게 정리해주는 함수
function normalizeCode(value) {
  return (value || "").trim().toUpperCase();
}

// 날짜를 보기 쉽게 바꿔주는 함수
function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InvitePage() {
  const navigate = useNavigate();
  const { code: rawCode } = useParams();

  const BACKEND = import.meta.env.VITE_API_BASE_URL;
  const inviteCode = useMemo(() => normalizeCode(rawCode), [rawCode]);

  const [checkingSession, setCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionWarning, setSessionWarning] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(null);

  // 현재 로그인 상태 확인
  useEffect(() => {
    let ignore = false;

    async function checkSession() {
      try {
        const res = await apiClient.get("/api/v1/me");
        const me = res.data?.data;

        if (!ignore) {
          setIsLoggedIn(Boolean(me));
        }
      } catch (e) {
        const status = e?.response?.status;

        if (!ignore) {
          setIsLoggedIn(false);

          // 401/403은 로그인 안 된 상태로 보면 돼
          if (status && status !== 401 && status !== 403) {
            setSessionWarning(
              "로그인 상태를 확인하는 중 서버와 통신이 조금 불안정했어요. 그래도 초대 링크는 계속 사용할 수 있어요."
            );
          }
        }
      } finally {
        if (!ignore) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => {
      ignore = true;
    };
  }, []);

  // 로그인하러 갈 때, 현재 초대 링크를 저장해 두기
  function handleLogin() {
    if (!BACKEND) {
      setError("VITE_API_BASE_URL 값이 비어 있어요. 프론트 환경변수를 확인해 주세요.");
      return;
    }

    setError("");

    // 로그인 후 다시 이 초대 링크로 돌아오기 위해 저장
    sessionStorage.setItem("postLoginRedirect", `/invite/${inviteCode}`);

    window.location.href = `${BACKEND}/oauth2/authorization/naver`;
  }

  // 초대코드로 실제 입장 요청
  async function handleJoin() {
    if (!inviteCode) {
      setError("초대코드가 비어 있어요. 초대 링크를 다시 확인해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setJoined(null);

    try {
      await fetchCsrf();

      const res = await apiClient.post("/api/v1/jars/invites/join", {
        code: inviteCode,
      });

      const joinedData = res.data?.data;
      setJoined(joinedData);
      setIsLoggedIn(true);
    } catch (e) {
      const status = e?.response?.status;
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "초대 링크 입장 중 문제가 생겼어요.";

      if (status === 401 || status === 403) {
        setIsLoggedIn(false);
        setError("로그인이 먼저 필요해요. 로그인 후 다시 들어오면 돼요.");
      } else {
        setError(serverMessage);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          {/* 왼쪽 안내 영역 */}
          <section className="rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-bold tracking-[0.18em] text-sky-600">
              INVITE ENTRY
            </p>

            <h1 className="mt-4 text-3xl font-black leading-tight text-slate-900 sm:text-4xl">
              초대 링크로
              <br />
              저금통에 입장해요
            </h1>

            <p className="mt-5 text-base leading-8 text-slate-600">
              친구가 보내준 링크를 눌렀다면, 초대코드는 이미 자동으로 들어와 있어요.
              따로 주소를 치거나 코드를 다시 외울 필요 없이 바로 이어서 입장하면 돼요.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5">
                <p className="text-sm font-bold text-sky-700">1. 링크 클릭</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  초대받은 사람이 링크만 누르면 돼요.
                </p>
              </div>

              <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-5">
                <p className="text-sm font-bold text-indigo-700">2. 로그인</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  로그인 후에도 다시 이 초대 화면으로 돌아와요.
                </p>
              </div>

              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-sm font-bold text-emerald-700">3. 입장 완료</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  버튼 한 번이면 저금통 멤버로 참여돼요.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-[28px] border border-slate-100 bg-slate-50 p-6">
              <p className="text-sm font-bold text-slate-800">초대코드</p>
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-lg font-black tracking-[0.22em] text-slate-800">
                {inviteCode || "코드 없음"}
              </div>
            </div>

            {sessionWarning && (
              <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-7 text-orange-700">
                {sessionWarning}
              </div>
            )}
          </section>

          {/* 오른쪽 입장 카드 */}
          <section className="rounded-[32px] border border-sky-100 bg-white/90 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-bold tracking-[0.16em] text-sky-600">
              JOIN CARD
            </p>

            <h2 className="mt-3 text-2xl font-black text-slate-900">
              저금통 입장하기
            </h2>

            <p className="mt-2 text-sm leading-7 text-slate-500">
              이 초대 링크에 연결된 코드로 참여를 진행해요.
            </p>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-bold tracking-[0.16em] text-slate-400">
                  LINK CODE
                </p>
                <p className="mt-2 text-lg font-black tracking-[0.18em] text-slate-900">
                  {inviteCode || "코드 없음"}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm font-semibold text-slate-700">현재 상태</p>

                <p className="mt-2 text-sm text-slate-500">
                  {checkingSession
                    ? "로그인 상태를 확인하고 있어요."
                    : isLoggedIn
                    ? "로그인이 확인됐어요. 바로 입장할 수 있어요."
                    : "로그인이 필요해요. 로그인 후 다시 이 화면으로 돌아와요."}
                </p>
              </div>

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-700">
                  {error}
                </div>
              )}

              {!checkingSession && !isLoggedIn && (
                <button
                  type="button"
                  onClick={handleLogin}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  네이버로 로그인하고 이어서 입장하기
                </button>
              )}

              <button
                type="button"
                onClick={handleJoin}
                disabled={loading || checkingSession || !inviteCode}
                className="w-full rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-4 text-sm font-black text-white shadow-lg transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "입장 처리 중..." : "이 초대 링크로 입장하기"}
              </button>
            </div>

            {joined && (
              <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-sm font-bold text-emerald-700">입장 성공</p>

                <h3 className="mt-2 text-2xl font-black text-slate-900">
                  {joined.name}
                </h3>

                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <p>
                    내 역할:{" "}
                    <span className="font-bold text-slate-900">
                      {ROLE_LABEL[joined.myRole] || joined.myRole}
                    </span>
                  </p>
                  <p>
                    입장 시간:{" "}
                    <span className="font-bold text-slate-900">
                      {formatDateTime(joined.joinedAt)}
                    </span>
                  </p>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => navigate(`/jars/${joined.jarId}`)}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:opacity-90"
                  >
                    저금통 상세로 이동
                  </button>

                  <Link
                    to="/jars"
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    목록 보기
                  </Link>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}