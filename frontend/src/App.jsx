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
  AUTH_SESSION_EXPIRED_EVENT,
} from "./api/authSessionUtils";
import {
  getNotifications,
  getUnreadCount,
  readAllNotifications,
  readNotification,
} from "./api/notificationApi";

import {
  subscribeNotificationSocket,
} from "./api/notificationSocketApi";

import {
  useStompClient,
} from "./realtime/StompClientProvider";
import {
  OnboardingProvider,
} from "./features/onboarding/OnboardingProvider";
import OnboardingHelpDialog from "./features/onboarding/components/OnboardingHelpDialog";
import MemoryJarLogoIcon from "./components/icons/MemoryJarLogoIcon";
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

  /*
   * 앱 전체에서 공유하는 STOMP 연결 기능을 꺼낸다.
   */
  const {
    start,
    stop,
    subscribe,
  } = useStompClient();

  // 현재 로그인한 사용자 정보
  const [me, setMe] = useState(null);

  // 로그인 확인 중인지
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 로그아웃 중인지
  const [loggingOut, setLoggingOut] = useState(false);

  // 로그인 직후 목적지 화면 위에 잠깐 보여줄 완료 알림
  const [loginToastMessage, setLoginToastMessage] = useState("");

  // 내정보 패널 열림 상태
  const [profileOpen, setProfileOpen] = useState(false);

  /*
   * 내정보에서 "Memory Jar 이용 방법"을 눌렀을 때
   * 어떤 안내를 다시 볼지 선택하는 창의 열림 상태
   */
  const [
    onboardingHelpOpen,
    setOnboardingHelpOpen,
  ] = useState(false);

  // 내정보 패널 안에 보여줄 저금통 미리보기 목록
  const [myJarsPreview, setMyJarsPreview] = useState([]);

  // 홈 페이지인지 확인
  const isHomePage = location.pathname === "/";

  // 로그인 성공 전환 화면에서는 공통 헤더를 잠시 숨긴다.
  const isLoginSuccessPage = location.pathname === "/login/success";

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
  /*
   * 로그인 성공 화면은 LoginSuccess가 직접 /api/v1/me를 확인한다.
   * 여기서 같은 요청을 다시 보내지 않아 중복 호출을 막는다.
   */
  if (isLoginSuccessPage) {
    setCheckingAuth(true);
    return;
  }

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
}, [isLoginSuccessPage, location.pathname]);

/*
 * API 요청 중 Refresh Token까지 만료된 경우
 * apiClient가 보내는 로그인 만료 이벤트를 처리한다.
 *
 * 헤더에 이전 사용자 정보가 남거나
 * 알림·내정보 패널이 계속 열려 있는 문제를 막는다.
 */
useEffect(() => {
  function handleSessionExpired() {
    // 기존 로그인 사용자 정보 제거
    setMe(null);

    // 인증 확인은 끝난 로그아웃 상태로 처리
    setCheckingAuth(false);

    // 로그인 사용자 전용 패널 닫기
    setProfileOpen(false);
    setNotificationOpen(false);

    // 이용 방법 선택창도 닫는다.
    setOnboardingHelpOpen(false);

    // 이전 사용자의 알림 정보 제거
    setUnreadCount(0);
    setNotifications([]);
    setNotificationsError("");

    // 이전 사용자의 저금통 미리보기 제거
    setMyJarsPreview([]);
  }

  window.addEventListener(
    AUTH_SESSION_EXPIRED_EVENT,
    handleSessionExpired
  );

  return () => {
    window.removeEventListener(
      AUTH_SESSION_EXPIRED_EVENT,
      handleSessionExpired
    );
  };
}, []);

/*
 * 로그인 성공 화면이 저장한 완료 메시지를 한 번만 꺼낸다.
 *
 * sessionStorage를 사용하므로 새로고침하거나 다른 화면을 다시 열 때
 * 같은 로그인 알림이 반복해서 나타나지 않는다.
 */
useEffect(() => {
  const savedMessage = sessionStorage.getItem("loginSuccessToast");

  if (!savedMessage) {
    return;
  }

  sessionStorage.removeItem("loginSuccessToast");
  setLoginToastMessage(savedMessage);
}, [location.pathname]);

/*
 * 로그인 완료 알림은 2.6초 뒤 자동으로 닫는다.
 */
