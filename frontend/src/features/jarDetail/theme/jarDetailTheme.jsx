import SandIcon from "../../../components/icons/SandIcon";
import LavenderIcon from "../../../components/icons/LavenderIcon";
import MoonlightIcon from "../../../components/icons/MoonlightIcon";
import DewIcon from "../../../components/icons/DewIcon";
import SpringIcon from "../../../components/icons/SpringIcon";
import SummerIcon from "../../../components/icons/SummerIcon";
import AutumnIcon from "../../../components/icons/AutumnIcon";
import WinterIcon from "../../../components/icons/WinterIcon";

import SpringParticleIcon from "../../../components/icons/SpringParticleIcon";
import SummerParticleIcon from "../../../components/icons/SummerParticleIcon";
import AutumnParticleIcon from "../../../components/icons/AutumnParticleIcon";
import WinterParticleIcon from "../../../components/icons/WinterParticleIcon";
import LavenderParticleIcon from "../../../components/icons/LavenderParticleIcon";
import DewParticleIcon from "../../../components/icons/DewParticleIcon";
import SandParticleIcon from "../../../components/icons/SandParticleIcon";
import MoonlightParticleIcon from "../../../components/icons/MoonlightParticleIcon";

import SpringPageDecorationIcon from "../../../components/decoration/SpringPageDecorationIcon";
import SummerPageDecorationIcon from "../../../components/decoration/SummerPageDecorationIcon";
import AutumnPageDecorationIcon from "../../../components/decoration/AutumnPageDecorationIcon";
import WinterPageDecorationIcon from "../../../components/decoration/WinterPageDecorationIcon";
import LavenderPageDecorationIcon from "../../../components/decoration/LavenderPageDecorationIcon";
import DewPageDecorationIcon from "../../../components/decoration/DewPageDecorationIcon";
import SandPageDecorationIcon from "../../../components/decoration/SandPageDecorationIcon";
import MoonlightPageDecorationIcon from "../../../components/decoration/MoonlightPageDecorationIcon";
/*
 * getThemeIcon 역할
 *
 * 저금통 상세 페이지 중앙에 보여줄 대표 SVG 아이콘을 골라주는 함수야.
 *
 * 쉽게 말하면:
 * - 봄이면 SpringIcon
 * - 여름이면 SummerIcon
 * - 가을이면 AutumnIcon
 * - 겨울이면 WinterIcon
 * 처럼 우리가 직접 만든 둥근 아이콘을 보여준다.
 */
export function getThemeIcon(theme, size = 64) {
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

  // LAVENDER 또는 CUSTOM 기본값
  return <LavenderIcon size={size} />;
}

/*
 * getThemePageDecorationIcon 역할
 *
 * 저금통 상세 페이지 바깥 배경에 보여줄
 * 테마별 귀여운 SVG 장식 컴포넌트를 골라주는 함수다.
 *
 * getThemeIcon과 다른 점:
 * - getThemeIcon은 저금통 중앙 대표 아이콘을 반환한다.
 * - getThemePageDecorationIcon은 페이지 바깥 배경 장식용 컴포넌트를 반환한다.
 */
export function getThemePageDecorationIcon(theme) {
  if (theme === "SPRING") {
    return SpringPageDecorationIcon;
  }

  if (theme === "SUMMER") {
    return SummerPageDecorationIcon;
  }

  if (theme === "AUTUMN") {
    return AutumnPageDecorationIcon;
  }

  if (theme === "WINTER") {
    return WinterPageDecorationIcon;
  }

  if (theme === "DEW") {
    return DewPageDecorationIcon;
  }

  if (theme === "SAND") {
    return SandPageDecorationIcon;
  }

  if (theme === "MOONLIGHT") {
    return MoonlightPageDecorationIcon;
  }

  // LAVENDER 또는 CUSTOM 기본값
  return LavenderPageDecorationIcon;
}

