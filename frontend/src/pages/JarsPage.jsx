import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";
import SandIcon from "../components/icons/SandIcon";
import LavenderIcon from "../components/icons/LavenderIcon";
import MoonlightIcon from "../components/icons/MoonlightIcon";
import DewIcon from "../components/icons/DewIcon";
import SpringIcon from "../components/icons/SpringIcon";
import SummerIcon from "../components/icons/SummerIcon";
import AutumnIcon from "../components/icons/AutumnIcon";
import WinterIcon from "../components/icons/WinterIcon";
import SpringParticleIcon from "../components/icons/SpringParticleIcon";
import SummerParticleIcon from "../components/icons/SummerParticleIcon";
import AutumnParticleIcon from "../components/icons/AutumnParticleIcon";
import WinterParticleIcon from "../components/icons/WinterParticleIcon";
import LavenderParticleIcon from "../components/icons/LavenderParticleIcon";
import DewParticleIcon from "../components/icons/DewParticleIcon";
import SandParticleIcon from "../components/icons/SandParticleIcon";
import MoonlightParticleIcon from "../components/icons/MoonlightParticleIcon";

/*
  JarsPage 역할
  - 내가 참여 중인 저금통 목록을 서버에서 불러와 보여주는 페이지
  - 예전에는 단순한 텍스트 카드였다면,
    지금 버전은 "상세 페이지 감성"을 목록 카드로 줄여서 보여주는 버전이야.
  - 즉, 목록에서도 저금통 서비스 느낌이 바로 나도록 만든 페이지야.
*/

// 영어 enum 값을 화면용 한글로 바꿔주는 작은 사전

const ROLE_LABEL = {
  OWNER: "방장",
  ADMIN: "관리자",
  MEMBER: "멤버",
};

const THEME_LABEL = {
  // 새 테마 값
  SPRING: "봄",
  SUMMER: "여름",
  AUTUMN: "가을",
  WINTER: "겨울",
  LAVENDER: "라벤더",
  DEW: "이슬",
  SAND: "모래",
  MOONLIGHT: "달빛",
};

// 한 페이지에서 보여줄 저금통 개수
const PAGE_SIZE = 3;

// 날짜를 보기 좋게 바꿔주는 함수
function formatDate(dateTime) {
  if (!dateTime) return "-";

  const date = new Date(dateTime);

  // 날짜가 이상하면 "-" 로 보여주기
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 날짜 문자열을 안전하게 Date 객체로 바꾸는 함수
function parseDate(dateTime) {
  if (!dateTime) return null;

  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

// D-day 텍스트를 만들어주는 함수
function getDdayText(openAt, isOpen) {
  if (isOpen) return "OPEN";

  const openDate = parseDate(openAt);
  if (!openDate) return "날짜 미정";

  const diff = openDate.getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) return "오늘 열려요";
  if (days === 1) return "D-1";

  return `D-${days}`;
}

// 오픈까지 얼마나 가까운지 "느낌"으로 보여주는 진행 바 너비
// 지금 API에는 createdAt이 항상 오지 않을 수 있어서
// 아주 정확한 퍼센트보다 "곧 열림 / 아직 멂" 느낌을 보여주는 방식으로 만들었어.
function getOpenProgressWidth(jar) {
  if (jar?.isOpen) return 100;

  const openDate = parseDate(jar?.openAt);
  if (!openDate) return 14;

  const diff = openDate.getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) return 96;
  if (days <= 3) return 84;
  if (days <= 7) return 70;
  if (days <= 14) return 56;
  if (days <= 30) return 42;
  return 24;
}

/*
 * getThemeIcon 역할
 *
 * 저금통 목록 카드 안에 보여줄 대표 SVG 아이콘을 골라주는 함수야.
 *
 * 쉽게 말하면:
 * - 봄이면 SpringIcon
 * - 여름이면 SummerIcon
 * - 가을이면 AutumnIcon
 * 처럼 우리가 만든 둥근 테마 아이콘을 보여준다.
 */
