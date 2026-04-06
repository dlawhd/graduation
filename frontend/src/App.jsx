// src/App.jsx

// ------------------------------------------------------------
// 앱 전체 공통 레이아웃
// - 상단 헤더
// - 로그인 사용자 정보 표시
// - 로그아웃 처리
// - 내정보 패널 열기/닫기
// - 라우팅
// ------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import LoginSuccess from "./pages/LoginSuccess";
import JarsPage from "./pages/JarsPage";
import JarsNewPage from "./pages/JarsNewPage";
import JarDetailPage from "./pages/JarDetailPage";
import InvitePage from "./pages/InvitePage";
import apiClient, { fetchCsrf } from "./api/apiClient";

// 작은 enum 한글화
const ROLE_LABEL = {
  OWNER: "방장",
  ADMIN: "관리자",
  MEMBER: "멤버",
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // 현재 로그인한 사용자 정보
  const [me, setMe] = useState(null);

  // 로그인 확인 중인지
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 로그아웃 중인지
  const [loggingOut, setLoggingOut] = useState(false);

  // 내정보 패널 열림 상태
  const [profileOpen, setProfileOpen] = useState(false);

  // 내정보 패널 안에 보여줄 저금통 미리보기 목록
  const [myJarsPreview, setMyJarsPreview] = useState([]);

  // 홈 페이지인지 확인
  const isHomePage = location.pathname === "/";

  // 내정보 패널 DOM 참조
  const profileBoxRef = useRef(null);

  // --------------------------------------------------------
  // 현재 로그인 사용자 정보 확인
  // --------------------------------------------------------
  useEffect(() => {
    let ignore = false;

    async function loadMe() {
      try {
        const res = await apiClient.get("/api/v1/me");
        const meData = res.data?.data || null;

        if (!ignore) {
          setMe(meData);
        }
      } catch (e) {
        const status = e?.response?.status;

        if (!ignore) {
          if (status === 401 || status === 403) {
            setMe(null);
          } else {
            setMe(null);
          }
        }
      } finally {
        if (!ignore) {
          setCheckingAuth(false);
        }
      }
    }

    loadMe();

    return () => {
      ignore = true;
    };
  }, [location.pathname]);

  // --------------------------------------------------------
  // 로그인된 상태일 때 내 저금통 미리보기 3개 불러오기
  // --------------------------------------------------------
  useEffect(() => {
    let ignore = false;

    async function loadMyJarsPreview() {
      if (!me) {
        setMyJarsPreview([]);
        return;
      }

      try {
        const res = await apiClient.get("/api/v1/jars", {
          params: { page: 0, size: 3 },
        });

        const items = res.data?.data?.items || [];

        if (!ignore) {
          setMyJarsPreview(items);
        }
      } catch (e) {
        if (!ignore) {
          setMyJarsPreview([]);
        }
      }
    }

    loadMyJarsPreview();

    return () => {
      ignore = true;
    };
  }, [me]);

  // --------------------------------------------------------
  // 바깥 영역 클릭 시 내정보 패널 닫기
  // --------------------------------------------------------
  useEffect(() => {
    function handleClickOutside(event) {
      if (!profileBoxRef.current) return;

      if (!profileBoxRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --------------------------------------------------------
  // 로그아웃
  // --------------------------------------------------------
  const handleLogout = async () => {
    try {
      setLoggingOut(true);

      await fetchCsrf();
      await apiClient.post("/api/v1/auth/logout");

      setMe(null);
      setMyJarsPreview([]);
      setProfileOpen(false);

      navigate("/", { replace: true });
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        "로그아웃 중 문제가 생겼어요.";

      alert(serverMessage);
    } finally {
      setLoggingOut(false);
    }
  };

  // --------------------------------------------------------
  // 메뉴 공통 스타일
  // --------------------------------------------------------
  const navButtonClass =
    "rounded-full px-4 py-2 text-sm font-semibold transition";

  const inactiveNavClass =
    "bg-white/85 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50";

  const activeNavClass =
    "bg-emerald-500 text-white shadow-sm";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* 공통 상단 헤더 */}
      <header
        className={[
          "sticky top-0 z-50 border-b backdrop-blur-xl transition",
          isHomePage
            ? "border-white/40 bg-white/55"
            : "border-slate-200/80 bg-white/85",
        ].join(" ")}
      >
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          {/* 왼쪽 로고 */}
          <Link
            to="/"
            className="group inline-flex items-center gap-3 rounded-full px-2 py-1 transition"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 via-teal-300 to-cyan-300 text-lg shadow-sm transition group-hover:scale-105">
              🫙
            </div>

            <div className="leading-tight">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-600">
                Memory Jar
              </p>
              <p className="text-lg font-black text-slate-900 transition group-hover:text-emerald-700">
                EESJH
              </p>
            </div>
          </Link>

          {/* 오른쪽 메뉴 전체 묶음 */}
          <div className="flex items-center gap-2">
            {/* Home / Jars 메뉴 */}
            <nav className="flex items-center gap-2">
              <Link
                to="/"
                className={[
                  navButtonClass,
                  location.pathname === "/" ? activeNavClass : inactiveNavClass,
                ].join(" ")}
              >
                Home
              </Link>

              <Link
                to="/jars"
                className={[
                  navButtonClass,
                  location.pathname.startsWith("/jars")
                    ? activeNavClass
                    : inactiveNavClass,
                ].join(" ")}
              >
                Jars
              </Link>
            </nav>

            {/* 로그인 상태 확인 중 */}
            {checkingAuth && (
              <div className="hidden rounded-full bg-white/85 px-4 py-2 text-sm font-semibold text-slate-500 ring-1 ring-slate-200 md:block">
                확인 중...
              </div>
            )}

            {/* 로그인된 경우만 내정보/로그아웃 노출 */}
            {!checkingAuth && me && (
              <div className="relative flex items-center gap-2" ref={profileBoxRef}>
                {/* 내정보 버튼 */}
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  className={[
                    navButtonClass,
                    profileOpen ? activeNavClass : inactiveNavClass,
                    "inline-flex items-center gap-2",
                  ].join(" ")}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-[11px] font-black">
                    {(me?.name || "U").slice(0, 1)}
                  </span>
                  <span>내정보</span>
                </button>

                {/* 로그아웃 버튼 */}
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className={[
                    navButtonClass,
                    "bg-slate-900 text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70",
                  ].join(" ")}
                >
                  {loggingOut ? "로그아웃 중..." : "로그아웃"}
                </button>

                {/* 내정보 패널 */}
                {profileOpen && (
                  <div className="absolute right-0 top-14 w-[320px] overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                    {/* 상단 사용자 영역 */}
                    <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-cyan-50 px-5 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-cyan-300 text-sm font-black text-slate-900">
                          {(me?.name || "U").slice(0, 1)}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-slate-900">
                            {me?.name || "이름 없음"}
                          </p>
                          <p className="truncate text-sm text-slate-500">
                            {me?.email || "이메일 정보 없음"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 내가 참여한 저금통 */}
                    <div className="px-5 py-5">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-black text-slate-800">
                          내가 참여한 저금통
                        </p>
                        <Link
                          to="/jars"
                          onClick={() => setProfileOpen(false)}
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                        >
                          전체 보기
                        </Link>
                      </div>

                      {myJarsPreview.length > 0 ? (
                        <div className="space-y-3">
                          {myJarsPreview.map((jar) => (
                            <Link
                              key={jar.jarId}
                              to={`/jars/${jar.jarId}`}
                              onClick={() => setProfileOpen(false)}
                              className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/60"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-slate-800">
                                    {jar.name}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    내 역할: {ROLE_LABEL[jar.myRole] || jar.myRole}
                                  </p>
                                </div>

                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                    jar.isOpen
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {jar.isOpen ? "OPEN" : "LOCKED"}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                          아직 참여한 저금통이 없어요.
                        </div>
                      )}

                      {/* 아래쪽 버튼 */}
                      <Link
                        to="/jars"
                        onClick={() => setProfileOpen(false)}
                        className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600"
                      >
                        내 저금통 보러가기
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 페이지 본문 */}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login/success" element={<LoginSuccess />} />
          <Route path="/jars" element={<JarsPage />} />
          <Route path="/jars/new" element={<JarsNewPage />} />
          <Route path="/jars/:jarId" element={<JarDetailPage />} />
          <Route path="/invite/:code" element={<InvitePage />} />
        </Routes>
      </main>
    </div>
  );
}