// 저금통 종류(theme)에 따라 큰 카드 + 아래 멤버/초대 카드 색까지 같이 정해줘.
export function getThemePalette(theme) {
  // 봄 테마
  if (theme === "SPRING") {
    return {
      /*
       * 봄 테마 페이지 배경
       *
       * 역할:
       * - 화면 바깥을 연한 벚꽃/복숭아빛으로 바꿔서 봄 분위기를 만든다.
       * - 카드 안쪽은 그대로 밝게 두고, 바깥 배경만 은은하게 바꾼다.
       */
      pageBg:
        "bg-[linear-gradient(180deg,#FFF7FA_0%,#FFF1F5_42%,#FFF9F1_100%)]",

      /*
       * 봄 테마 외곽 장식
       *
       * 역할:
       * - 분홍빛과 살구빛 블러로 벚꽃이 퍼지는 느낌을 준다.
       */
      pageGlowPrimary: "bg-rose-300/35",
      pageGlowSecondary: "bg-pink-300/30",
      pageGlowSoft: "bg-orange-200/25",

      /*
       * 봄 테마 작은 장식
       *
       * 역할:
       * - 흰 별보다 분홍빛 점이 더 잘 보여서 벚꽃잎처럼 느껴진다.
       */
      pageStar:
        "bg-rose-300/75 shadow-[0_0_14px_rgba(251,113,133,0.55)]",
      pageSparkle: "text-rose-300/70",
      hero: "from-rose-100 via-pink-50 to-orange-50 border-rose-200",
      badge: "bg-gradient-to-r from-rose-400 to-orange-400 text-white",
      jarBody: "bg-gradient-to-b from-rose-100 via-pink-50 to-white border-rose-200",
      lid: "bg-gradient-to-r from-rose-400 to-orange-400",
      floating: "bg-rose-200/60",
      section: "border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/90",
      softCard: "border-rose-100 bg-white/80",
      emptyBox: "border-rose-200 bg-rose-50/60 text-rose-600",
      countChip: "bg-rose-100 text-rose-700",
      activeChip: "bg-orange-100 text-orange-700",
      input: "border-rose-200 bg-white/90 text-slate-700 focus:border-rose-300",
      primaryButton: "bg-gradient-to-r from-rose-400 to-orange-400 text-white",
      outlineButton: "border-rose-200 bg-white/85 text-rose-700 hover:bg-rose-50",
      avatar: "bg-gradient-to-br from-rose-200 to-orange-200 text-slate-700",
      panel: "border-rose-200/70 bg-white/78",
      panelSoft: "border-rose-100 bg-white/70",
      infoBox: "border-rose-100/80 bg-rose-50/55",
      outlineBtn: "border-rose-200 bg-white/80 text-rose-700 hover:bg-rose-50",
      dangerBtn: "bg-gradient-to-r from-rose-500 to-orange-500 text-white",
      hintBox: "border-rose-200/80 bg-white/65 text-rose-700",
      // 커플 저금통 전용 초대 카드 색
      inviteCard:
        "border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-white/92 to-orange-50/85",
      inviteInfoBox:
        "border-rose-200/80 bg-white/88",
      inviteStatusActive:
        "bg-rose-100 text-rose-700",
      inviteStatusUsed:
        "bg-orange-100 text-orange-700",
      inviteStatusRevoked:
        "bg-slate-200 text-slate-700",
      inviteStatusExpired:
        "bg-amber-100 text-amber-700",
    };
  }

  // 겨울 테마
  if (theme === "WINTER") {
    return {
      /*
       * 겨울 테마 페이지 배경
       *
       * 역할:
       * - 화면 바깥을 연한 하늘색/얼음빛으로 바꿔서 차분한 겨울 느낌을 준다.
       */
      pageBg:
        "bg-[linear-gradient(180deg,#F0F9FF_0%,#EFF6FF_45%,#F8FAFC_100%)]",

      /*
       * 겨울 테마 외곽 장식
       *
       * 역할:
       * - 하늘빛과 인디고빛 블러로 눈과 차가운 공기 느낌을 만든다.
       */
      pageGlowPrimary: "bg-sky-300/35",
      pageGlowSecondary: "bg-cyan-300/30",
      pageGlowSoft: "bg-indigo-200/25",

      /*
       * 겨울 테마 작은 장식
       *
       * 역할:
       * - 작은 하늘빛 점으로 눈송이처럼 보이게 한다.
       */
      pageStar:
        "bg-sky-300/75 shadow-[0_0_14px_rgba(125,211,252,0.6)]",
      pageSparkle: "text-sky-300/70",
      hero: "from-sky-100 via-cyan-50 to-indigo-50 border-sky-200",
      badge: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white",
      jarBody: "bg-gradient-to-b from-sky-100 via-cyan-50 to-white border-sky-200",
      lid: "bg-gradient-to-r from-sky-500 to-indigo-500",
      floating: "bg-sky-200/60",
      section: "border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-indigo-50/90",
      softCard: "border-sky-100 bg-white/80",
      emptyBox: "border-sky-200 bg-sky-50/60 text-sky-700",
      countChip: "bg-sky-100 text-sky-700",
      activeChip: "bg-indigo-100 text-indigo-700",
      input: "border-sky-200 bg-white/90 text-slate-700 focus:border-sky-300",
      primaryButton: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white",
      outlineButton: "border-sky-200 bg-white/85 text-sky-700 hover:bg-sky-50",
      avatar: "bg-gradient-to-br from-sky-200 to-indigo-200 text-slate-700",
      panel: "border-sky-200/70 bg-white/78",
      panelSoft: "border-sky-100 bg-white/70",
      infoBox: "border-sky-100/80 bg-sky-50/55",
      outlineBtn: "border-sky-200 bg-white/80 text-sky-700 hover:bg-sky-50",
      dangerBtn: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white",
      hintBox: "border-sky-200/80 bg-white/65 text-sky-700",
      // 친구 저금통 전용 초대 카드 색
      inviteCard:
        "border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white/92 to-indigo-50/85",
      inviteInfoBox:
        "border-sky-200/80 bg-white/88",
      inviteStatusActive:
        "bg-sky-100 text-sky-700",
      inviteStatusUsed:
        "bg-indigo-100 text-indigo-700",
      inviteStatusRevoked:
        "bg-slate-200 text-slate-700",
      inviteStatusExpired:
        "bg-amber-100 text-amber-700",
    };
  }

  // 여름 테마
  if (theme === "SUMMER") {
    return {
      /*
       * 여름 테마 페이지 배경
       *
       * 역할:
       * - 화면 바깥을 연한 초록/라임빛으로 바꿔서 싱그러운 여름 느낌을 준다.
       */
      pageBg:
        "bg-[linear-gradient(180deg,#F3FFF8_0%,#ECFDF3_45%,#FFFBEB_100%)]",

      /*
       * 여름 테마 외곽 장식
       *
       * 역할:
       * - 초록빛과 라임빛 블러로 햇살과 잎사귀 느낌을 만든다.
       */
      pageGlowPrimary: "bg-emerald-300/35",
      pageGlowSecondary: "bg-lime-300/30",
      pageGlowSoft: "bg-yellow-200/25",

      /*
       * 여름 테마 작은 장식
       *
       * 역할:
       * - 작은 초록빛 점과 반짝이로 잎사귀/햇살 같은 느낌을 준다.
       */
      pageStar:
        "bg-emerald-300/75 shadow-[0_0_14px_rgba(52,211,153,0.55)]",
      pageSparkle: "text-emerald-300/70",
      hero: "from-emerald-100 via-lime-50 to-amber-50 border-emerald-200",
      badge: "bg-gradient-to-r from-emerald-500 to-lime-500 text-white",
      jarBody: "bg-gradient-to-b from-emerald-100 via-lime-50 to-white border-emerald-200",
      lid: "bg-gradient-to-r from-emerald-500 to-lime-500",
      floating: "bg-emerald-200/60",
      section: "border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-lime-50/90",
      softCard: "border-emerald-100 bg-white/80",
      emptyBox: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
      countChip: "bg-emerald-100 text-emerald-700",
      activeChip: "bg-lime-100 text-lime-700",
      input: "border-emerald-200 bg-white/90 text-slate-700 focus:border-emerald-300",
      primaryButton: "bg-gradient-to-r from-emerald-500 to-lime-500 text-white",
      outlineButton: "border-emerald-200 bg-white/85 text-emerald-700 hover:bg-emerald-50",
      avatar: "bg-gradient-to-br from-emerald-200 to-lime-200 text-slate-700",
      panel: "border-emerald-200/70 bg-white/78",
      panelSoft: "border-emerald-100 bg-white/70",
      infoBox: "border-emerald-100/80 bg-emerald-50/55",
      outlineBtn: "border-emerald-200 bg-white/80 text-emerald-700 hover:bg-emerald-50",
      dangerBtn: "bg-gradient-to-r from-emerald-500 to-lime-500 text-white",
      hintBox: "border-emerald-200/80 bg-white/65 text-emerald-700",
      // 가족 저금통 전용 초대 카드 색
      inviteCard:
        "border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white/92 to-lime-50/85",
      inviteInfoBox:
        "border-emerald-200/80 bg-white/88",
      inviteStatusActive:
        "bg-emerald-100 text-emerald-700",
      inviteStatusUsed:
        "bg-lime-100 text-lime-700",
      inviteStatusRevoked:
        "bg-slate-200 text-slate-700",
      inviteStatusExpired:
        "bg-amber-100 text-amber-700",
    };
  }

  // 가을 테마: 노을빛 단풍, 주황/분홍 느낌
  if (theme === "AUTUMN") {
    return {
      /*
       * 가을 테마 페이지 배경
       *
       * 역할:
       * - 화면 바깥을 연한 노을/단풍빛으로 바꿔서 따뜻한 가을 분위기를 만든다.
       */
      pageBg:
        "bg-[linear-gradient(180deg,#FFF7ED_0%,#FFFBEB_45%,#FFF1F2_100%)]",

      /*
       * 가을 테마 외곽 장식
       *
       * 역할:
       * - 주황빛과 장미빛 블러로 노을이 번지는 느낌을 준다.
       */
      pageGlowPrimary: "bg-orange-300/35",
      pageGlowSecondary: "bg-amber-300/30",
      pageGlowSoft: "bg-rose-200/25",

      /*
       * 가을 테마 작은 장식
       *
       * 역할:
       * - 작은 주황빛 점으로 단풍잎/노을 입자 같은 느낌을 준다.
       */
      pageStar:
        "bg-orange-300/75 shadow-[0_0_14px_rgba(251,146,60,0.55)]",
      pageSparkle: "text-orange-300/70",
      hero: "from-orange-100 via-amber-50 to-rose-50 border-orange-200",
      badge: "bg-gradient-to-r from-orange-500 to-rose-400 text-white",
      jarBody: "bg-gradient-to-b from-orange-100 via-amber-50 to-white border-orange-200",
      lid: "bg-gradient-to-r from-orange-500 to-rose-400",
      floating: "bg-orange-200/60",
      section:
        "border-orange-200/70 bg-gradient-to-br from-orange-50/95 via-white to-rose-50/90",
      softCard: "border-orange-100 bg-white/80",
      emptyBox: "border-orange-200 bg-orange-50/60 text-orange-700",
      countChip: "bg-orange-100 text-orange-700",
      activeChip: "bg-rose-100 text-rose-700",
      input:
        "border-orange-200 bg-white/90 text-slate-700 focus:border-orange-300",
      primaryButton: "bg-gradient-to-r from-orange-500 to-rose-400 text-white",
      outlineButton:
        "border-orange-200 bg-white/85 text-orange-700 hover:bg-orange-50",
      avatar: "bg-gradient-to-br from-orange-200 to-rose-200 text-slate-700",
      panel: "border-orange-200/70 bg-white/78",
      panelSoft: "border-orange-100 bg-white/70",
      infoBox: "border-orange-100/80 bg-orange-50/55",
      outlineBtn:
        "border-orange-200 bg-white/80 text-orange-700 hover:bg-orange-50",
      dangerBtn: "bg-gradient-to-r from-orange-500 to-rose-500 text-white",
      hintBox: "border-orange-200/80 bg-white/65 text-orange-700",

      inviteCard:
        "border-orange-200/80 bg-gradient-to-br from-orange-50/90 via-white/92 to-rose-50/85",
      inviteInfoBox: "border-orange-200/80 bg-white/88",
      inviteStatusActive: "bg-orange-100 text-orange-700",
      inviteStatusUsed: "bg-rose-100 text-rose-700",
      inviteStatusRevoked: "bg-slate-200 text-slate-700",
      inviteStatusExpired: "bg-amber-100 text-amber-700",
    };
  }

  // 이슬 테마: 아침 물방울, 민트/연하늘 느낌
  if (theme === "DEW") {
    return {
      /*
       * 이슬 테마 페이지 배경
       *
       * 역할:
       * - 화면 바깥을 연한 민트/하늘빛으로 바꿔서 아침 이슬 분위기를 만든다.
       */
      pageBg:
        "bg-[linear-gradient(180deg,#ECFEFF_0%,#F0FDFA_45%,#F0F9FF_100%)]",

      /*
       * 이슬 테마 외곽 장식
       *
       * 역할:
       * - 민트빛과 하늘빛 블러로 물방울이 맺힌 듯한 느낌을 준다.
       */
      pageGlowPrimary: "bg-teal-300/35",
      pageGlowSecondary: "bg-cyan-300/30",
      pageGlowSoft: "bg-sky-200/25",

      /*
       * 이슬 테마 작은 장식
       *
       * 역할:
       * - 작은 청록빛 점으로 물방울 반짝임처럼 보이게 한다.
       */
      pageStar:
        "bg-teal-300/75 shadow-[0_0_14px_rgba(45,212,191,0.55)]",
      pageSparkle: "text-teal-300/70",
      hero: "from-cyan-100 via-teal-50 to-sky-50 border-teal-200",
      badge: "bg-gradient-to-r from-teal-400 to-sky-400 text-white",
      jarBody: "bg-gradient-to-b from-cyan-100 via-teal-50 to-white border-teal-200",
      lid: "bg-gradient-to-r from-teal-400 to-sky-400",
      floating: "bg-teal-200/60",
      section:
        "border-teal-200/70 bg-gradient-to-br from-cyan-50/95 via-white to-sky-50/90",
      softCard: "border-teal-100 bg-white/80",
      emptyBox: "border-teal-200 bg-teal-50/60 text-teal-700",
      countChip: "bg-teal-100 text-teal-700",
      activeChip: "bg-sky-100 text-sky-700",
      input:
        "border-teal-200 bg-white/90 text-slate-700 focus:border-teal-300",
      primaryButton: "bg-gradient-to-r from-teal-400 to-sky-400 text-white",
      outlineButton:
        "border-teal-200 bg-white/85 text-teal-700 hover:bg-teal-50",
      avatar: "bg-gradient-to-br from-teal-200 to-sky-200 text-slate-700",
      panel: "border-teal-200/70 bg-white/78",
      panelSoft: "border-teal-100 bg-white/70",
      infoBox: "border-teal-100/80 bg-teal-50/55",
      outlineBtn:
        "border-teal-200 bg-white/80 text-teal-700 hover:bg-teal-50",
      dangerBtn: "bg-gradient-to-r from-teal-500 to-sky-500 text-white",
      hintBox: "border-teal-200/80 bg-white/65 text-teal-700",

      inviteCard:
        "border-teal-200/80 bg-gradient-to-br from-cyan-50/90 via-white/92 to-sky-50/85",
      inviteInfoBox: "border-teal-200/80 bg-white/88",
      inviteStatusActive: "bg-teal-100 text-teal-700",
      inviteStatusUsed: "bg-sky-100 text-sky-700",
      inviteStatusRevoked: "bg-slate-200 text-slate-700",
      inviteStatusExpired: "bg-amber-100 text-amber-700",
    };
  }

  // 모래 테마: 해변 모래, 베이지/브라운 느낌
  if (theme === "SAND") {
    return {
      /*
       * 모래 테마 페이지 배경
       *
       * 역할:
       * - 화면 바깥을 연한 베이지/모래빛으로 바꿔서 따뜻한 해변 분위기를 만든다.
       */
      pageBg:
        "bg-[linear-gradient(180deg,#FFFBEB_0%,#FEF3C7_38%,#FFF7ED_100%)]",

      /*
       * 모래 테마 외곽 장식
       *
       * 역할:
       * - 베이지빛과 주황빛 블러로 햇살이 비치는 모래 느낌을 준다.
       */
      pageGlowPrimary: "bg-amber-300/35",
      pageGlowSecondary: "bg-yellow-300/30",
      pageGlowSoft: "bg-orange-200/25",

      /*
       * 모래 테마 작은 장식
       *
       * 역할:
       * - 작은 황금빛 점으로 모래알이 반짝이는 느낌을 준다.
       */
      pageStar:
        "bg-amber-300/75 shadow-[0_0_14px_rgba(252,211,77,0.6)]",
      pageSparkle: "text-amber-300/70",
      hero: "from-amber-100 via-yellow-50 to-orange-50 border-amber-200",
      badge: "bg-gradient-to-r from-amber-500 to-orange-400 text-white",
      jarBody: "bg-gradient-to-b from-amber-100 via-yellow-50 to-white border-amber-200",
      lid: "bg-gradient-to-r from-amber-500 to-orange-400",
      floating: "bg-amber-200/60",
      section:
        "border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-orange-50/90",
      softCard: "border-amber-100 bg-white/80",
      emptyBox: "border-amber-200 bg-amber-50/60 text-amber-800",
      countChip: "bg-amber-100 text-amber-800",
      activeChip: "bg-orange-100 text-orange-700",
      input:
        "border-amber-200 bg-white/90 text-slate-700 focus:border-amber-300",
      primaryButton: "bg-gradient-to-r from-amber-500 to-orange-400 text-white",
      outlineButton:
        "border-amber-200 bg-white/85 text-amber-800 hover:bg-amber-50",
      avatar: "bg-gradient-to-br from-amber-200 to-orange-200 text-slate-700",
      panel: "border-amber-200/70 bg-white/78",
      panelSoft: "border-amber-100 bg-white/70",
      infoBox: "border-amber-100/80 bg-amber-50/55",
      outlineBtn:
        "border-amber-200 bg-white/80 text-amber-800 hover:bg-amber-50",
      dangerBtn: "bg-gradient-to-r from-amber-600 to-orange-500 text-white",
      hintBox: "border-amber-200/80 bg-white/65 text-amber-800",

      inviteCard:
        "border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white/92 to-orange-50/85",
      inviteInfoBox: "border-amber-200/80 bg-white/88",
      inviteStatusActive: "bg-amber-100 text-amber-800",
      inviteStatusUsed: "bg-orange-100 text-orange-700",
      inviteStatusRevoked: "bg-slate-200 text-slate-700",
      inviteStatusExpired: "bg-yellow-100 text-yellow-700",
    };
  }

  // 달빛 테마: 밤하늘, 남색/은빛 느낌
  if (theme === "MOONLIGHT") {
    return {
      /*
       * 페이지 전체 배경
       *
       * 역할:
       * - 저금통 카드 안쪽이 아니라, 화면 바깥 전체 배경에 들어갈 색감이다.
       * - 달빛 테마는 너무 어둡게 가지 않고, 연한 라벤더 + 블루그레이 느낌으로 잡는다.
       */
      pageBg:
        "bg-[linear-gradient(180deg,#F8F7FF_0%,#F2F5FF_45%,#FBFCFF_100%)]",

      /*
       * 페이지 외곽 장식용 빛
       *
       * 역할:
       * - 화면 상단/외곽에 흐릿한 달빛 느낌을 주기 위한 색이다.
       * - 실제 내용 영역을 방해하지 않도록 opacity가 낮은 색만 사용한다.
       */
      pageGlowPrimary: "bg-indigo-300/45",
      pageGlowSecondary: "bg-violet-300/40",
      pageGlowSoft: "bg-sky-200/35",

      /*
       * 작은 별 점 장식 색
       *
       * 역할:
       * - 달빛 테마에서 상단 주변에 아주 작은 별빛을 표현한다.
       */
      pageStar:
        "bg-indigo-300/80 shadow-[0_0_14px_rgba(129,140,248,0.75)]",
      pageSparkle: "text-indigo-300/70",
      hero: "from-indigo-100 via-slate-50 to-violet-50 border-indigo-200",
      badge: "bg-gradient-to-r from-indigo-700 to-slate-500 text-white",
      jarBody: "bg-gradient-to-b from-indigo-100 via-slate-50 to-white border-indigo-200",
      lid: "bg-gradient-to-r from-indigo-700 to-slate-500",
      floating: "bg-indigo-200/60",
      section:
        "border-indigo-200/70 bg-gradient-to-br from-indigo-50/95 via-white to-slate-50/90",
      softCard: "border-indigo-100 bg-white/80",
      emptyBox: "border-indigo-200 bg-indigo-50/60 text-indigo-700",
      countChip: "bg-indigo-100 text-indigo-700",
      activeChip: "bg-slate-100 text-slate-700",
      input:
        "border-indigo-200 bg-white/90 text-slate-700 focus:border-indigo-300",
      primaryButton: "bg-gradient-to-r from-indigo-700 to-slate-500 text-white",
      outlineButton:
        "border-indigo-200 bg-white/85 text-indigo-700 hover:bg-indigo-50",
      avatar: "bg-gradient-to-br from-indigo-200 to-slate-200 text-slate-700",
      panel: "border-indigo-200/70 bg-white/78",
      panelSoft: "border-indigo-100 bg-white/70",
      infoBox: "border-indigo-100/80 bg-indigo-50/55",
      outlineBtn:
        "border-indigo-200 bg-white/80 text-indigo-700 hover:bg-indigo-50",
      dangerBtn: "bg-gradient-to-r from-indigo-700 to-slate-600 text-white",
      hintBox: "border-indigo-200/80 bg-white/65 text-indigo-700",

      inviteCard:
        "border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white/92 to-slate-50/85",
      inviteInfoBox: "border-indigo-200/80 bg-white/88",
      inviteStatusActive: "bg-indigo-100 text-indigo-700",
      inviteStatusUsed: "bg-slate-100 text-slate-700",
      inviteStatusRevoked: "bg-slate-200 text-slate-700",
      inviteStatusExpired: "bg-amber-100 text-amber-700",
    };
  }

  // 라벤더 테마
  // 새 값 LAVENDER와 예전 값 CUSTOM은 여기 기본 보라색 스타일을 사용한다.
  return {
    /*
     * 라벤더 테마 페이지 배경
     *
     * 역할:
     * - 화면 바깥을 연한 보라/핑크빛으로 바꿔서 부드러운 라벤더 분위기를 만든다.
     */
    pageBg:
      "bg-[linear-gradient(180deg,#FAF5FF_0%,#F5F3FF_45%,#FDF2F8_100%)]",

    /*
     * 라벤더 테마 외곽 장식
     *
     * 역할:
     * - 보라빛과 분홍빛 블러로 향기처럼 퍼지는 느낌을 준다.
     */
    pageGlowPrimary: "bg-violet-300/35",
    pageGlowSecondary: "bg-fuchsia-300/30",
    pageGlowSoft: "bg-pink-200/25",

    /*
     * 라벤더 테마 작은 장식
     *
     * 역할:
     * - 작은 보라빛 점으로 라벤더 꽃잎 같은 느낌을 준다.
     */
    pageStar:
      "bg-violet-300/75 shadow-[0_0_14px_rgba(167,139,250,0.6)]",
    pageSparkle: "text-violet-300/70",
    hero: "from-violet-100 via-fuchsia-50 to-pink-50 border-violet-200",
    badge: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
    jarBody: "bg-gradient-to-b from-violet-100 via-fuchsia-50 to-white border-violet-200",
    lid: "bg-gradient-to-r from-violet-500 to-fuchsia-500",
    floating: "bg-violet-200/60",
    section: "border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/90",
    softCard: "border-violet-100 bg-white/80",
    emptyBox: "border-violet-200 bg-violet-50/60 text-violet-700",
    countChip: "bg-violet-100 text-violet-700",
    activeChip: "bg-fuchsia-100 text-fuchsia-700",
    input: "border-violet-200 bg-white/90 text-slate-700 focus:border-violet-300",
    primaryButton: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
    outlineButton: "border-violet-200 bg-white/85 text-violet-700 hover:bg-violet-50",
    avatar: "bg-gradient-to-br from-violet-200 to-fuchsia-200 text-slate-700",
    panel: "border-violet-200/70 bg-white/78",
    panelSoft: "border-violet-100 bg-white/70",
    infoBox: "border-violet-100/80 bg-violet-50/55",
    outlineBtn: "border-violet-200 bg-white/80 text-violet-700 hover:bg-violet-50",
    dangerBtn: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
    hintBox: "border-violet-200/80 bg-white/65 text-violet-700",
    // 커스텀 저금통 전용 초대 카드 색
    inviteCard:
      "border-violet-200/80 bg-gradient-to-br from-violet-50/90 via-white/92 to-fuchsia-50/85",
    inviteInfoBox:
      "border-violet-200/80 bg-white/88",
    inviteStatusActive:
      "bg-violet-100 text-violet-700",
    inviteStatusUsed:
      "bg-fuchsia-100 text-fuchsia-700",
    inviteStatusRevoked:
      "bg-slate-200 text-slate-700",
    inviteStatusExpired:
      "bg-amber-100 text-amber-700",
  };
}

