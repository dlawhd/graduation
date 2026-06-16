// src/App.jsx

// ------------------------------------------------------------
// 앱 전체 공통 레이아웃
// - 상단 헤더
// - 로그인 사용자 정보 표시
// - 로그아웃 처리
// - 내정보 패널 열기/닫기
// - 라우팅
// ------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import LoginSuccess from "./pages/LoginSuccess";
import JarsPage from "./pages/JarsPage";
import JarsNewPage from "./pages/JarsNewPage";
import JarDetailPage from "./pages/JarDetailPage";
import InvitePage from "./pages/InvitePage";
import apiClient, { fetchCsrf } from "./api/apiClient";
import {
  getNotifications,
  getUnreadCount,
  readAllNotifications,
  readNotification,
} from "./api/notificationApi";
import {
  createNotificationSocketClient,
  disconnectNotificationSocket,
} from "./api/notificationSocketApi";

// 작은 enum 한글화
const ROLE_LABEL = {
  OWNER: "방장",
  ADMIN: "관리자",
  MEMBER: "멤버",
};

// 알림 개수 숫자를 뱃지에 예쁘게 보여주기 위한 함수
function formatNotificationBadge(count) {
  if (!count || count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

/*
 * 로그인 사용자 정보에서 userId만 안전하게 꺼내는 함수
 *
 * 현재 /api/v1/me 응답은 userId라는 이름으로 사용자 번호를 내려준다.
 * 혹시 나중에 id로 바뀌어도 깨지지 않도록 같이 대비한다.
 */
function getCurrentUserId(me) {
  return me?.userId ?? me?.id ?? null;
}

// 알림 종류에 맞는 작은 아이콘(이모지) 고르기
function getNotificationEmoji(type) {
  switch (type) {
    case "NOTE_COMMENTED":
      return "💬";
    case "COMMENT_REPLIED":
      return "↪️";
    case "NOTE_REACTED":
      return "❤️";
    case "JAR_MEMBER_JOINED":
      return "🎉";
    default:
      return "🔔";
  }
}

// 혹시 서버 message가 없을 때를 대비한 예비 문구 만들기
function buildNotificationFallbackMessage(item) {
  const actorName = item?.actorName || "누군가";

  switch (item?.type) {
    case "NOTE_COMMENTED":
      return `${actorName}님이 내 쪽지에 댓글을 남겼어요.`;
    case "COMMENT_REPLIED":
      return `${actorName}님이 내 댓글에 답글을 남겼어요.`;
    case "NOTE_REACTED":
      return `${actorName}님이 내 쪽지에 ${item?.emoji || "❤️"} 반응을 남겼어요.`;
    case "JAR_MEMBER_JOINED":
      return `${actorName}님이 저금통에 새로 들어왔어요.`;
    default:
      return "새 알림이 도착했어요.";
  }
}

// createdAt을 사람이 보기 쉬운 시간으로 바꿔주는 함수
function formatNotificationTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "방금 전";
  }

  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}분 전`;
  }

  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}시간 전`;
  }

  return date.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}


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

    // 알림 패널 열림 상태
    const [notificationOpen, setNotificationOpen] = useState(false);

    // 안 읽은 알림 개수
    const [unreadCount, setUnreadCount] = useState(0);

    // 헤더 드롭다운에 보여줄 알림 목록
    const [notifications, setNotifications] = useState([]);

    // 알림 목록 불러오는 중인지
    const [notificationsLoading, setNotificationsLoading] = useState(false);

    // 알림 목록 에러 문구
    const [notificationsError, setNotificationsError] = useState("");

    // 알림 패널 DOM 참조
    const notificationBoxRef = useRef(null);

  // --------------------------------------------------------
  // 현재 로그인 사용자 정보 확인
  // --------------------------------------------------------
  useEffect(() => {
    let ignore = false;

    async function loadMe() {
      try {
        const shouldSkipAuthRefresh = location.pathname === "/";

        const res = await apiClient.get("/api/v1/me", {
          _skipAuthRefresh: shouldSkipAuthRefresh,
        });
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
      // 안 읽은 알림 개수 불러오기
      // --------------------------------------------------------
      const loadUnreadCount = useCallback(async () => {
        if (!me) {
          setUnreadCount(0);
          return;
        }

        try {
          const data = await getUnreadCount();
          setUnreadCount(Number(data?.unreadCount || 0));
        } catch (e) {
          setUnreadCount(0);
        }
      }, [me]);

      // --------------------------------------------------------
      // 알림 목록 불러오기
      // --------------------------------------------------------
      const loadNotifications = useCallback(
        async (page = 0, size = 10) => {
          if (!me) {
            setNotifications([]);
            return;
          }

          try {
            setNotificationsLoading(true);
            setNotificationsError("");

            const data = await getNotifications(page, size);
            const items = data?.items || [];

            setNotifications(items);
          } catch (e) {
            const serverMessage =
              e?.response?.data?.error?.message ||
              e?.response?.data?.message ||
              "알림을 불러오지 못했어요.";

            setNotificationsError(serverMessage);
            setNotifications([]);
          } finally {
            setNotificationsLoading(false);
          }
        },
        [me]
      );

      // --------------------------------------------------------
      // 로그인된 상태면 unread count 먼저 불러오기
      // --------------------------------------------------------
      useEffect(() => {
        if (!me) {
          setUnreadCount(0);
          setNotifications([]);
          setNotificationOpen(false);
          return;
        }

        loadUnreadCount();
      }, [me, loadUnreadCount]);

      // --------------------------------------------------------
      // 알림 WebSocket 연결
      // - 로그인한 사용자에게 새 알림이 오면 헤더 뱃지와 목록을 즉시 갱신
      // --------------------------------------------------------
      useEffect(() => {
        const currentUserId = getCurrentUserId(me);

        // 로그인하지 않았거나 userId가 없으면 WebSocket 연결을 만들지 않는다.
        if (!currentUserId) {
          return;
        }

        /*
         * 알림 WebSocket 클라이언트를 만든다.
         * 서버가 /topic/users/{userId}/notifications 로 보내는 알림을 받는다.
         */
        const client = createNotificationSocketClient({
          userId: currentUserId,

          /*
           * 새 알림을 받았을 때 실행된다.
           *
           * 하는 일:
           * 1. unreadCount를 1 올린다.
           * 2. 알림 목록 맨 앞에 새 알림을 추가한다.
           * 3. 같은 알림이 이미 있으면 중복 추가하지 않는다.
           */
          onNotificationReceived: (newNotification) => {
            if (!newNotification?.notificationId) {
              loadUnreadCount();
              return;
            }

            // 새 알림은 기본적으로 안 읽은 알림이므로 뱃지 숫자를 1 올린다.
            setUnreadCount((prev) => Number(prev || 0) + 1);

            // 드롭다운 목록 맨 앞에 새 알림을 꽂는다.
            setNotifications((prev) => {
              const alreadyExists = prev.some(
                (item) => item.notificationId === newNotification.notificationId
              );

              if (alreadyExists) {
                return prev;
              }

              // 헤더 드롭다운은 너무 길 필요 없으니 최근 10개만 유지한다.
              return [newNotification, ...prev].slice(0, 10);
            });
          },

          onConnect: () => {
            console.log("헤더 알림 WebSocket 연결 완료");
          },

          /*
           * WebSocket 오류가 나도 화면이 완전히 망가지면 안 된다.
           * 그래서 오류가 나면 REST API로 unread count를 한 번 다시 맞춘다.
           */
          onError: () => {
            loadUnreadCount();
          },
        });

        // 실제 연결 시작
        client.activate();

        /*
         * App이 정리되거나 로그아웃되어 me가 바뀌면 연결을 끊는다.
         * 연결을 안 끊으면 같은 알림을 여러 번 받을 수 있다.
         */
        return () => {
          disconnectNotificationSocket(client);
        };
      }, [me, loadUnreadCount]);

      // --------------------------------------------------------
      // 창으로 다시 돌아왔을 때 unread count 새로고침
      // 반실시간 느낌으로 가볍게 동작시키는 용도
      // --------------------------------------------------------
      useEffect(() => {
        if (!me) return;

        function handleWindowFocus() {
          loadUnreadCount();
        }

        function handleVisibilityChange() {
          if (document.visibilityState === "visible") {
            loadUnreadCount();
          }
        }

        window.addEventListener("focus", handleWindowFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
          window.removeEventListener("focus", handleWindowFocus);
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
      }, [me, loadUnreadCount]);

      // --------------------------------------------------------
      // 바깥 영역 클릭 시 알림 패널 닫기
      // --------------------------------------------------------
      useEffect(() => {
        function handleClickOutside(event) {
          if (!notificationBoxRef.current) return;

          if (!notificationBoxRef.current.contains(event.target)) {
            setNotificationOpen(false);
          }
        }

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
          document.removeEventListener("mousedown", handleClickOutside);
        };
      }, []);

      // --------------------------------------------------------
      // 알림 버튼 클릭
      // - 열릴 때 목록 새로 불러오기
      // - unread count도 같이 다시 확인
      // --------------------------------------------------------
      const handleToggleNotification = async () => {
        const nextOpen = !notificationOpen;

        setNotificationOpen(nextOpen);
        setProfileOpen(false);

        if (nextOpen) {
          await Promise.all([loadNotifications(0, 10), loadUnreadCount()]);
        }
      };

      // --------------------------------------------------------
      // 알림 1개 클릭
      // - 아직 안 읽었으면 먼저 읽음 처리
      // - 그 다음 저금통 상세 페이지로 이동
      // --------------------------------------------------------
      const handleNotificationClick = async (item) => {
        if (!item) return;

        if (!item.isRead) {
          try {
            const result = await readNotification(item.notificationId);

            setNotifications((prev) =>
              prev.map((notification) =>
                notification.notificationId === item.notificationId
                  ? {
                      ...notification,
                      isRead: true,
                      readAt: result?.readAt || new Date().toISOString(),
                    }
                  : notification
              )
            );

            setUnreadCount((prev) => Math.max(0, prev - 1));
          } catch (e) {
            const serverMessage =
              e?.response?.data?.error?.message ||
              e?.response?.data?.message ||
              "알림 읽음 처리 중 문제가 생겼어요.";

            alert(serverMessage);
          }
        }

        setNotificationOpen(false);

        if (item.jarId) {
          navigate(`/jars/${item.jarId}`, {
            state: {
              fromNotification: true,
              focusNoteId: item.noteId ?? null,
              focusCommentId: item.commentId ?? null,
            },
          });
          return;
        }

        navigate("/jars");
      };

      // --------------------------------------------------------
      // 모두 읽음 처리
      // --------------------------------------------------------
      const handleReadAllNotifications = async () => {
        try {
          const result = await readAllNotifications();

          setNotifications((prev) =>
            prev.map((notification) => ({
              ...notification,
              isRead: true,
              readAt: result?.readAt || new Date().toISOString(),
            }))
          );

          setUnreadCount(0);
        } catch (e) {
          const serverMessage =
            e?.response?.data?.error?.message ||
            e?.response?.data?.message ||
            "알림 전체 읽음 처리 중 문제가 생겼어요.";

          alert(serverMessage);
        }
      };


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
        setNotificationOpen(false);
        setUnreadCount(0);
        setNotifications([]);
        setNotificationsError("");

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

                        {/* 로그인된 경우만 알림/내정보/로그아웃 노출 */}
                        {!checkingAuth && me && (
                          <div className="flex items-center gap-2">
                            {/* 알림 영역 */}
                            <div className="relative" ref={notificationBoxRef}>
                              <button
                                type="button"
                                onClick={handleToggleNotification}
                                className={[
                                  navButtonClass,
                                  notificationOpen ? activeNavClass : inactiveNavClass,
                                  "relative inline-flex items-center justify-center",
                                ].join(" ")}
                                aria-label="알림 열기"
                              >
                                {/* 종 아이콘 */}
                                <svg
                                  viewBox="0 0 24 24"
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                                  <path d="M9 17a3 3 0 0 0 6 0" />
                                </svg>

                                {/* unread badge */}
                                {unreadCount > 0 && (
                                  <span className="absolute -right-1 -top-1 inline-flex min-w-[22px] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow-sm">
                                    {formatNotificationBadge(unreadCount)}
                                  </span>
                                )}
                              </button>

                              {/* 알림 드롭다운 */}
                              {notificationOpen && (
                                <div className="absolute right-0 top-14 w-[360px] overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                                  {/* 상단 제목 영역 */}
                                  <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-cyan-50 px-5 py-4">
                                    <div>
                                      <p className="text-base font-black text-slate-900">
                                        알림
                                      </p>
                                      <p className="mt-1 text-xs text-slate-500">
                                        안 읽은 알림 {unreadCount}개
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={handleReadAllNotifications}
                                      disabled={unreadCount <= 0}
                                      className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-600 ring-1 ring-emerald-100 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      모두 읽음
                                    </button>
                                  </div>

                                  {/* 내용 영역 */}
                                  <div className="max-h-[420px] overflow-y-auto px-3 py-3">
                                    {notificationsLoading && (
                                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                                        알림을 불러오는 중이에요...
                                      </div>
                                    )}

                                    {!notificationsLoading && notificationsError && (
                                      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-600">
                                        {notificationsError}
                                      </div>
                                    )}

                                    {!notificationsLoading &&
                                      !notificationsError &&
                                      notifications.length === 0 && (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                                          아직 도착한 알림이 없어요.
                                        </div>
                                      )}

                                    {!notificationsLoading &&
                                      !notificationsError &&
                                      notifications.length > 0 && (
                                        <div className="space-y-2">
                                          {notifications.map((item) => {
                                            const displayMessage =
                                              item?.message?.trim() ||
                                              buildNotificationFallbackMessage(item);

                                            return (
                                              <button
                                                key={item.notificationId}
                                                type="button"
                                                onClick={() => handleNotificationClick(item)}
                                                className={[
                                                  "w-full rounded-2xl border px-4 py-3 text-left transition",
                                                  item.isRead
                                                    ? "border-slate-200 bg-white hover:bg-slate-50"
                                                    : "border-emerald-100 bg-emerald-50/60 hover:bg-emerald-50",
                                                ].join(" ")}
                                              >
                                                <div className="flex items-start gap-3">
                                                  {/* 왼쪽 작은 아이콘 */}
                                                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-lg ring-1 ring-slate-200">
                                                    {getNotificationEmoji(item.type)}
                                                  </div>

                                                  {/* 가운데 문구 */}
                                                  <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold leading-5 text-slate-800">
                                                      {displayMessage}
                                                    </p>

                                                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                                                      {item.actorName && (
                                                        <span className="font-semibold text-slate-600">
                                                          {item.actorName}
                                                        </span>
                                                      )}
                                                      <span>{formatNotificationTime(item.createdAt)}</span>
                                                    </div>
                                                  </div>

                                                  {/* 안 읽음 점 */}
                                                  {!item.isRead && (
                                                    <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                                                  )}
                                                </div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* 내정보 + 로그아웃 영역 */}
                            <div className="relative flex items-center gap-2" ref={profileBoxRef}>
                              {/* 내정보 버튼 */}
                              <button
                                type="button"
                                onClick={() => {
                                  setProfileOpen((prev) => !prev);
                                  setNotificationOpen(false);
                                }}
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