function getThemeIcon(theme, size = 52) {
  if (theme === "SPRING") {
    return <SpringIcon size={size} />;
  }

  if (theme === "SUMMER") {
    return <SummerIcon size={size} />;
  }

  if (theme === "AUTUMN") {
    return <AutumnIcon size={size} />;
  }

  if (theme === "WINTER") {
    return <WinterIcon size={size} />;
  }

  if (theme === "DEW") {
    return <DewIcon size={size} />;
  }

  if (theme === "SAND") {
    return <SandIcon size={size} />;
  }

  if (theme === "MOONLIGHT") {
    return <MoonlightIcon size={size} />;
  }

  return <LavenderIcon size={size} />;
}

/*
 * getThemeMiniParticles 역할
 *
 * 저금통 목록 썸네일 안에 작게 보여줄 장식을 골라주는 함수야.
 *
 * 상세 페이지처럼 계속 떨어지는 애니메이션은 아니고,
 * 카드 안에서 테마 분위기만 살짝 보여주는 정적인 장식이야.
 */

 // 테마별 색상 묶음
 // 상세 페이지처럼 각 저금통이 자기 색을 가지게 해주는 부분이야.
 function getThemePalette(theme) {
   // 봄 테마
   if (theme === "SPRING" || theme === "COUPLE") {
     return {
       pageGlow: "from-rose-100/40 via-orange-100/30 to-transparent",
       heroRing: "ring-rose-100",
       heroDot: "bg-rose-400",
       heroBadge: "bg-rose-100 text-rose-700",
       heroButton: "from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600",
       card: "border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-orange-50 hover:border-rose-300",
       cardShadow: "shadow-[0_12px_40px_rgba(244,63,94,0.10)]",
       badge: "bg-gradient-to-r from-rose-500 to-orange-500 text-white",
       soft: "bg-rose-100 text-rose-700",
       infoBox: "border-rose-100/90 bg-white/75",
       outline: "border-rose-200 bg-white/80 text-rose-700 hover:bg-rose-50",
       previewBody: "border-rose-200 bg-gradient-to-b from-rose-100 via-pink-50 to-white",
       previewLid: "bg-gradient-to-r from-rose-500 to-orange-500",
       glow: "bg-rose-300/40",
       progress: "from-rose-500 to-orange-500",
     };
   }

   // 여름 테마
   if (theme === "SUMMER" || theme === "FAMILY") {
     return {
       pageGlow: "from-emerald-100/40 via-lime-100/30 to-transparent",
       heroRing: "ring-emerald-100",
       heroDot: "bg-emerald-500",
       heroBadge: "bg-emerald-100 text-emerald-700",
       heroButton: "from-emerald-500 to-lime-500 hover:from-emerald-600 hover:to-lime-600",
       card: "border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-lime-50 hover:border-emerald-300",
       cardShadow: "shadow-[0_12px_40px_rgba(16,185,129,0.10)]",
       badge: "bg-gradient-to-r from-emerald-500 to-lime-500 text-white",
       soft: "bg-emerald-100 text-emerald-700",
       infoBox: "border-emerald-100/90 bg-white/75",
       outline: "border-emerald-200 bg-white/80 text-emerald-700 hover:bg-emerald-50",
       previewBody: "border-emerald-200 bg-gradient-to-b from-emerald-100 via-lime-50 to-white",
       previewLid: "bg-gradient-to-r from-emerald-500 to-lime-500",
       glow: "bg-emerald-300/40",
       progress: "from-emerald-500 to-lime-500",
     };
   }

   // 가을 테마
   if (theme === "AUTUMN") {
     return {
       pageGlow: "from-orange-100/40 via-rose-100/30 to-transparent",
       heroRing: "ring-orange-100",
       heroDot: "bg-orange-500",
       heroBadge: "bg-orange-100 text-orange-700",
       heroButton: "from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600",
       card: "border-orange-200/80 bg-gradient-to-br from-orange-50 via-white to-rose-50 hover:border-orange-300",
       cardShadow: "shadow-[0_12px_40px_rgba(249,115,22,0.12)]",
       badge: "bg-gradient-to-r from-orange-500 to-rose-500 text-white",
       soft: "bg-orange-100 text-orange-700",
       infoBox: "border-orange-100/90 bg-white/75",
       outline: "border-orange-200 bg-white/80 text-orange-700 hover:bg-orange-50",
       previewBody: "border-orange-200 bg-gradient-to-b from-orange-100 via-amber-50 to-white",
       previewLid: "bg-gradient-to-r from-orange-500 to-rose-500",
       glow: "bg-orange-300/40",
       progress: "from-orange-500 to-rose-500",
     };
   }

   // 겨울 테마
   if (theme === "WINTER" || theme === "FRIEND") {
     return {
       pageGlow: "from-sky-100/40 via-indigo-100/30 to-transparent",
       heroRing: "ring-sky-100",
       heroDot: "bg-sky-500",
       heroBadge: "bg-sky-100 text-sky-700",
       heroButton: "from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600",
       card: "border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-indigo-50 hover:border-sky-300",
       cardShadow: "shadow-[0_12px_40px_rgba(59,130,246,0.10)]",
       badge: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white",
       soft: "bg-sky-100 text-sky-700",
       infoBox: "border-sky-100/90 bg-white/75",
       outline: "border-sky-200 bg-white/80 text-sky-700 hover:bg-sky-50",
       previewBody: "border-sky-200 bg-gradient-to-b from-sky-100 via-cyan-50 to-white",
       previewLid: "bg-gradient-to-r from-sky-500 to-indigo-500",
       glow: "bg-sky-300/40",
       progress: "from-sky-500 to-indigo-500",
     };
   }

   // 이슬 테마
   if (theme === "DEW") {
     return {
       pageGlow: "from-cyan-100/40 via-teal-100/30 to-transparent",
       heroRing: "ring-teal-100",
       heroDot: "bg-teal-400",
       heroBadge: "bg-teal-100 text-teal-700",
       heroButton: "from-teal-400 to-sky-400 hover:from-teal-500 hover:to-sky-500",
       card: "border-teal-200/80 bg-gradient-to-br from-cyan-50 via-white to-sky-50 hover:border-teal-300",
       cardShadow: "shadow-[0_12px_40px_rgba(20,184,166,0.10)]",
       badge: "bg-gradient-to-r from-teal-400 to-sky-400 text-white",
       soft: "bg-teal-100 text-teal-700",
       infoBox: "border-teal-100/90 bg-white/75",
       outline: "border-teal-200 bg-white/80 text-teal-700 hover:bg-teal-50",
       previewBody: "border-teal-200 bg-gradient-to-b from-cyan-100 via-teal-50 to-white",
       previewLid: "bg-gradient-to-r from-teal-400 to-sky-400",
       glow: "bg-teal-300/40",
       progress: "from-teal-400 to-sky-400",
     };
   }

   // 모래 테마
   if (theme === "SAND") {
     return {
       pageGlow: "from-amber-100/40 via-orange-100/30 to-transparent",
       heroRing: "ring-amber-100",
       heroDot: "bg-amber-500",
       heroBadge: "bg-amber-100 text-amber-800",
       heroButton: "from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600",
       card: "border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 hover:border-amber-300",
       cardShadow: "shadow-[0_12px_40px_rgba(217,119,6,0.10)]",
       badge: "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
       soft: "bg-amber-100 text-amber-800",
       infoBox: "border-amber-100/90 bg-white/75",
       outline: "border-amber-200 bg-white/80 text-amber-800 hover:bg-amber-50",
       previewBody: "border-amber-200 bg-gradient-to-b from-amber-100 via-yellow-50 to-white",
       previewLid: "bg-gradient-to-r from-amber-500 to-orange-500",
       glow: "bg-amber-300/40",
       progress: "from-amber-500 to-orange-500",
     };
   }

   // 달빛 테마
   if (theme === "MOONLIGHT") {
     return {
       pageGlow: "from-indigo-100/40 via-slate-100/30 to-transparent",
       heroRing: "ring-indigo-100",
       heroDot: "bg-indigo-600",
       heroBadge: "bg-indigo-100 text-indigo-700",
       heroButton: "from-indigo-700 to-slate-500 hover:from-indigo-800 hover:to-slate-600",
       card: "border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-slate-50 hover:border-indigo-300",
       cardShadow: "shadow-[0_12px_40px_rgba(79,70,229,0.11)]",
       badge: "bg-gradient-to-r from-indigo-700 to-slate-500 text-white",
       soft: "bg-indigo-100 text-indigo-700",
       infoBox: "border-indigo-100/90 bg-white/75",
       outline: "border-indigo-200 bg-white/80 text-indigo-700 hover:bg-indigo-50",
       previewBody: "border-indigo-200 bg-gradient-to-b from-indigo-100 via-slate-50 to-white",
       previewLid: "bg-gradient-to-r from-indigo-700 to-slate-500",
       glow: "bg-indigo-300/40",
       progress: "from-indigo-700 to-slate-500",
     };
   }

   // 라벤더 테마
   return {
     pageGlow: "from-violet-100/40 via-fuchsia-100/30 to-transparent",
     heroRing: "ring-violet-100",
     heroDot: "bg-violet-500",
     heroBadge: "bg-violet-100 text-violet-700",
     heroButton: "from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600",
     card: "border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 hover:border-violet-300",
     cardShadow: "shadow-[0_12px_40px_rgba(139,92,246,0.10)]",
     badge: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
     soft: "bg-violet-100 text-violet-700",
     infoBox: "border-violet-100/90 bg-white/75",
     outline: "border-violet-200 bg-white/80 text-violet-700 hover:bg-violet-50",
     previewBody: "border-violet-200 bg-gradient-to-b from-violet-100 via-fuchsia-50 to-white",
     previewLid: "bg-gradient-to-r from-violet-500 to-fuchsia-500",
     glow: "bg-violet-300/40",
     progress: "from-violet-500 to-fuchsia-500",
   };
 }