/*
* getJarSnowballTheme 역할
*
* 저금통 상세 화면에서 저금통 안에 떨어질 파티클을 골라주는 함수야.
*
* 대표 아이콘은 둥근 SVG 아이콘을 쓰고,
* 저금통 안쪽 파티클은 실제 오브젝트 SVG를 쓴다.
 */
export function getJarSnowballTheme(theme) {
     if (theme === "SPRING") {
       return {
         label: "벚꽃",
         icons: [
           {
             type: "custom",
             render: (size) => <SpringParticleIcon variant="petal" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SpringParticleIcon variant="flower" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SpringParticleIcon variant="heart" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SpringParticleIcon variant="sparkle" size={size} />,
           },
         ],
         count: 8,
       };
     }

     if (theme === "SUMMER") {
       return {
         label: "여름",
         icons: [
           {
             type: "custom",
             render: (size) => <SummerParticleIcon variant="leaf" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SummerParticleIcon variant="sun" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SummerParticleIcon variant="grass" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SummerParticleIcon variant="sparkle" size={size} />,
           },
         ],
         count: 8,
       };
     }

     if (theme === "AUTUMN") {
       return {
         label: "가을",
         icons: [
           {
             type: "custom",
             render: (size) => <AutumnParticleIcon variant="maple" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <AutumnParticleIcon variant="leaf" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <AutumnParticleIcon variant="chestnut" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <AutumnParticleIcon variant="sparkle" size={size} />,
           },
         ],
         count: 8,
       };
     }

     if (theme === "WINTER") {
       return {
         label: "눈",
         icons: [
           {
             type: "custom",
             render: (size) => <WinterParticleIcon variant="snowflake" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <WinterParticleIcon variant="ice" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <WinterParticleIcon variant="snowball" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <WinterParticleIcon variant="sparkle" size={size} />,
           },
         ],
         count: 10,
       };
     }

     if (theme === "DEW") {
       return {
         label: "이슬",
         icons: [
           {
             type: "custom",
             render: (size) => <DewParticleIcon variant="drop" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <DewParticleIcon variant="bubble" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <DewParticleIcon variant="leaf" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <DewParticleIcon variant="sparkle" size={size} />,
           },
         ],
         count: 8,
       };
     }

     if (theme === "SAND") {
       return {
         label: "모래",
         icons: [
           {
             type: "custom",
             render: (size) => <SandParticleIcon variant="shell" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SandParticleIcon variant="grain" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SandParticleIcon variant="starfish" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <SandParticleIcon variant="sparkle" size={size} />,
           },
         ],
         count: 8,
       };
     }

     if (theme === "MOONLIGHT") {
       return {
         label: "달빛",
         icons: [
           {
             type: "custom",
             render: (size) => <MoonlightParticleIcon variant="moon" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <MoonlightParticleIcon variant="star" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <MoonlightParticleIcon variant="cloud" size={size} />,
           },
           {
             type: "custom",
             render: (size) => <MoonlightParticleIcon variant="sparkle" size={size} />,
           },
         ],
         count: 8,
       };
     }

     // LAVENDER 또는 CUSTOM 기본값
     return {
       label: "라벤더",
       icons: [
         {
           type: "custom",
           render: (size) => <LavenderParticleIcon variant="lavender" size={size} />,
         },
         {
           type: "custom",
           render: (size) => <LavenderParticleIcon variant="petal" size={size} />,
         },
         {
           type: "custom",
           render: (size) => <LavenderParticleIcon variant="sparkle" size={size} />,
         },
       ],
       count: 8,
     };
   }