useEffect(() => {
  if (!loginToastMessage) {
    return;
  }

  const closeTimer = window.setTimeout(() => {
    setLoginToastMessage("");
  }, 2600);

  return () => {
    window.clearTimeout(closeTimer);
  };
}, [loginToastMessage]);

  /*
   * 로그인 상태에 맞춰 공용 STOMP 연결을 시작하거나 종료한다.
   */
  useEffect(() => {
    /*
     * 아직 /api/v1/me 확인 중이라면
     * 로그인 여부를 판단하지 않는다.
     */
    if (checkingAuth) {
      return;
    }

    const currentUserId = getCurrentUserId(me);

    if (currentUserId) {
      /*
       * 로그인된 경우 공용 WebSocket 연결을
       * 한 번만 시작한다.
       */
      start();
      return;
    }

    /*
     * 로그아웃 상태라면 연결과
     * 이전 topic 등록을 모두 정리한다.
     */
    stop({
      clearSubscriptions: true,
    });
  }, [
    checkingAuth,
    me?.userId,
    me?.id,
    start,
    stop,
  ]);

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

      /*
       * 알림 WebSocket topic 구독
       *
       * 공용 연결은 그대로 유지하고
       * 로그인 사용자의 알림 topic만 구독한다.
       */
      useEffect(() => {
        const currentUserId = getCurrentUserId(me);

        if (!currentUserId) {
          return;
        }

        const unsubscribe =
          subscribeNotificationSocket({
            subscribe,
            userId: currentUserId,

            onNotificationReceived:
              (newNotification) => {
                if (
                  !newNotification?.notificationId
                ) {
                  loadUnreadCount();
                  return;
                }

                setUnreadCount(
                  (prev) =>
                    Number(prev || 0) + 1
                );

                setNotifications((prev) => {
                  const alreadyExists = prev.some(
                    (item) =>
                      item.notificationId ===
                      newNotification.notificationId
                  );

                  if (alreadyExists) {
                    return prev;
                  }

                  return [
                    newNotification,
                    ...prev,
                  ].slice(0, 10);
                });
              },

            onError: () => {
              /*
               * WebSocket 오류가 발생해도
               * REST API로 알림 개수를 다시 맞춘다.
               */
              loadUnreadCount();
            },
          });

        /*
         * App 또는 로그인 사용자가 바뀌면
         * 전체 연결이 아니라 알림 topic만 해제한다.
         */
        return unsubscribe;
      }, [
        me?.userId,
        me?.id,
        loadUnreadCount,
        subscribe,
      ]);

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

  /*
   * OnboardingProvider에는 사용자 전체 정보가 아니라
   * 온보딩 조회에 필요한 사용자 번호만 전달한다.
   */
  const currentUserId =
    getCurrentUserId(me);

  return (
    <OnboardingProvider
      userId={currentUserId}
      checkingAuth={checkingAuth}
    >
      <div className="min-h-screen bg-white text-slate-900">
      {/* 로그인 성공 전환 화면에서는 본문에만 집중할 수 있도록 헤더를 숨긴다. */}
      {!isLoginSuccessPage && (
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
            {/* 로그인 저금통과 같은 재질을 사용하는 브랜드 로고 아이콘 */}
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100/80 via-cyan-50 to-violet-100/80 shadow-sm ring-1 ring-white/90 transition duration-300 group-hover:scale-105 group-hover:shadow-md">
              <MemoryJarLogoIcon className="h-10 w-10" />
            </div>

            <div className="leading-tight">
              <p className="text-[18px] font-bold uppercase tracking-[0.28em] text-emerald-600">
                Memory Jar
              </p>

            </div>
          </Link>

          {/* 오른쪽 메뉴 전체 묶음
              - 로그인 전에는 메뉴를 보여주지 않아 로고만 남긴다.
              - 로그인 후에는 Jars, 알림, 내정보, 로그아웃만 보여준다. */}
          <div className="flex items-center gap-2">
            {/* 로그인된 경우만 저금통 메뉴와 사용자 기능을 보여준다. */}
            {!checkingAuth && me && (
              <div className="flex items-center gap-2">
                {/* Home 메뉴 없이 저금통 목록으로 바로 이동한다. */}
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

                                  {/*
                                   * 이용 방법 다시 보기
                                   *
                                   * 내정보 패널은 닫고,
                                   * 별도의 큰 선택창을 연다.
                                   */}
                                  <div className="border-b border-slate-100 px-5 py-4">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProfileOpen(false);
                                        setOnboardingHelpOpen(true);
                                      }}
                                      className="group flex w-full items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                                    >
                                      {/* 물음표 아이콘 */}
                                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-base font-black text-emerald-600 shadow-sm ring-1 ring-emerald-100">
                                        ?
                                      </span>

                                      <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-slate-800">
                                          Memory Jar 이용 방법
                                        </span>

                                        <span className="mt-0.5 block text-xs font-medium text-slate-500">
                                          완료한 안내를 다시 확인해요
                                        </span>
                                      </span>

                                      <span
                                        aria-hidden="true"
                                        className="text-lg font-black text-emerald-400 transition group-hover:translate-x-1"
                                      >
                                        →
                                      </span>
                                    </button>
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
    )}

    {/*
     * 내정보에서 열 수 있는 이용 방법 선택창
     *
     * OnboardingProvider 안에서 렌더링되므로
     * 내부에서 useOnboarding을 사용할 수 있다.
     */}
    <OnboardingHelpDialog
      isOpen={
        onboardingHelpOpen
      }
      jars={
        myJarsPreview
      }
      onClose={() =>
        setOnboardingHelpOpen(false)
      }
    />

    {/* 로그인 직후 목적지 화면에서 잠깐 보여주는 완료 알림 */}
    {loginToastMessage && (
  <div
    className="pointer-events-none fixed left-1/2 top-6 z-[200] w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
    role="status"
    aria-live="polite"
  >
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl">
      {/* 로그인 완료 체크 아이콘 */}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-base font-black text-white"
        aria-hidden="true"
      >
        ✓
      </span>

      {/* LoginSuccess가 저장한 완료 문구 */}
      <p className="text-sm font-bold text-slate-800">
        {loginToastMessage}
      </p>
    </div>
  </div>
)}

        {/* 페이지 본문 */}
        <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login/success" element={<LoginSuccess />} />
          <Route path="/jars" element={<JarsPage />} />
          <Route path="/jars/new" element={<JarsNewPage />} />
          <Route path="/jars/:jarId" element={<JarDetailPage />} />
          {/*
           * 초대 페이지에 App이 이미 확인한 로그인 사용자 정보를 전달한다.
           * InvitePage에서 /api/v1/me를 다시 호출하지 않아 중복 요청을 줄인다.
           */}
          <Route path="/invite/:code" element={<InvitePage me={me} checkingAuth={checkingAuth} />} />
        </Routes>
      </main>
    </div>
    </OnboardingProvider>
  );
}