// 카드 왼쪽에 들어가는 작은 저금통 미리보기
function JarListVisual({ jar }) {
  const palette = getThemePalette(jar?.theme);

  // 목록 카드 안에 보여줄 대표 SVG 아이콘
  const themeIcon = getThemeIcon(jar?.theme, 58);

  return (
    <div className="relative mx-auto flex h-[196px] w-36 items-center justify-center">
      {/* 뒤에 은은하게 퍼지는 빛 */}
      <div className={`absolute inset-4 rounded-full blur-3xl ${palette.glow}`} />

      {/* 저금통 뚜껑 */}
      <div
        className={`absolute top-8 z-20 h-7 w-[88px] rounded-full ${palette.previewLid} shadow-md`}
      />
      <div className="absolute top-[42px] z-30 h-1.5 w-9 rounded-full bg-slate-700/70" />

      {/* 저금통 몸통 */}
      <div
        className={`relative z-10 mt-6 flex h-[122px] w-[106px] flex-col items-center justify-center overflow-hidden rounded-[42%_42%_28%_28%] border-4 ${palette.previewBody} shadow-[0_18px_35px_rgba(15,23,42,0.10)]`}
      >
        {/* 유리 반짝임 */}
        <div className="absolute left-3 top-5 z-30 h-14 w-2 rounded-full bg-white/55 blur-[1px]" />
        <div className="absolute right-4 top-7 z-30 h-10 w-1.5 rounded-full bg-white/35 blur-[1px]" />

        {/* 가운데 대표 테마 SVG 아이콘 */}
        <div className="relative z-40 flex h-[62px] w-[62px] items-center justify-center">
          {themeIcon}
        </div>
      </div>
    </div>
  );
}