/*
 * createJarSnowballParticles 역할
 *
 * 저금통 안에서 자연스럽게 흩날릴 작은 장식들을 만들어줘.
 *
 * 이번 버전의 핵심:
 * - 한 번에 많이 만들지 않는다.
 * - 2~3개씩 조금씩 만든다.
 * - 각 장식은 자기 시간이 끝나면 따로 사라진다.
 *
 * 쉽게 말하면:
 * 눈이 한 번에 우르르 내리는 게 아니라,
 * 계속 조금씩 살살 내리게 만드는 함수야.
 */
export function createJarSnowballParticles(theme, count = 2) {
  const snowballTheme = getJarSnowballTheme(theme);

  return Array.from({ length: count }, (_, index) => {
    const icon =
      snowballTheme.icons[
        Math.floor(Math.random() * snowballTheme.icons.length)
      ];

    const duration = 3.2 + Math.random() * 1.4;
    const delay = Math.random() * 0.35;

    return {
      id: `${Date.now()}-${index}-${Math.random()}`,
      icon,

      // 저금통 몸통 안쪽 위에서 시작
      left: 20 + Math.random() * 60,
      top: 6 + Math.random() * 18,

      // 상세 페이지도 생성 화면처럼 SVG 파티클이 잘 보이도록 살짝 크게
      size: 20 + Math.random() * 8,

      // 좌우로 살짝 흔들리면서 내려감
      fallX: -28 + Math.random() * 56,
      fallY: 115 + Math.random() * 70,

      rotate: -100 + Math.random() * 200,

      duration,
      delay,
      lifetime: duration + delay + 0.35,
    };
  });
}