/*
 * MobileHeaderMenu 역할
 *
 * 모바일 화면에서 햄버거 버튼을 눌렀을 때
 * 오른쪽에서 열리는 전용 메뉴를 담당한다.
 *
 * 모바일 메뉴에서 할 수 있는 일:
 * 1. 로그인한 사용자 이름/이메일 확인
 * 2. 내 저금통 목록 화면으로 이동
 * 3. 내정보(이름/이메일/출생연도) 확인
 * 4. Memory Jar 이용 방법 다시 보기
 * 5. 로그아웃
 *
 * PC 헤더는 App.jsx의 기존 메뉴를 그대로 사용하고,
 * 이 컴포넌트는 sm(640px) 미만에서만 보인다.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import MemoryJarLogoIcon from "../icons/MemoryJarLogoIcon";

export default function MobileHeaderMenu({
  isOpen,
  me,
  loggingOut,
  onClose,
  onOpenGuide,
  onLogout,
}) {
  // "내정보"를 눌렀을 때 상세 정보를 펼칠지 기억한다.
  const [profileDetailOpen, setProfileDetailOpen] = useState(false);

  /*
   * 메뉴가 열려 있는 동안에는 뒤쪽 페이지 스크롤을 막는다.
   *
   * 예:
   * 메뉴를 열었는데 뒤의 저금통 목록이 같이 움직이면
   * 모바일에서는 사용하기 불편하다.
   *
   * ESC 키를 누르면 메뉴도 닫는다.
   */
  useEffect(() => {
    if (!isOpen) {
      setProfileDetailOpen(false);
      return undefined;
    }

    // 메뉴를 열기 전 body의 원래 스크롤 설정을 기억한다.
    const previousOverflow = document.body.style.overflow;

    // 메뉴가 열려 있는 동안 뒤쪽 화면 스크롤을 막는다.
    document.body.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      // 메뉴가 닫히면 원래 스크롤 상태로 되돌린다.
      document.body.style.overflow = previousOverflow;

      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [isOpen, onClose]);

  /*
   * 모바일 메뉴를 닫는다.
   *
   * 내정보를 펼친 상태였다면 그것도 같이 초기화한다.
   */
  const handleClose = () => {
    setProfileDetailOpen(false);
    onClose();
  };

  /*
   * 이용 방법 선택창을 열기 전에
   * 모바일 메뉴를 먼저 닫는다.
   */
  const handleOpenGuide = () => {
    handleClose();
    onOpenGuide();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          id="mobile-header-menu"
          className="fixed inset-0 z-[90] sm:hidden"
        >
          {/*
           * 메뉴 뒤쪽의 어두운 배경
           *
           * 사용자가 메뉴 바깥을 누르면
           * 모바일 메뉴를 닫는다.
           */}
          <motion.button
            type="button"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]"
            aria-label="모바일 메뉴 닫기"
          />

          {/*
           * 실제 오른쪽 슬라이드 메뉴
           *
           * 처음에는 화면 오른쪽 밖에 있다가
           * x: 0 위치로 움직이면서 나타난다.
           */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="모바일 메뉴"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              duration: 0.24,
              ease: "easeOut",
            }}
            className="absolute right-0 top-0 flex h-dvh w-[min(86vw,340px)] flex-col overflow-hidden bg-white shadow-[-18px_0_55px_rgba(15,23,42,0.18)]"
          >
            {/* 로그인 사용자 요약 정보 + 닫기 버튼 */}
            <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-5 pb-5 pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  {/*
                   * 로그인 사용자 이름의 첫 글자를
                   * 프로필 원 안에 보여준다.
                   */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-cyan-300 text-sm font-black text-slate-900 shadow-sm">
                    {(me?.name || "U").slice(0, 1)}
                  </div>

                  <div className="min-w-0">
                    {/* 사용자 이름 */}
                    <p className="truncate text-base font-black text-slate-900">
                      {me?.name || "이름 없음"}
                    </p>

                    {/* 사용자 이메일 */}
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                      {me?.email || "이메일 정보 없음"}
                    </p>
                  </div>
                </div>

                {/* X 닫기 버튼 */}
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                  aria-label="모바일 메뉴 닫기"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12" />
                    <path d="M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 가운데 메뉴 목록 */}
            <div className="flex-1 overflow-y-auto px-4 py-5">
              <div className="space-y-2">

                {/* ==================================================
                 * 1. 내 저금통
                 * ================================================== */}
                <Link
                  to="/jars"
                  onClick={handleClose}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-black text-slate-800 transition hover:bg-emerald-50"
                >
                  {/* Memory Jar 아이콘 */}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <MemoryJarLogoIcon className="h-7 w-7" />
                  </span>

                  <span className="flex-1">
                    내 저금통
                  </span>

                  <span
                    className="text-slate-300"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </Link>

                {/* ==================================================
                 * 2. 내정보
                 *
                 * 현재 프로젝트에는 별도 /profile 페이지가 없다.
                 *
                 * 그래서 /api/v1/me가 내려주는
                 * 이름 / 이메일 / 출생연도를
                 * 메뉴 안에서 펼쳐 보여준다.
                 * ================================================== */}
                <button
                  type="button"
                  onClick={() =>
                    setProfileDetailOpen(
                      (prev) => !prev
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-black text-slate-800 transition hover:bg-slate-50"
                  aria-expanded={profileDetailOpen}
                >
                  {/* 사람 아이콘 */}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle
                        cx="12"
                        cy="8"
                        r="3.5"
                      />

                      <path d="M5 19c.8-3.4 3.2-5 7-5s6.2 1.6 7 5" />
                    </svg>
                  </span>

                  <span className="flex-1">
                    내정보
                  </span>

                  {/* 펼침 상태를 알려주는 화살표 */}
                  <span
                    className={[
                      "text-slate-400 transition-transform",
                      profileDetailOpen
                        ? "rotate-180"
                        : "rotate-0",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    ↓
                  </span>
                </button>

                {/* 내정보를 눌렀을 때 펼쳐지는 영역 */}
                {profileDetailOpen && (
                  <div className="mx-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-600">

                    {/* 이름 */}
                    <div className="flex items-start justify-between gap-4">
                      <span className="font-bold text-slate-500">
                        이름
                      </span>

                      <span className="break-all text-right font-semibold text-slate-800">
                        {me?.name || "정보 없음"}
                      </span>
                    </div>

                    {/* 이메일 */}
                    <div className="mt-3 flex items-start justify-between gap-4">
                      <span className="font-bold text-slate-500">
                        이메일
                      </span>

                      <span className="min-w-0 break-all text-right font-semibold text-slate-800">
                        {me?.email || "정보 없음"}
                      </span>
                    </div>

                  </div>
                )}

                {/* ==================================================
                 * 3. Memory Jar 이용 방법
                 * ================================================== */}
                <button
                  type="button"
                  onClick={handleOpenGuide}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-black text-slate-800 transition hover:bg-emerald-50"
                >
                  {/* 물음표 아이콘 */}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-base font-black text-emerald-600">
                    ?
                  </span>

                  <span className="flex-1">
                    Memory Jar 이용 방법
                  </span>

                  <span
                    className="text-slate-300"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </button>
              </div>
            </div>

            {/* ====================================================
             * 4. 로그아웃
             *
             * 다른 메뉴와 구분하기 위해
             * 화면 가장 아래에 따로 배치한다.
             * ==================================================== */}
            <div className="border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={onLogout}
                disabled={loggingOut}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {/* 로그아웃 아이콘 */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                  <path d="M14 8l4 4-4 4" />
                  <path d="M9 12h9" />
                </svg>

                {loggingOut
                  ? "로그아웃 중..."
                  : "로그아웃"}
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}