// 로딩 중일 때 보여줄 스켈레톤 카드
function LoadingCard() {
  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="animate-pulse">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="mx-auto h-40 w-32 rounded-[28px] bg-slate-100 md:mx-0" />

          <div className="flex-1">
            <div className="mb-4 flex flex-wrap gap-2">
              <div className="h-7 w-24 rounded-full bg-slate-100" />
              <div className="h-7 w-24 rounded-full bg-slate-100" />
              <div className="h-7 w-20 rounded-full bg-slate-100" />
              <div className="h-7 w-16 rounded-full bg-slate-100" />
            </div>

            <div className="h-8 w-64 rounded-xl bg-slate-100" />
            <div className="mt-3 h-4 w-full rounded bg-slate-100" />
            <div className="mt-2 h-4 w-4/5 rounded bg-slate-100" />

            <div className="mt-5 flex flex-wrap gap-2">
              <div className="h-8 w-28 rounded-full bg-slate-100" />
              <div className="h-8 w-28 rounded-full bg-slate-100" />
              <div className="h-8 w-20 rounded-full bg-slate-100" />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="h-16 rounded-2xl bg-slate-100" />
              <div className="h-16 rounded-2xl bg-slate-100" />
            </div>

            <div className="mt-5 h-3 rounded-full bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JarsPage() {
    const navigate = useNavigate();

  // 서버에서 받아온 저금통 목록
  const [items, setItems] = useState([]);

  // 로딩 중인지 표시
  const [loading, setLoading] = useState(true);

  // 에러 메시지 저장
  const [error, setError] = useState("");

  // 현재 페이지 번호
  const [page, setPage] = useState(0);

  // 전체 페이지 수
  const [totalPages, setTotalPages] = useState(0);

  const [totalElements, setTotalElements] = useState(0);

  // 저금통 목록 불러오는 함수
  const loadJars = async (targetPage = 0) => {
    setLoading(true);
    setError("");

    try {
      const res = await apiClient.get("/api/v1/jars", {
        params: {
          page: targetPage,
          size: PAGE_SIZE,
        },
      });

      // 우리 서버는 항상 { data: ... } 형태로 감싸서 보내줘요.
      const data = res.data?.data;

      setItems(data?.items || []);
      setPage(data?.page || 0);
      setTotalPages(data?.totalPages || 0);
      setTotalElements(data?.totalElements || 0);
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "저금통 목록을 불러오지 못했어요.";

      setError(serverMessage);
      setItems([]);
      setTotalPages(0);
      setTotalElements(0);
    } finally {
      setLoading(false);
    }
  };

    // 새 저금통 만들기 버튼을 눌렀을 때 실행되는 함수
    // 먼저 로그인한 사용자인지 확인하고,
    // 로그인된 상태면 생성 페이지로 보내줘요.
    // 로그인 안 되어 있으면 안내 문구를 띄워줘요.
    const handleCreateJarClick = async () => {
      try {
        // 로그인 사용자 정보 확인
        // 성공하면 로그인된 상태라는 뜻이에요.
        await apiClient.get("/api/v1/me");

        // 로그인되어 있으면 생성 페이지로 이동
        navigate("/jars/new");
      } catch (e) {
        const status = e?.response?.status;

        // 로그인 안 된 상태
        if (status === 401 || status === 403) {
          alert("로그인 후 저금통을 만들 수 있어요.");
          return;
        }

        // 그 외 서버 에러
        alert("지금은 저금통 만들기 화면으로 이동할 수 없어요. 잠시 후 다시 시도해 주세요.");
      }
    };

  // 페이지가 처음 열릴 때 목록을 한 번 불러와요.
  useEffect(() => {
    loadJars(0);
  }, []);

  // 대표 테마 하나를 골라서 상단 헤더 색감을 정해줘요.
  // 목록이 비어 있을 때는 기본으로 봄 테마 색감을 사용한다.
  const primaryTheme = items?.[0]?.theme || "SPRING";
  const primaryPalette = getThemePalette(primaryTheme);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100">
      {/* 페이지 뒤쪽 은은한 배경 빛 */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b ${primaryPalette.pageGlow}`} />

      <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {/* 맨 위 제목 영역 */}
        <section
          className={`mb-8 overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur md:p-8 ${primaryPalette.heroRing} ring-1`}
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${primaryPalette.heroBadge}`}>
                  저금통 보관함
                </span>

                {!loading && !error && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                    총 {totalElements}개
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
                내 저금통 목록
              </h1>


            </div>

            {/* 새 저금통 만들기 버튼 */}
            <button
              type="button"
              onClick={handleCreateJarClick}
              className={`inline-flex items-center justify-center rounded-2xl bg-gradient-to-r px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 ${primaryPalette.heroButton}`}
            >
              + 새 저금통 만들기
            </button>
          </div>
        </section>

        {/* 에러가 있을 때 보여주는 카드 */}
        {error && (
          <div className="mb-6 rounded-[28px] border border-red-200 bg-red-50/90 p-5 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {/* 로딩 중 화면 */}
        {loading && (
          <div className="grid gap-5">
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
          </div>
        )}

        {/* 로딩 끝 + 목록이 비어 있을 때 */}
        {!loading && items.length === 0 && !error && (
          <div className="rounded-[32px] border border-slate-200 bg-white/90 p-10 text-center shadow-[0_15px_40px_rgba(15,23,42,0.06)]">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 via-orange-50 to-white text-4xl shadow-inner">
              🫙
            </div>

            <p className="mt-6 text-xl font-black text-slate-800">
              아직 참여 중인 저금통이 없어요.
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              첫 번째 저금통을 만들어서
              <br className="md:hidden" /> 추억을 하나씩 모아보자!
            </p>

            <button
              type="button"
              onClick={handleCreateJarClick}
              className="mt-6 inline-flex rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              저금통 만들러 가기
            </button>
          </div>
        )}

        {/* 실제 목록 카드 */}
        {!loading && items.length > 0 && (
          <div className="grid gap-6">
            {items.map((jar) => {
              const palette = getThemePalette(jar.theme);
              const ddayText = getDdayText(jar.openAt, jar.isOpen);
              const progressWidth = getOpenProgressWidth(jar);

              return (
                <Link
                  key={jar.jarId}
                  to={`/jars/${jar.jarId}`}
                  className={`group block overflow-hidden rounded-[32px] border p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(15,23,42,0.12)] md:p-6 ${palette.card} ${palette.cardShadow}`}
                >
                  <div className="relative">
                    {/* 카드 위쪽 장식용 은은한 원 */}
                    <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/40 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-8 left-1/3 h-16 w-16 rounded-full bg-white/30 blur-xl" />

                    <div className="flex flex-col gap-6 md:flex-row md:items-center">
                      {/* 왼쪽: 썸네일 */}
                      <div className="md:w-[170px] md:shrink-0">
                        <JarListVisual jar={jar} />
                      </div>

                      {/* 오른쪽: 정보 */}
                      <div className="flex-1">
                        {/* 맨 위 배지들 */}
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.soft}`}>
                            {THEME_LABEL[jar.theme] || jar.theme}
                          </span>
                          <span className="rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                            내 역할: {ROLE_LABEL[jar.myRole] || jar.myRole}
                          </span>
                          {/* 참여 인원 */}
                          <span className="rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                          {jar.memberCount}/{jar.maxMembers}명
                          </span>
                          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.badge}`}>
                            {ddayText}
                          </span>
                        </div>

                        {/* 제목 + 들어가기 표시 */}
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <h2 className="truncate text-2xl font-black tracking-tight text-slate-900 md:text-[28px]">
                              {jar.name}
                            </h2>

                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                              {jar.description || "함께 모아 둔 추억을 열어볼 저금통이에요."}
                            </p>
                          </div>

                          {/* 카드 전체 클릭이 된다는 걸 보여주는 화살표 느낌 */}
                          <span
                            className={`hidden shrink-0 rounded-2xl border px-4 py-2 text-sm font-bold transition duration-200 group-hover:translate-x-1 md:inline-flex ${palette.outline}`}
                          >
                            상세 보기 →
                          </span>
                        </div>
                        {/* 날짜 정보 박스 */}
                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                          <div className={`rounded-2xl border px-4 py-3 shadow-sm ${palette.infoBox}`}>
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                              OPEN DATE
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-700">
                              {formatDate(jar.openAt)}
                            </p>
                          </div>


                        </div>

                        {/* 하단 진행 바 */}
                        <div className="mt-5">
                          <div className="mb-2 flex items-center justify-between text-[11px] font-bold">
                            <span className="text-slate-500">오픈까지 진행 느낌</span>
                            <span className="text-slate-700">{ddayText}</span>
                          </div>

                          <div className="h-2.5 overflow-hidden rounded-full bg-white/85 shadow-inner">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${palette.progress} transition-all duration-500`}
                              style={{ width: `${progressWidth}%` }}
                            />
                          </div>
                        </div>

                        {/* 모바일에서는 아래쪽에 들어가기 문구 한 번 더 보여주기 */}
                        <div className="mt-4 md:hidden">
                          <span className={`inline-flex rounded-2xl border px-4 py-2 text-sm font-bold ${palette.outline}`}>
                            상세 보기 →
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* 페이지 이동 버튼 */}
        {!loading && totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={() => loadJars(page - 1)}
              disabled={page === 0}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              이전
            </button>

            <span className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm">
              {page + 1} / {totalPages}
            </span>

            <button
              onClick={() => loadJars(page + 1)}
              disabled={page + 1 >= totalPages}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}