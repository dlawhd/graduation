import { useEffect, useMemo, useState, useRef } from "react";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import apiClient, { fetchCsrf } from "../api/apiClient";
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
import {
  ONBOARDING_TUTORIAL_KEY,
} from "../api/onboardingApi";
import TutorialSpotlight from "../features/onboarding/components/TutorialSpotlight";
import useOnboarding from "../features/onboarding/hooks/useOnboarding";
import {
  JAR_CREATE_TUTORIAL_STEPS,
  JAR_CREATE_TUTORIAL_TARGET,
} from "../features/onboarding/constants/jarCreateTutorialSteps";
import {
  ONBOARDING_REPLAY_STATE_KEY,
} from "../features/onboarding/constants/onboardingReplay";

// ==============================
// 화면에 보여줄 한글 라벨
// ==============================
// 백엔드 JarTheme enum 값과 프론트 한글 이름을 연결하는 역할이야.
// 예: 서버에는 "SPRING"으로 보내고, 화면에는 "봄"이라고 보여준다.
const THEME_LABEL = {
  // 봄 테마: 벚꽃, 분홍 느낌
  SPRING: "봄",

  // 여름 테마: 햇살, 잎, 초록 느낌
  SUMMER: "여름",

  // 가을 테마: 노을빛 단풍, 주황/분홍 느낌
  AUTUMN: "가을",

  // 겨울 테마: 눈, 파랑/하양 느낌
  WINTER: "겨울",

  // 라벤더 테마: 보라빛 꽃밭 느낌
  LAVENDER: "라벤더",

  // 이슬 테마: 아침 물방울, 민트/연하늘 느낌
  DEW: "이슬",

  // 모래 테마: 해변/사막, 베이지 느낌
  SAND: "모래",

  // 달빛 테마: 밤하늘, 남색/은색 느낌
  MOONLIGHT: "달빛",
};

// ==============================
// 8가지 저금통 템플릿
// ==============================
// 화면 배치 순서:
// 봄        여름
// 가을      겨울
// 라벤더    이슬
// 모래      달빛
const JAR_TEMPLATES = [
  {
    id: 1,
    type: "SPRING",
    emoji: <SpringIcon size={64} />,
    title: "봄 저금통",
    summary: "벚꽃처럼 따뜻한 추억을 담아요.",
    previewTitle: "우리의 봄 저금통",
    previewDesc: "함께한 소중한 순간을 벚꽃처럼 하나씩 모아둘래요.",
    values: {
      name: "우리의 봄 저금통",
      description: "함께한 소중한 순간을 벚꽃처럼 하나씩 모아둘래요.",
      theme: "SPRING",
      maxMembers: 2,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "TITLE_ONLY",
    },
  },
  {
    id: 2,
    type: "SUMMER",
    emoji: <SummerIcon size={64} />,
    title: "여름 저금통",
    summary: "햇살과 잎처럼 싱그러운 추억을 기록해요.",
    previewTitle: "여름빛 추억 저금통",
    previewDesc: "햇살 아래 반짝이는 초록빛 순간들을 담아봐요.",
    values: {
      name: "여름빛 추억 저금통",
      description: "햇살 아래 반짝이는 초록빛 순간들을 담아봐요.",
      theme: "SUMMER",
      maxMembers: 5,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "HIDDEN",
    },
  },
  {
    id: 3,
    type: "AUTUMN",
    emoji: <AutumnIcon size={64} />,
    title: "가을 저금통",
    summary: "노을빛 단풍처럼 따뜻한 순간을 모아요.",
    previewTitle: "가을빛 단풍 저금통",
    previewDesc: "주황빛과 분홍빛이 섞인 따뜻한 기억을 차곡차곡 담아봐요.",
    values: {
      name: "가을빛 단풍 저금통",
      description: "주황빛과 분홍빛이 섞인 따뜻한 기억을 차곡차곡 담아봐요.",
      theme: "AUTUMN",
      maxMembers: 4,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "TITLE_ONLY",
    },
  },
  {
    id: 4,
    type: "WINTER",
    emoji: <WinterIcon size={64} />,
    title: "겨울 저금통",
    summary: "눈처럼 반짝이는 추억을 모아요.",
    previewTitle: "겨울눈 추억 저금통",
    previewDesc: "하얀 눈처럼 조용하고 반짝이는 이야기를 남겨봐요.",
    values: {
      name: "겨울눈 추억 저금통",
      description: "하얀 눈처럼 조용하고 반짝이는 이야기를 남겨봐요.",
      theme: "WINTER",
      maxMembers: 4,
      openAt: "",
      openMode: "DAILY_DRAW",
      lockLevel: "META_ONLY",
    },
  },
  {
    id: 5,
    type: "LAVENDER",
    emoji: <LavenderIcon size={64} />,
    title: "라벤더 저금통",
    summary: "보라빛 꽃밭처럼 차분한 추억을 담아요.",
    previewTitle: "라벤더 꽃밭 저금통",
    previewDesc: "은은한 보라빛 속에 조용히 간직하고 싶은 마음을 담아봐요.",
    values: {
      name: "라벤더 꽃밭 저금통",
      description: "은은한 보라빛 속에 조용히 간직하고 싶은 마음을 담아봐요.",
      theme: "LAVENDER",
      maxMembers: 2,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "HIDDEN",
    },
  },
  {
    id: 6,
    type: "DEW",
    emoji: <DewIcon size={64} />,
    title: "이슬 저금통",
    summary: "아침 이슬처럼 맑은 순간을 담아요.",
    previewTitle: "맑은 이슬 저금통",
    previewDesc: "투명한 물방울처럼 깨끗하고 소중한 순간들을 모아봐요.",
    values: {
      name: "맑은 이슬 저금통",
      description: "투명한 물방울처럼 깨끗하고 소중한 순간들을 모아봐요.",
      theme: "DEW",
      maxMembers: 4,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "META_ONLY",
    },
  },
  {
    id: 7,
    type: "SAND",
    emoji: <SandIcon size={64} />,
    title: "모래 저금통",
    summary: "모래알처럼 작은 순간들을 소중히 모아요.",
    previewTitle: "따뜻한 모래 저금통",
    previewDesc: "해변의 모래알처럼 반짝이는 기억을 하나씩 담아봐요.",
    values: {
      name: "따뜻한 모래 저금통",
      description: "해변의 모래알처럼 반짝이는 기억을 하나씩 담아봐요.",
      theme: "SAND",
      maxMembers: 4,
      openAt: "",
      openMode: "DAILY_DRAW",
      lockLevel: "META_ONLY",
    },
  },
  {
    id: 8,
    type: "MOONLIGHT",
    emoji: <MoonlightIcon size={64} />,
    title: "달빛 저금통",
    summary: "밤하늘 달빛처럼 은은한 추억을 담아요.",
    previewTitle: "달빛 밤하늘 저금통",
    previewDesc: "남색 밤하늘과 은빛 달빛 아래 조용히 빛나는 추억을 모아봐요.",
    values: {
      name: "달빛 밤하늘 저금통",
      description: "남색 밤하늘과 은빛 달빛 아래 조용히 빛나는 추억을 모아봐요.",
      theme: "MOONLIGHT",
      maxMembers: 2,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "TITLE_ONLY",
    },
  },
];

// ==============================
// datetime-local -> OffsetDateTime 문자열
// ==============================
function toOffsetDateTimeString(localValue) {
  if (!localValue) return "";

  const date = new Date(localValue);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHour = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const offsetMinute = String(absMinutes % 60).padStart(2, "0");

  return `${localValue}:00${sign}${offsetHour}:${offsetMinute}`;
}

// ==============================
// 타입별 색/배경/저금통 스타일
// ==============================
// 저금통 theme 값만 보고 오른쪽 미리보기 카드, 저금통 뚜껑, 몸통 색을 정해주는 함수야.
function getVisualPreset(theme) {
  // 봄 테마: 벚꽃, 분홍
  if (theme === "SPRING") {
    return {
      previewCardStyle: {
        background:
          "linear-gradient(135deg, #fff1f4 0%, #fff7fb 45%, #fff6eb 100%)",
      },
      badgeStyle: {
        backgroundColor: "#ffeff5",
        color: "#e63c74",
      },
      themeBadgeStyle: {
        backgroundColor: "#fff3e8",
        color: "#ff8a3d",
      },
      glowStyle: {
        background:
          "radial-gradient(circle, rgba(255,108,163,0.35) 0%, rgba(255,108,163,0.06) 65%, rgba(255,108,163,0) 100%)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #ff6391 0%, #ffb25e 100%)",
      },
      jarBodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,248,251,0.92) 55%, rgba(255,241,228,0.96) 100%)",
        border: "4px solid rgba(255,255,255,0.8)",
        boxShadow: "0 24px 45px rgba(255, 118, 160, 0.20)",
      },
      labelPillStyle: {
        backgroundColor: "rgba(255,255,255,0.92)",
        color: "#5b5560",
      },
      centerEmoji: <SpringIcon size={64} />,
      decor: [],
      accentLine: "#ff7ea8",
    };
  }

  // 여름 테마: 햇살, 잎, 초록
  if (theme === "SUMMER") {
    return {
      previewCardStyle: {
        background:
          "linear-gradient(135deg, #eefbf5 0%, #f7fff8 45%, #fffceb 100%)",
      },
      badgeStyle: {
        backgroundColor: "#edfdf3",
        color: "#2d9152",
      },
      themeBadgeStyle: {
        backgroundColor: "#fff7e5",
        color: "#f39a2c",
      },
      glowStyle: {
        background:
          "radial-gradient(circle, rgba(127,214,120,0.28) 0%, rgba(127,214,120,0.06) 65%, rgba(127,214,120,0) 100%)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #43d3c0 0%, #b8df3c 100%)",
      },
      jarBodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(242,255,246,0.92) 55%, rgba(255,251,230,0.96) 100%)",
        border: "4px solid rgba(255,255,255,0.8)",
        boxShadow: "0 24px 45px rgba(100, 182, 118, 0.18)",
      },
      labelPillStyle: {
        backgroundColor: "rgba(255,255,255,0.92)",
        color: "#4f5b4e",
      },
      centerEmoji: <SummerIcon size={64} />,
      decor: [],
      accentLine: "#4fc26d",
    };
  }

  // 가을 테마: 노을빛 단풍, 주황/분홍
  if (theme === "AUTUMN") {
    return {
      previewCardStyle: {
        background:
          "linear-gradient(135deg, #fff7ed 0%, #fff1e8 45%, #ffe4e6 100%)",
      },
      badgeStyle: {
        backgroundColor: "#ffedd5",
        color: "#c2410c",
      },
      themeBadgeStyle: {
        backgroundColor: "#ffe4e6",
        color: "#be123c",
      },
      glowStyle: {
        background:
          "radial-gradient(circle, rgba(249,115,22,0.30) 0%, rgba(244,63,94,0.07) 65%, rgba(249,115,22,0) 100%)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #f97316 0%, #fb7185 100%)",
      },
      jarBodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,247,237,0.94) 55%, rgba(255,228,230,0.96) 100%)",
        border: "4px solid rgba(255,255,255,0.8)",
        boxShadow: "0 24px 45px rgba(249, 115, 22, 0.20)",
      },
      labelPillStyle: {
        backgroundColor: "rgba(255,255,255,0.92)",
        color: "#7c2d12",
      },
      centerEmoji: <AutumnIcon size={64} />,
      decor: [],
      accentLine: "#f97316",
    };
  }

  // 겨울 테마: 눈, 파랑/하양
  if (theme === "WINTER") {
    return {
      previewCardStyle: {
        background:
          "linear-gradient(135deg, #effbff 0%, #f4faff 45%, #eef2ff 100%)",
      },
      badgeStyle: {
        backgroundColor: "#ebfbff",
        color: "#1482b8",
      },
      themeBadgeStyle: {
        backgroundColor: "#eff6ff",
        color: "#4c74d9",
      },
      glowStyle: {
        background:
          "radial-gradient(circle, rgba(78,194,255,0.30) 0%, rgba(78,194,255,0.06) 65%, rgba(78,194,255,0) 100%)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #34c7ff 0%, #4f75ff 100%)",
      },
      jarBodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(243,251,255,0.92) 55%, rgba(238,244,255,0.96) 100%)",
        border: "4px solid rgba(255,255,255,0.8)",
        boxShadow: "0 24px 45px rgba(79, 117, 255, 0.18)",
      },
      labelPillStyle: {
        backgroundColor: "rgba(255,255,255,0.92)",
        color: "#4b5f77",
      },
      centerEmoji: <WinterIcon size={64} />,
      decor: [],
      accentLine: "#5cb9ff",
    };
  }

  // 이슬 테마: 아침 물방울, 민트/연하늘
  if (theme === "DEW") {
    return {
      previewCardStyle: {
        background:
          "linear-gradient(135deg, #ecfeff 0%, #f0fdfa 45%, #eff6ff 100%)",
      },
      badgeStyle: {
        backgroundColor: "#ccfbf1",
        color: "#0f766e",
      },
      themeBadgeStyle: {
        backgroundColor: "#e0f2fe",
        color: "#0369a1",
      },
      glowStyle: {
        background:
          "radial-gradient(circle, rgba(45,212,191,0.28) 0%, rgba(125,211,252,0.07) 65%, rgba(45,212,191,0) 100%)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #2dd4bf 0%, #7dd3fc 100%)",
      },
      jarBodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(240,253,250,0.94) 55%, rgba(224,242,254,0.96) 100%)",
        border: "4px solid rgba(255,255,255,0.8)",
        boxShadow: "0 24px 45px rgba(45, 212, 191, 0.18)",
      },
      labelPillStyle: {
        backgroundColor: "rgba(255,255,255,0.92)",
        color: "#155e75",
      },
      centerEmoji: <DewIcon size={64} />,
      decor: [],
      accentLine: "#2dd4bf",
    };
  }

  // 모래 테마: 해변/사막, 베이지
  if (theme === "SAND") {
    return {
      previewCardStyle: {
        background:
          "linear-gradient(135deg, #fffbeb 0%, #fef3c7 45%, #fff7ed 100%)",
      },
      badgeStyle: {
        backgroundColor: "#fef3c7",
        color: "#92400e",
      },
      themeBadgeStyle: {
        backgroundColor: "#ffedd5",
        color: "#9a3412",
      },
      glowStyle: {
        background:
          "radial-gradient(circle, rgba(245,158,11,0.25) 0%, rgba(251,191,36,0.07) 65%, rgba(245,158,11,0) 100%)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #d97706 0%, #fbbf24 100%)",
      },
      jarBodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,251,235,0.94) 55%, rgba(254,243,199,0.96) 100%)",
        border: "4px solid rgba(255,255,255,0.8)",
        boxShadow: "0 24px 45px rgba(217, 119, 6, 0.16)",
      },
      labelPillStyle: {
        backgroundColor: "rgba(255,255,255,0.92)",
        color: "#78350f",
      },
      centerEmoji: <SandIcon size={64} />,
      decor: [],
      accentLine: "#d97706",
    };
  }

  // 달빛 테마: 밤하늘, 남색/은색
  if (theme === "MOONLIGHT") {
    return {
      previewCardStyle: {
        background:
          "linear-gradient(135deg, #eef2ff 0%, #f8fafc 45%, #e0e7ff 100%)",
      },
      badgeStyle: {
        backgroundColor: "#e0e7ff",
        color: "#3730a3",
      },
      themeBadgeStyle: {
        backgroundColor: "#f8fafc",
        color: "#334155",
      },
      glowStyle: {
        background:
          "radial-gradient(circle, rgba(129,140,248,0.32) 0%, rgba(148,163,184,0.08) 65%, rgba(129,140,248,0) 100%)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #312e81 0%, #94a3b8 100%)",
      },
      jarBodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(238,242,255,0.94) 55%, rgba(226,232,240,0.96) 100%)",
        border: "4px solid rgba(255,255,255,0.8)",
        boxShadow: "0 24px 45px rgba(49, 46, 129, 0.20)",
      },
      labelPillStyle: {
        backgroundColor: "rgba(255,255,255,0.92)",
        color: "#312e81",
      },
      centerEmoji: <MoonlightIcon size={64} />,
      decor: [],
      accentLine: "#6366f1",
    };
  }

  // 라벤더 테마: 꽃밭, 보라
  return {
    previewCardStyle: {
      background:
        "linear-gradient(135deg, #f4f1ff 0%, #f8f5ff 45%, #fbf7ff 100%)",
    },
    badgeStyle: {
      backgroundColor: "#f4efff",
      color: "#7b55e8",
    },
    themeBadgeStyle: {
      backgroundColor: "#fff4fb",
      color: "#d45be6",
    },
    glowStyle: {
      background:
        "radial-gradient(circle, rgba(155,115,255,0.28) 0%, rgba(155,115,255,0.06) 65%, rgba(155,115,255,0) 100%)",
    },
    lidStyle: {
      background: "linear-gradient(90deg, #8f62ff 0%, #e068d8 100%)",
    },
    jarBodyStyle: {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(248,244,255,0.92) 55%, rgba(252,245,255,0.96) 100%)",
      border: "4px solid rgba(255,255,255,0.8)",
      boxShadow: "0 24px 45px rgba(155, 115, 255, 0.20)",
    },
    labelPillStyle: {
      backgroundColor: "rgba(255,255,255,0.92)",
      color: "#605177",
    },
    centerEmoji: <LavenderIcon size={64} />,
    decor: [],
    accentLine: "#8d69ff",
  };
}

// ==============================
// 왼쪽 템플릿 카드의 선택 색상
// ==============================
// 선택된 카드가 어떤 저금통인지에 따라
// 배경색 / 테두리색 / 그림자 / 선택 배지 색을 바꿔주는 함수야.
function getTemplateCardStyle(theme) {
  // 봄 저금통
  if (theme === "SPRING") {
    return {
      cardStyle: {
        borderColor: "#ff7ea8",
        background: "linear-gradient(135deg, #fff7fa 0%, #fff1f6 100%)",
        boxShadow: "0 10px 24px rgba(255, 126, 168, 0.18)",
      },
      badgeStyle: {
        backgroundColor: "#ffeff5",
        color: "#ff4f82",
      },
    };
  }

  // 겨울 저금통
  if (theme === "WINTER") {
    return {
      cardStyle: {
        borderColor: "#5cb9ff",
        background: "linear-gradient(135deg, #f3fbff 0%, #eef4ff 100%)",
        boxShadow: "0 10px 24px rgba(92, 185, 255, 0.18)",
      },
      badgeStyle: {
        backgroundColor: "#ebf7ff",
        color: "#2b7fff",
      },
    };
  }

  // 여름 저금통
  if (theme === "SUMMER") {
    return {
      cardStyle: {
        borderColor: "#4fc26d",
        background: "linear-gradient(135deg, #f2fff6 0%, #fffceb 100%)",
        boxShadow: "0 10px 24px rgba(79, 194, 109, 0.18)",
      },
      badgeStyle: {
        backgroundColor: "#edfdf3",
        color: "#2d9152",
      },
    };
  }

  // 가을 저금통: 노을빛 단풍 느낌
  if (theme === "AUTUMN") {
    return {
      cardStyle: {
        borderColor: "#fb7185",
        background:
          "linear-gradient(135deg, #fff7ed 0%, #fed7aa 42%, #ffe4e6 100%)",
        boxShadow: "0 10px 24px rgba(251, 113, 133, 0.20)",
      },
      badgeStyle: {
        backgroundColor: "#ffe4e6",
        color: "#be123c",
      },
    };
  }

  // 이슬 저금통
  if (theme === "DEW") {
    return {
      cardStyle: {
        borderColor: "#2dd4bf",
        background: "linear-gradient(135deg, #ecfeff 0%, #f0fdfa 100%)",
        boxShadow: "0 10px 24px rgba(45, 212, 191, 0.16)",
      },
      badgeStyle: {
        backgroundColor: "#ccfbf1",
        color: "#0f766e",
      },
    };
  }

  // 모래 저금통: 해변 모래빛 느낌
  if (theme === "SAND") {
    return {
      cardStyle: {
        borderColor: "#d6a85f",
        background:
          "linear-gradient(135deg, #fffaf0 0%, #f8e7c2 48%, #f5d7a1 100%)",
        boxShadow: "0 10px 24px rgba(180, 121, 54, 0.16)",
      },
      badgeStyle: {
        backgroundColor: "#fff3d6",
        color: "#8a5a1f",
      },
    };
  }

  // 달빛 저금통
  if (theme === "MOONLIGHT") {
    return {
      cardStyle: {
        borderColor: "#6366f1",
        background: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)",
        boxShadow: "0 10px 24px rgba(99, 102, 241, 0.18)",
      },
      badgeStyle: {
        backgroundColor: "#e0e7ff",
        color: "#3730a3",
      },
    };
  }
  // 라벤더 저금통
  return {
    cardStyle: {
      borderColor: "#8d69ff",
      background: "linear-gradient(135deg, #f7f2ff 0%, #fff5fd 100%)",
      boxShadow: "0 10px 24px rgba(141, 105, 255, 0.18)",
    },
    badgeStyle: {
      backgroundColor: "#f4efff",
      color: "#7b55e8",
    },
  };
}

/*
 * getPreviewSnowballTheme 역할
 *
 * 저금통 만들기 미리보기 화면에서
 * 테마별로 어떤 장식이 떨어질지 정해주는 함수야.
 *
 * 쉽게 말하면:
 * - 봄이면 벚꽃
 * - 겨울이면 눈
 * - 여름이면 잎사귀
 * - 라벤더면 보라빛 반짝이
 * 를 골라주는 작은 사전이야.
 */
function getPreviewSnowballTheme(theme) {
  if (theme === "SPRING") {
    return {
      icons: [
        {
          type: "custom",
          render: (size) => (
            <SpringParticleIcon variant="petal" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <SpringParticleIcon variant="flower" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <SpringParticleIcon variant="heart" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <SpringParticleIcon variant="sparkle" size={size} />
          ),
        },
      ],
    };
  }

  if (theme === "WINTER") {
    return {
      icons: [
        {
          type: "custom",
          render: (size) => (
            <WinterParticleIcon variant="snowflake" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <WinterParticleIcon variant="ice" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <WinterParticleIcon variant="snowball" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <WinterParticleIcon variant="sparkle" size={size} />
          ),
        },
      ],
    };
  }

  if (theme === "SUMMER") {
    return {
      icons: [
        {
          type: "custom",
          render: (size) => (
            <SummerParticleIcon variant="leaf" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <SummerParticleIcon variant="sun" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <SummerParticleIcon variant="grass" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <SummerParticleIcon variant="sparkle" size={size} />
          ),
        },
      ],
    };
  }

  if (theme === "AUTUMN") {
    return {
      icons: [
        {
          type: "custom",
          render: (size) => (
            <AutumnParticleIcon variant="maple" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <AutumnParticleIcon variant="leaf" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <AutumnParticleIcon variant="chestnut" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <AutumnParticleIcon variant="sparkle" size={size} />
          ),
        },
      ],
    };
  }

  if (theme === "DEW") {
    return {
      icons: [
        {
          type: "custom",
          render: (size) => (
            <DewParticleIcon variant="drop" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <DewParticleIcon variant="bubble" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <DewParticleIcon variant="leaf" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <DewParticleIcon variant="sparkle" size={size} />
          ),
        },
      ],
    };
  }

 if (theme === "SAND") {
   return {
     icons: [
       {
         type: "custom",
         render: (size) => (
           <SandParticleIcon variant="shell" size={size} />
         ),
       },
       {
         type: "custom",
         render: (size) => (
           <SandParticleIcon variant="grain" size={size} />
         ),
       },
       {
         type: "custom",
         render: (size) => (
           <SandParticleIcon variant="starfish" size={size} />
         ),
       },
       {
         type: "custom",
         render: (size) => (
           <SandParticleIcon variant="sparkle" size={size} />
         ),
       },
     ],
   };
 }

  if (theme === "MOONLIGHT") {
    return {
      icons: [
        {
          type: "custom",
          render: (size) => (
            <MoonlightParticleIcon variant="moon" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <MoonlightParticleIcon variant="star" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <MoonlightParticleIcon variant="cloud" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <MoonlightParticleIcon variant="sparkle" size={size} />
          ),
        },
      ],
    };
  }

  if (theme === "LAVENDER") {
    return {
      icons: [
        {
          type: "custom",
          render: (size) => (
            <LavenderParticleIcon variant="lavender" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <LavenderParticleIcon variant="petal" size={size} />
          ),
        },
        {
          type: "custom",
          render: (size) => (
            <LavenderParticleIcon variant="sparkle" size={size} />
          ),
        },
      ],
    };
  }
}

/*
 * createPreviewSnowballParticles 역할
 *
 * 저금통 미리보기 안에서 자연스럽게 떨어질 장식 2~3개를 만든다.
 *
 * 중요한 점:
 * - 한 번에 많이 만들지 않는다.
 * - 조금씩 계속 추가해서 끊기지 않게 보이게 한다.
 */
function createPreviewSnowballParticles(theme, count = 2) {
  const snowballTheme = getPreviewSnowballTheme(theme);

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
      left: 22 + Math.random() * 56,
      top: 8 + Math.random() * 18,

      // 너무 크지 않게 은은하게
      size: 20 + Math.random() * 8,

      // 좌우로 살짝 흔들리면서 아래로 떨어짐
      fallX: -26 + Math.random() * 52,
      fallY: 120 + Math.random() * 70,

      // 떨어지며 살짝 회전
      rotate: -100 + Math.random() * 200,

      duration,
      delay,

      // 이 시간이 지나면 이 파티클만 삭제
      lifetime: duration + delay + 0.35,
    };
  });
}

// ==============================
// 둥둥 떠다니는 장식
// ==============================
function FloatingIcon({ left, top, delay, children }) {
  return (
    <motion.div
      className="absolute text-[28px]"
      style={{ left: `${left}px`, top: `${top}px` }}
      animate={{ y: [0, -8, 0], rotate: [0, 3, -3, 0] }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}

// ==============================
// 실제 저금통 그림
// ==============================
/*
 * JarIllustration 역할
 *
 * 저금통 만들기 화면 오른쪽에 보이는
 * "미리보기 저금통 그림"을 담당하는 컴포넌트야.
 *
 * 이번에 추가한 기능:
 * - 사용자가 저금통을 만들기 전에
 * - 선택한 테마에 맞는 효과를 미리 볼 수 있다.
 * - 봄은 벚꽃, 겨울은 눈, 여름은 잎사귀, 라벤더는 보라빛 장식이 계속 살짝 떨어진다.
 *
 * 쉽게 말하면:
 * 상세 페이지에서 보던 스노우볼 효과를
 * 저금통 만들기 미리보기에도 살짝 보여주는 거야.
 */
function JarIllustration({ template, form }) {
  const preset = getVisualPreset(form.theme);

  // 미리보기 저금통 안에 현재 보이는 파티클 목록
  const [particles, setParticles] = useState([]);

  // 2~3개씩 계속 추가하는 interval 저장소
  const snowballIntervalRef = useRef(null);

  // 각각의 파티클을 나중에 삭제하는 타이머 저장소
  const particleRemoveTimerRefs = useRef([]);

  /*
   * 파티클을 2~3개씩 자연스럽게 추가하는 함수
   *
   * 한 번에 전부 지웠다가 다시 만드는 방식이 아니라,
   * 기존 파티클은 그대로 두고 새 파티클만 조금씩 추가한다.
   */
  function playPreviewSnowballEffect() {
    // 이번에 추가할 개수: 2개 또는 3개
    const nextCount = Math.random() > 0.55 ? 3 : 2;

    // 새 파티클 만들기
    const nextParticles = createPreviewSnowballParticles(
      form.theme,
      nextCount
    );

    // 기존 파티클에 새 파티클을 이어 붙인다.
    setParticles((prev) => {
      const merged = [...prev, ...nextParticles];

      // 너무 많이 쌓이면 복잡해지니까 최대 16개 정도만 유지한다.
      return merged.slice(-16);
    });

    // 각 파티클은 자기 애니메이션이 끝나면 혼자 사라진다.
    nextParticles.forEach((particle) => {
      const timerId = window.setTimeout(() => {
        setParticles((prev) =>
          prev.filter((item) => item.id !== particle.id)
        );
      }, particle.lifetime * 1000);

      particleRemoveTimerRefs.current.push(timerId);
    });
  }

  /*
   * 선택한 테마가 보이는 동안 계속 파티클을 흩날리게 한다.
   *
   * form.theme이 바뀌면:
   * - 기존 타이머를 정리하고
   * - 파티클도 비운 다음
   * - 새 테마에 맞는 장식으로 다시 시작한다.
   */
  useEffect(() => {
    // 테마가 바뀔 때 기존 파티클 먼저 비우기
    setParticles([]);

    // 처음 화면에 들어왔을 때 바로 한 번 보여주기
    playPreviewSnowballEffect();

    // 이후 계속 2~3개씩 자연스럽게 추가
    snowballIntervalRef.current = window.setInterval(() => {
      playPreviewSnowballEffect();
    }, 650);

    return () => {
      if (snowballIntervalRef.current) {
        window.clearInterval(snowballIntervalRef.current);
      }

      particleRemoveTimerRefs.current.forEach((timerId) => {
        window.clearTimeout(timerId);
      });

      particleRemoveTimerRefs.current = [];
    };
  }, [form.theme]);

  return (
    <div className="relative mx-auto mt-2 h-[300px] w-full max-w-[360px]">
      {/* 미리보기 저금통 안에서만 쓰는 파티클 애니메이션 */}
      <style>
        {`
          @keyframes previewJarParticleFall {
            0% {
              opacity: 0;
              transform: translate(0, -10px) rotate(0deg) scale(0.75);
            }

            12% {
              opacity: 0.9;
            }

            55% {
              opacity: 0.9;
            }

            100% {
              opacity: 0;
              transform:
                translate(var(--fall-x), var(--fall-y))
                rotate(var(--fall-rotate))
                scale(1);
            }
          }

          .preview-jar-particle {
            opacity: 0;
            transform: translate(0, -10px) rotate(0deg) scale(0.75);
            animation-name: previewJarParticleFall;
            animation-duration: var(--fall-duration);
            animation-delay: var(--fall-delay);
            animation-timing-function: ease-in-out;
            animation-fill-mode: both;
            will-change: transform, opacity;
          }
        `}
      </style>

      {/* 뒤쪽 빛 */}
      <motion.div
        className="absolute left-1/2 top-[110px] h-[220px] w-[220px] -translate-x-1/2 rounded-full blur-3xl"
        style={preset.glowStyle}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 장식 아이콘 */}
      {preset.decor.map((item, index) => (
        <FloatingIcon
          key={`${item.emoji}-${index}`}
          left={item.left}
          top={item.top}
          delay={item.delay}
        >
          {item.emoji}
        </FloatingIcon>
      ))}

      {/* 저금통 전체 */}
      <motion.div
          className="absolute left-1/2 top-[25px] -translate-x-1/2"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3.1, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="relative h-[300px] w-[240px]">
          {/* 뚜껑 */}
          <div
            className="absolute left-1/2 top-[0px] z-20 h-[48px] w-[180px] -translate-x-1/2 rounded-full shadow-xl"
            style={preset.lidStyle}
          />
          <div
            className="absolute left-1/2 top-[17px] z-30 h-[7px] w-[58px] -translate-x-1/2 rounded-full"
            style={{ backgroundColor: "rgba(80, 70, 70, 0.72)" }}
          />

          {/* 몸통 */}
          <div
            className="absolute left-1/2 top-[36px] z-10 h-[240px] w-[195px] -translate-x-1/2 overflow-hidden"
            style={{
              ...preset.jarBodyStyle,
              borderRadius: "42% 42% 28% 28%",
            }}
          >
            {/* 유리 반짝임 */}
            <div
              className="absolute left-[20px] top-[24px] z-30 h-[130px] w-[14px] rounded-full"
              style={{
                background: "rgba(255,255,255,0.72)",
                filter: "blur(2px)",
              }}
            />
            <div
              className="absolute right-[18px] top-[36px] z-30 h-[80px] w-[8px] rounded-full"
              style={{
                background: "rgba(255,255,255,0.45)",
                filter: "blur(2px)",
              }}
            />

            {/* 자동으로 흩날리는 장식 */}
            {particles.map((particle) => (
              <span
                key={particle.id}
                className="preview-jar-particle absolute z-20 flex select-none items-center justify-center"
                style={{
                  left: `${particle.left}%`,
                  top: `${particle.top}%`,
                  fontSize: `${particle.size}px`,
                  "--fall-x": `${particle.fallX}px`,
                  "--fall-y": `${particle.fallY}px`,
                  "--fall-rotate": `${particle.rotate}deg`,
                  "--fall-duration": `${particle.duration}s`,
                  "--fall-delay": `${particle.delay}s`,
                }}
              >
                {typeof particle.icon === "string"
                  ? particle.icon
                  : particle.icon.type === "emoji"
                    ? particle.icon.value
                    : particle.icon.render(particle.size)}
              </span>
            ))}

            {/* 안쪽 내용 */}
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3">
              <div className="flex h-[70px] w-[70px] items-center justify-center text-[52px]">
                {preset.centerEmoji}
              </div>
            </div>
          </div>

          {/* 그림자 */}
          <div
            className="absolute bottom-[0px] left-1/2 h-[20px] w-[130px] -translate-x-1/2 rounded-full"
            style={{
              backgroundColor: "rgba(100, 116, 139, 0.20)",
              filter: "blur(8px)",
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}

// ==============================
// 오른쪽 큰 미리보기 카드
// ==============================
function JarPreview({ template, form }) {
  const preset = getVisualPreset(form.theme);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${template.type}-${form.theme}-${form.openMode}-${form.lockLevel}-${form.maxMembers}`}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.98 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="flex h-full min-h-[560px] flex-col rounded-[28px] border border-white/70 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.10)]"
        style={preset.previewCardStyle}
      >
        {/* 뱃지 */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-extrabold"
            style={preset.badgeStyle}
          >
             {template.title}
          </span>

          <span
            className="rounded-full px-3 py-1 text-xs font-extrabold"
            style={preset.themeBadgeStyle}
          >
            {THEME_LABEL[form.theme]}
          </span>
        </div>

        {/* 제목/설명 */}
        <h3 className="text-[30px] font-black leading-tight text-slate-800">
          {form.name || template.previewTitle}
        </h3>

        <p className="mt-2 text-base leading-7 text-slate-600">
          {form.description || template.previewDesc}
        </p>

        {/* 작은 정보칩 */}
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
            {THEME_LABEL[form.theme]}
          </span>
          <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
            최대 {form.maxMembers}명
          </span>
        </div>

        {/* 저금통 그림 */}
        <JarIllustration template={template} form={form} />

        {/* 아래 설명 카드 */}
        <div className="mt-auto rounded-[20px] bg-white/88 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
          <div
            className="mb-2 h-1.5 w-14 rounded-full"
            style={{ backgroundColor: preset.accentLine }}
          />
          <p className="text-xl font-black text-slate-800">{template.previewTitle}</p>
          <p className="mt-2 text-base leading-7 text-slate-600">
            {template.previewDesc}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function JarsNewPage() {
  const navigate =
    useNavigate();

  /*
   * 내정보의 이용 방법 선택창에서 전달한
   * 수동 다시 보기 요청을 확인하기 위해 현재 위치 정보를 읽는다.
   */
  const location =
    useLocation();

  /*
   * 앱 전체 OnboardingProvider에서
   * 새 저금통 만들기 안내 상태와 저장 함수를 가져온다.
   */
  const {
    activeTutorialKey,
    savingTutorialKey,
    error: onboardingError,
    shouldShowTutorial,
    openTutorial,
    closeTutorial,
    completeActiveTutorial,
    skipActiveTutorial,
  } = useOnboarding();

  /*
   * 생성 페이지를 실제로 벗어나는 순간
   * 현재 어떤 안내가 열려 있는지 최신 값을 확인하기 위한 Ref다.
   *
   * activeTutorialKey를 cleanup Effect 의존성에 직접 넣지 않아
   * 안내가 열리는 순간 불필요한 cleanup이 실행되는 것을 막는다.
   */
  const activeTutorialKeyRef =
    useRef(activeTutorialKey);

  activeTutorialKeyRef.current =
    activeTutorialKey;

  /*
   * JAR_CREATE 각 단계에서 강조할
   * 실제 화면 영역들을 가리킨다.
   */

  // 왼쪽의 8가지 저금통 선택 영역
  const templateTutorialTargetRef =
    useRef(null);

  // 오른쪽의 선택 결과 미리보기 영역
  const previewTutorialTargetRef =
    useRef(null);

  /*
   * JAR_CREATE 입력 단계에서 강조할
   * 각 입력 항목의 실제 화면 영역
   */

  // 저금통 이름 입력 영역
  const nameTutorialTargetRef =
    useRef(null);

  // 저금통 설명 입력 영역
  const descriptionTutorialTargetRef =
    useRef(null);

  // 테마 선택 영역
  const themeTutorialTargetRef =
    useRef(null);

  // 최대 인원 입력 영역
  const maxMembersTutorialTargetRef =
    useRef(null);

  // 오픈 날짜 입력 영역
  const openAtTutorialTargetRef =
    useRef(null);

  // 최종 저금통 만들기 버튼
  const submitTutorialTargetRef =
    useRef(null);

  /*
   * 현재 보고 있는 새 저금통 만들기 안내 단계
   *
   * 0: 저금통 종류 선택
   * 1: 오른쪽 미리보기 확인
   * 2: 저금통 이름
   * 3: 저금통 설명
   * 4: 테마
   * 5: 최대 인원
   * 6: 오픈 날짜
   * 7: 저금통 만들기
   */
  const [
    jarCreateTutorialStepIndex,
    setJarCreateTutorialStepIndex,
  ] = useState(0);

  const defaultTemplate =
    JAR_TEMPLATES[0];

  const [form, setForm] = useState({
      ...defaultTemplate.values,
      openAt: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /*
   * 현재 열린 안내가 JAR_CREATE인지 확인한다.
   */
  const isJarCreateTutorialOpen =
    activeTutorialKey ===
    ONBOARDING_TUTORIAL_KEY.JAR_CREATE;

  /*
   * 내정보에서 새 저금통 만들기 안내를 선택한 뒤
   * /jars/new로 이동해 온 요청인지 확인한다.
   *
   * 자동 안내 여부와 관계없이,
   * 이 값이 JAR_CREATE라면 수동 다시 보기로 처리한다.
   */
  const replayTutorialKey =
    location.state?.[
      ONBOARDING_REPLAY_STATE_KEY
    ] ?? null;

  const shouldReplayJarCreateTutorial =
    replayTutorialKey ===
    ONBOARDING_TUTORIAL_KEY.JAR_CREATE;

  /*
   * 현재 JAR_CREATE 상태를 저장하고 있는지 확인한다.
   */
  const isJarCreateTutorialSaving =
    savingTutorialKey ===
    ONBOARDING_TUTORIAL_KEY.JAR_CREATE;

  /*
   * 현재 보여줄 단계 정보
   */
  const currentJarCreateTutorialStep =
    JAR_CREATE_TUTORIAL_STEPS[
      jarCreateTutorialStepIndex
    ] ?? JAR_CREATE_TUTORIAL_STEPS[0];

  /*
   * 현재 단계가 첫 번째 단계인지 확인한다.
   *
   * 첫 번째 단계에서는 더 이전으로 갈 곳이 없으므로
   * 이전 버튼을 표시하지 않는다.
   */
  const isFirstJarCreateTutorialStep =
    jarCreateTutorialStepIndex === 0;

  /*
   * 현재 단계가 마지막인지 확인한다.
   */
  const isLastJarCreateTutorialStep =
    jarCreateTutorialStepIndex ===
    JAR_CREATE_TUTORIAL_STEPS.length - 1;

  /*
   * 현재 튜토리얼 단계에 따라
   * 실제로 강조할 화면 요소의 Ref를 선택한다.
   *
   * 기본값은 첫 단계인 저금통 종류 선택 영역이다.
   */
  let jarCreateTutorialTargetRef =
    templateTutorialTargetRef;

  /*
   * 두 번째 단계:
   * 오른쪽 저금통 미리보기
   */
  if (
    currentJarCreateTutorialStep
      ?.targetKey ===
    JAR_CREATE_TUTORIAL_TARGET.PREVIEW
  ) {
    jarCreateTutorialTargetRef =
      previewTutorialTargetRef;
  }

  /*
   * 세 번째 단계:
   * 저금통 이름
   */
  if (
    currentJarCreateTutorialStep
      ?.targetKey ===
    JAR_CREATE_TUTORIAL_TARGET.NAME
  ) {
    jarCreateTutorialTargetRef =
      nameTutorialTargetRef;
  }

  /*
   * 네 번째 단계:
   * 저금통 설명
   */
  if (
    currentJarCreateTutorialStep
      ?.targetKey ===
    JAR_CREATE_TUTORIAL_TARGET.DESCRIPTION
  ) {
    jarCreateTutorialTargetRef =
      descriptionTutorialTargetRef;
  }

  /*
   * 다섯 번째 단계:
   * 저금통 테마
   */
  if (
    currentJarCreateTutorialStep
      ?.targetKey ===
    JAR_CREATE_TUTORIAL_TARGET.THEME
  ) {
    jarCreateTutorialTargetRef =
      themeTutorialTargetRef;
  }

  /*
   * 여섯 번째 단계:
   * 최대 인원
   */
  if (
    currentJarCreateTutorialStep
      ?.targetKey ===
    JAR_CREATE_TUTORIAL_TARGET.MAX_MEMBERS
  ) {
    jarCreateTutorialTargetRef =
      maxMembersTutorialTargetRef;
  }

  /*
   * 일곱 번째 단계:
   * 오픈 날짜
   */
  if (
    currentJarCreateTutorialStep
      ?.targetKey ===
    JAR_CREATE_TUTORIAL_TARGET.OPEN_AT
  ) {
    jarCreateTutorialTargetRef =
      openAtTutorialTargetRef;
  }

  /*
   * 여덟 번째 단계:
   * 저금통 만들기 버튼
   */
  if (
    currentJarCreateTutorialStep
      ?.targetKey ===
    JAR_CREATE_TUTORIAL_TARGET.SUBMIT
  ) {
    jarCreateTutorialTargetRef =
      submitTutorialTargetRef;
  }

  /*
   * 특정 화면 요소가 현재 강조 대상인지 확인한다.
   */
  function isCurrentJarCreateTutorialTarget(
    targetKey
  ) {
    return (
      isJarCreateTutorialOpen &&
      currentJarCreateTutorialStep
        ?.targetKey === targetKey
    );
  }

  /*
   * 안내 카드의 다음 또는 안내 완료 버튼 처리
   */
  const handleJarCreateTutorialPrimaryAction =
    async () => {
      if (
        !isJarCreateTutorialOpen ||
        isJarCreateTutorialSaving
      ) {
        return;
      }

      /*
       * 마지막 단계 전까지는 다음 화면 요소로 이동한다.
       */
      if (
        !isLastJarCreateTutorialStep
      ) {
        setJarCreateTutorialStepIndex(
          (previousIndex) =>
            Math.min(
              previousIndex + 1,
              JAR_CREATE_TUTORIAL_STEPS.length -
                1
            )
        );

        return;
      }

      /*
       * 마지막 설명까지 확인하면
       * JAR_CREATE 완료 상태를 백엔드에 저장한다.
       */
      try {
        await completeActiveTutorial();
      } catch {
        /*
         * 오류 문구는 OnboardingProvider가 저장하고
         * TutorialSpotlight 안에서 표시한다.
         */
      }
    };

  /*
   * 안내 카드의 이전 버튼 처리
   *
   * 현재 단계 번호를 1 줄여서 바로 앞의 강조 영역으로 돌아간다.
   *
   * 이전 단계로 돌아가도:
   *
   * - 사용자가 입력한 이름
   * - 입력한 설명
   * - 선택한 테마
   * - 최대 인원
   * - 오픈 날짜
   *
   * 는 변경하거나 초기화하지 않는다.
   */
  const handleJarCreateTutorialPrevious =
    () => {
      /*
       * JAR_CREATE 안내가 아니거나
       * 백엔드 저장 중이라면 이동하지 않는다.
       */
      if (
        !isJarCreateTutorialOpen ||
        isJarCreateTutorialSaving
      ) {
        return;
      }

      /*
       * 첫 번째 단계에서는
       * 더 이전으로 이동하지 않는다.
       */
      if (
        isFirstJarCreateTutorialStep
      ) {
        return;
      }

      /*
       * 단계 번호를 하나 줄이되
       * 0보다 작아지지 않게 제한한다.
       */
      setJarCreateTutorialStepIndex(
        (previousIndex) =>
          Math.max(
            previousIndex - 1,
            0
          )
      );
    };

  /*
   * 어느 단계에서든 전체 생성 안내를 건너뛴다.
   */
  const handleJarCreateTutorialSkip =
    async () => {
      if (
        !isJarCreateTutorialOpen ||
        isJarCreateTutorialSaving
      ) {
        return;
      }

      try {
        await skipActiveTutorial();
      } catch {
        /*
         * 저장에 실패하면 안내를 닫지 않고
         * 오류 문구를 계속 보여준다.
         */
      }
    };

  /*
   * 새 저금통 만들기 페이지에 들어왔을 때
   * JAR_CREATE 안내를 아직 보지 않았다면 자동으로 연다.
   */
  useEffect(() => {
    /*
     * 다른 온보딩이 이미 열려 있다면 덮어쓰지 않는다.
     */
    if (
      activeTutorialKey !== null
    ) {
      return undefined;
    }

    const shouldOpenJarCreate =
      shouldShowTutorial(
        ONBOARDING_TUTORIAL_KEY.JAR_CREATE
      );

    if (!shouldOpenJarCreate) {
      return undefined;
    }

    /*
     * 페이지 요소가 완전히 그려진 뒤
     * 첫 번째 강조 위치를 계산한다.
     */
    const timerId =
      window.setTimeout(() => {
        openTutorial(
          ONBOARDING_TUTORIAL_KEY.JAR_CREATE
        );
      }, 300);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    activeTutorialKey,
    shouldShowTutorial,
    openTutorial,
  ]);

  /*
   * 내정보에서 "새 저금통 만들기 안내"를 선택하고
   * 다른 화면에서 /jars/new로 이동해 온 경우의 수동 다시 보기 처리다.
   *
   * 자동 안내와 다른 점:
   *
   * 자동 안내:
   * COMPLETED 또는 SKIPPED이면 열지 않는다.
   *
   * 수동 다시 보기:
   * force=true를 사용해 기존 상태와 관계없이 다시 연다.
   */
  useEffect(() => {
    if (
      !shouldReplayJarCreateTutorial
    ) {
      return undefined;
    }

    /*
     * 페이지의 입력란과 미리보기 Ref가 모두 연결된 다음
     * 첫 번째 강조 위치를 계산하도록 잠시 기다린다.
     */
    const timerId =
      window.setTimeout(() => {
        openTutorial(
          ONBOARDING_TUTORIAL_KEY.JAR_CREATE,
          {
            force: true,
          }
        );

        /*
         * navigation state에 다시 보기 요청을 계속 남겨두면
         * 뒤로 가기나 같은 화면 재렌더링 때 반복 실행될 수 있다.
         *
         * 사용한 요청값만 제거하고 같은 주소로 교체한다.
         */
        const nextState = {
          ...(location.state ?? {}),
        };

        delete nextState[
          ONBOARDING_REPLAY_STATE_KEY
        ];

        navigate(
          location.pathname,
          {
            replace: true,

            state:
              Object.keys(nextState)
                .length > 0
                ? nextState
                : null,
          }
        );
      }, 300);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    shouldReplayJarCreateTutorial,
    location.pathname,
    location.state,
    navigate,
    openTutorial,
  ]);

  /*
   * 안내가 새로 열릴 때마다 첫 번째 단계부터 시작한다.
   */
  useEffect(() => {
    if (!isJarCreateTutorialOpen) {
      return;
    }

    setJarCreateTutorialStepIndex(0);
  }, [isJarCreateTutorialOpen]);

  /*
   * 생성 페이지를 벗어날 때만
   * 열려 있는 JAR_CREATE 안내를 정리한다.
   */
  useEffect(() => {
    return () => {
      if (
        activeTutorialKeyRef.current ===
        ONBOARDING_TUTORIAL_KEY.JAR_CREATE
      ) {
        closeTutorial();
      }
    };
  }, [
    closeTutorial,
  ]);


  const selectedTemplate = useMemo(() => {
    return (
      JAR_TEMPLATES.find((template) => template.values.theme === form.theme) ||
      defaultTemplate
    );
  }, [form.theme, defaultTemplate]);

    /*
     * selectedPreset 역할
     *
     * 사용자가 선택한 테마에 맞춰
     * 저금통 정보 입력 카드의 배경색, 포인트 색을 정해주는 값이야.
     *
     * 쉽게 말하면:
     * - 봄 저금통이면 분홍빛
     * - 여름 저금통이면 초록빛
     * - 겨울 저금통이면 파란빛
     * 으로 입력 폼 분위기도 같이 맞춰준다.
     */
    const selectedPreset = useMemo(() => {
      return getVisualPreset(form.theme);
    }, [form.theme]);

    /*
     * 왼쪽 저금통 템플릿 카드를 눌렀을 때 실행된다.
     *
     * 역할:
     *
     * 1. 선택한 저금통의 이름, 설명, 테마, 기본 인원 정보를 폼에 반영한다.
     * 2. 사용자가 이미 정한 오픈 날짜는 그대로 유지한다.
     * 3. 첫 번째 튜토리얼 중이라면 오른쪽 미리보기 안내로 자동 이동한다.
     */
    function handleTemplateClick(template) {
      setForm((prev) => ({
        ...template.values,

        /*
         * 다른 저금통을 선택해도
         * 사용자가 직접 정한 오픈 날짜는 지우지 않는다.
         */
        openAt: prev.openAt,
      }));

      setError("");

      /*
       * 현재 JAR_CREATE 첫 번째 단계가 열려 있다면
       * 선택 결과를 바로 확인할 수 있도록
       * 오른쪽 미리보기 단계로 이동한다.
       */
      if (
        isJarCreateTutorialOpen &&
        currentJarCreateTutorialStep
          ?.targetKey ===
          JAR_CREATE_TUTORIAL_TARGET.TEMPLATE
      ) {
        window.setTimeout(() => {
          setJarCreateTutorialStepIndex(1);
        }, 180);
      }
    }

  // 폼 값 변경
  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: name === "maxMembers" ? Number(value) : value,
    }));
  }

  // 생성 요청
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await fetchCsrf();

      const payload = {
        ...form,
        openAt: form.openAt,
      };

      const res = await apiClient.post(
        "/api/v1/jars",
        payload
      );

      const createdJar =
        res.data?.data;

      /*
       * 생성 안내가 열린 상태에서 실제 저금통 생성에 성공했다면
       * JAR_CREATE도 완료 상태로 저장한다.
       *
       * 생성 자체가 실패했는데 안내만 완료되는 상황을 막기 위해
       * POST 성공 이후에 실행한다.
       */
      if (isJarCreateTutorialOpen) {
        try {
          await completeActiveTutorial();
        } catch {
          /*
           * 온보딩 상태 저장 실패는
           * 실제 저금통 생성 성공을 막지 않는다.
           *
           * 저장되지 않았다면 다음 생성 페이지 방문 때
           * 안내가 다시 나타날 수 있다.
           */
        }
      }

      navigate(
        `/jars/${createdJar.jarId}`
      );
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "저금통 생성에 실패했어요.";

      setError(serverMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/*
       * 새 저금통 만들기 화면의 온보딩
       *
       * 저금통 선택
       * → 오른쪽 미리보기
       * → 이름
       * → 설명
       * → 테마
       * → 최대 인원
       * → 오픈 날짜
       * → 저금통 만들기
       */}
      <TutorialSpotlight
        isOpen={
          isJarCreateTutorialOpen
        }
        targetRef={
          jarCreateTutorialTargetRef
        }
          /*
           * 오른쪽 미리보기 단계에서는 설명 카드를
           * 미리보기 왼쪽 옆에 배치한다.
           *
           * 모바일처럼 공간이 부족하면
           * TutorialSpotlight가 자동으로 위·아래 배치로 전환한다.
           */
          preferredPlacement={
            currentJarCreateTutorialStep
              ?.targetKey ===
            JAR_CREATE_TUTORIAL_TARGET.PREVIEW
              ? "left"
              : "auto"
          }
          /*
           * 첫 번째 단계를 제외한 모든 단계에서
           * 이전 버튼을 표시한다.
           */
          showPrevious={
            !isFirstJarCreateTutorialStep
          }
          previousLabel="이전"
          onPrevious={
            handleJarCreateTutorialPrevious
          }
        eyebrow={`새 저금통 만들기 안내 · ${
          jarCreateTutorialStepIndex + 1
        } / ${
          JAR_CREATE_TUTORIAL_STEPS.length
        }`}
        title={
          currentJarCreateTutorialStep
            ?.title
        }
        description={
          currentJarCreateTutorialStep
            ?.description
        }
        completeLabel={
          isLastJarCreateTutorialStep
            ? "안내 완료"
            : "다음"
        }
        skipLabel="건너뛰기"
        isSaving={
          isJarCreateTutorialSaving
        }
        error={
          isJarCreateTutorialOpen
            ? onboardingError
            : ""
        }
        onComplete={
          handleJarCreateTutorialPrimaryAction
        }
        onSkip={
          handleJarCreateTutorialSkip
        }
      />

      <div className="min-h-[calc(100vh-80px)] bg-[#f8f4ef] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        {/* 상단 소개 */}
        <section className="mb-8 rounded-[24px] bg-[#fffafb] p-8 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <div className="mb-4 inline-flex rounded-full bg-[#ffe9ef] px-4 py-2 text-xs font-extrabold text-[#ff537e]">
            새로운 추억 시작하기
          </div>

          <h1 className="text-4xl font-black text-slate-800">새 저금통 만들기</h1>

          <p className="mt-4 text-base leading-8 text-slate-600">
            먼저 분위기에 맞는 저금통을 골라봐요. 고르는 순간 오른쪽 미리보기가 바로 바뀌고
            아래 설정을 조금만 다듬으면 바로 만들 수 있어요.
          </p>
        </section>

        {/* 선택 카드 + 큰 미리보기 */}
        <section className="grid gap-8 xl:grid-cols-[1fr_1.1fr]">
          {/* 왼쪽 카드 목록 */}
          <div>
            {/*
             * JAR_CREATE 첫 번째 단계에서
             * 테마 선택 설명 영역을 강조한다.
             */}
            {/* 왼쪽 저금통 선택 목록 */}
            <div
              /*
               * JAR_CREATE 첫 번째 단계에서
               * 제목뿐 아니라 8가지 저금통 카드 전체를 강조한다.
               */
              ref={templateTutorialTargetRef}
              className={`rounded-[26px] transition ${
                isCurrentJarCreateTutorialTarget(
                  JAR_CREATE_TUTORIAL_TARGET.TEMPLATE
                )
                  ? "ring-4 ring-white/90"
                  : ""
              }`}
            >
              <h2 className="text-3xl font-black text-slate-800">
                어떤 저금통을 만들고 싶어요?
              </h2>

              <p className="mt-2 text-base text-slate-500">
                8가지 테마 중 하나를 고르면 그에 맞는 저금통이 바로 보여요.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {JAR_TEMPLATES.map((template) => {
                const isSelected = form.theme === template.values.theme;

                // 지금 카드(theme)에 맞는 선택 색상 세트
                const templateCardStyle = getTemplateCardStyle(template.values.theme);
                return (
                  <motion.button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateClick(template)}
                    whileHover={{ y: -4, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className={`min-h-[138px] rounded-[18px] border p-4 text-left shadow-sm transition ${
                      isSelected ? "" : "border-[#ece7e1] bg-white"
                    }`}
                    style={isSelected ? templateCardStyle.cardStyle : undefined}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-2xl">{template.emoji}</div>

                      {isSelected && (
                        <span
                          className="rounded-full px-3 py-1 text-xs font-extrabold"
                          style={templateCardStyle.badgeStyle}
                        >
                          선택됨
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-black text-slate-800">{template.title}</h3>
                    <p className="mt-1.5 text-xs leading-5 text-slate-600">
                      {template.summary}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* 오른쪽 저금통 미리보기 정렬 영역 */}
          <div
            /*
             * 왼쪽의 "어떤 저금통을 만들고 싶어요?" 제목과 설명만큼
             * 공간을 위에 만들어서,
             *
             * 오른쪽 미리보기가 제목 위치가 아니라
             * 실제 8가지 테마 카드가 시작하는 높이에 맞춰지도록 한다.
             *
             * xl 이상 화면에서만 92px을 내려주기 때문에
             * 모바일/태블릿의 세로 배치는 그대로 유지된다.
             */
            className="h-full xl:pt-[92px]"
          >
            {/* 오른쪽 저금통 미리보기 */}
            <div
              /*
               * JAR_CREATE 두 번째 단계에서
               * 선택한 저금통의 전체 미리보기 카드만 강조한다.
               *
               * 바깥쪽 정렬 여백은 튜토리얼 강조 대상에서 제외해서
               * 실제 미리보기 카드 위치만 정확하게 강조한다.
               */
              ref={previewTutorialTargetRef}
              className={`h-full rounded-[28px] transition ${
                isCurrentJarCreateTutorialTarget(
                  JAR_CREATE_TUTORIAL_TARGET.PREVIEW
                )
                  ? "ring-4 ring-white/90"
                  : ""
              }`}
            >
              <JarPreview
                template={selectedTemplate}
                form={form}
              />
            </div>
          </div>
        </section>

        {/* 에러 */}
        {error && (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {error}
          </div>
        )}

        {/* 입력 폼 */}
        {/* 입력 폼 */}
        <section
          /*
           * 저금통 정보 입력 카드 전체 영역
           *
           * overflow-clip을 사용하는 이유:
           * 카드 바깥으로 나가는 배경 장식은 잘라내면서도,
           * 이 영역 자체가 스크롤 컨테이너가 되는 것을 막아준다.
           *
           * 따라서 튜토리얼의 scrollIntoView()가 실행되어도
           * 카드 내부 내용이 위로 밀려서 잘리는 현상이 생기지 않는다.
           */
          className="relative mt-10 overflow-clip rounded-[28px] border border-white/80 p-8 shadow-[0_18px_48px_rgba(15,23,42,0.10)]"
          style={selectedPreset.previewCardStyle}
        >
          {/* 카드 안쪽에 은은하게 깔리는 빛 장식 */}
          <div className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-white/70 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-60 w-60 rounded-full bg-white/60 blur-3xl" />

          <div className="relative">
            {/* 제목 영역 */}
            <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-extrabold text-slate-600 shadow-sm">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: selectedPreset.accentLine }}
                  />
                  {selectedTemplate.title} 정보 채우기
                </div>

                <h2 className="text-3xl font-black text-slate-800">
                  저금통 정보 입력
                </h2>

                <p className="mt-3 text-base leading-7 text-slate-500">
                  이름과 설명을 작성하고, 테마, 최대 인원, 오픈 날짜를 정하면
                  새로운 추억 저금통을 만들 수 있어요.
                </p>
              </div>

              {/* 현재 선택된 테마를 작게 보여주는 장식 카드 */}
              <div className="hidden shrink-0 rounded-[22px] bg-white/80 px-5 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.08)] sm:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                    {selectedTemplate.emoji}
                  </div>

                  <div>
                    <p className="text-xs font-extrabold text-slate-400">
                      선택한 테마
                    </p>
                    <p className="text-lg font-black text-slate-800">
                      {THEME_LABEL[form.theme]}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              {/*
               * 새 저금통 만들기 입력 영역
               *
               * 각 항목을 하나씩 별도로 감싸서:
               *
               * 이름
               * 설명
               * 테마
               * 최대 인원
               * 오픈 날짜
               *
               * 순서로 각각 스포트라이트를 보여준다.
               */}
              <div className="grid gap-5 md:grid-cols-2">
                {/* 저금통 이름 */}
                <div
                  /*
                   * JAR_CREATE 세 번째 단계에서
                   * 이름 입력 영역만 따로 강조한다.
                   */
                  ref={nameTutorialTargetRef}
                  className={`rounded-[22px] transition md:col-span-2 ${
                    isCurrentJarCreateTutorialTarget(
                      JAR_CREATE_TUTORIAL_TARGET.NAME
                    )
                      ? "ring-4 ring-white/90"
                      : ""
                  }`}
                >
                  <label className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          selectedPreset.accentLine,
                      }}
                    />

                    저금통 이름
                  </label>

                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="예: 우리의 2026 추억 저금통"
                    className="w-full rounded-[18px] border border-white/80 bg-white/85 px-4 py-3.5 text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-pink-300 focus:bg-white focus:shadow-[0_0_0_4px_rgba(244,114,182,0.12)]"
                    required
                  />
                </div>

                {/* 저금통 설명 */}
                <div
                  /*
                   * JAR_CREATE 네 번째 단계에서
                   * 설명 입력 영역만 따로 강조한다.
                   */
                  ref={descriptionTutorialTargetRef}
                  className={`rounded-[22px] transition md:col-span-2 ${
                    isCurrentJarCreateTutorialTarget(
                      JAR_CREATE_TUTORIAL_TARGET.DESCRIPTION
                    )
                      ? "ring-4 ring-white/90"
                      : ""
                  }`}
                >
                  <label className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          selectedPreset.accentLine,
                      }}
                    />

                    설명
                  </label>

                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={4}
                    placeholder="이 저금통에 담을 이야기나 사용 목적을 자유롭게 적어보세요."
                    className="w-full resize-none rounded-[18px] border border-white/80 bg-white/85 px-4 py-3.5 text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-pink-300 focus:bg-white focus:shadow-[0_0_0_4px_rgba(244,114,182,0.12)]"
                  />
                </div>

                {/* 저금통 테마 */}
                <div
                  /*
                   * JAR_CREATE 다섯 번째 단계에서
                   * 테마 선택 영역만 따로 강조한다.
                   */
                  ref={themeTutorialTargetRef}
                  className={`rounded-[22px] transition ${
                    isCurrentJarCreateTutorialTarget(
                      JAR_CREATE_TUTORIAL_TARGET.THEME
                    )
                      ? "ring-4 ring-white/90"
                      : ""
                  }`}
                >
                  <label className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700">
                    <span className="text-base">
                      🎨
                    </span>

                    테마
                  </label>

                  <select
                    name="theme"
                    value={form.theme}
                    onChange={handleChange}
                    className="w-full rounded-[18px] border border-white/80 bg-white/85 px-4 py-3.5 text-slate-800 shadow-sm outline-none transition focus:border-pink-300 focus:bg-white focus:shadow-[0_0_0_4px_rgba(244,114,182,0.12)]"
                  >
                    <option value="SPRING">
                      {THEME_LABEL.SPRING}
                    </option>

                    <option value="SUMMER">
                      {THEME_LABEL.SUMMER}
                    </option>

                    <option value="AUTUMN">
                      {THEME_LABEL.AUTUMN}
                    </option>

                    <option value="WINTER">
                      {THEME_LABEL.WINTER}
                    </option>

                    <option value="LAVENDER">
                      {THEME_LABEL.LAVENDER}
                    </option>

                    <option value="DEW">
                      {THEME_LABEL.DEW}
                    </option>

                    <option value="SAND">
                      {THEME_LABEL.SAND}
                    </option>

                    <option value="MOONLIGHT">
                      {THEME_LABEL.MOONLIGHT}
                    </option>
                  </select>

                  <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                    테마를 변경하면 오른쪽 미리보기의 색상과 저금통 장식도 함께 바뀌어요.
                  </p>
                </div>

                {/* 최대 인원 */}
                <div
                  /*
                   * JAR_CREATE 여섯 번째 단계에서
                   * 최대 인원 입력 영역만 따로 강조한다.
                   */
                  ref={maxMembersTutorialTargetRef}
                  className={`rounded-[22px] transition ${
                    isCurrentJarCreateTutorialTarget(
                      JAR_CREATE_TUTORIAL_TARGET.MAX_MEMBERS
                    )
                      ? "ring-4 ring-white/90"
                      : ""
                  }`}
                >
                  <label className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700">
                    <span className="text-base">
                      👥
                    </span>

                    최대 인원
                  </label>

                  <input
                    type="number"
                    name="maxMembers"
                    value={form.maxMembers}
                    onChange={handleChange}
                    min={2}
                    max={50}
                    className="w-full rounded-[18px] border border-white/80 bg-white/85 px-4 py-3.5 text-slate-800 shadow-sm outline-none transition focus:border-pink-300 focus:bg-white focus:shadow-[0_0_0_4px_rgba(244,114,182,0.12)]"
                    required
                  />

                  <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                    방장을 포함해 최소 2명부터 최대 50명까지 함께할 수 있어요.
                  </p>
                </div>

                {/* 오픈 날짜 */}
                <div
                  /*
                   * JAR_CREATE 일곱 번째 단계에서
                   * 오픈 날짜 입력 영역만 따로 강조한다.
                   */
                  ref={openAtTutorialTargetRef}
                  className={`rounded-[22px] transition md:col-span-2 ${
                    isCurrentJarCreateTutorialTarget(
                      JAR_CREATE_TUTORIAL_TARGET.OPEN_AT
                    )
                      ? "ring-4 ring-white/90"
                      : ""
                  }`}
                >
                  <label className="mb-2 flex items-center gap-2 text-sm font-black text-slate-700">
                    <span className="text-base">
                      📅
                    </span>

                    오픈 날짜
                  </label>

                  <input
                    type="datetime-local"
                    name="openAt"
                    value={form.openAt}
                    onChange={handleChange}
                    className="w-full rounded-[18px] border border-white/80 bg-white/85 px-4 py-3.5 text-slate-800 shadow-sm outline-none transition focus:border-pink-300 focus:bg-white focus:shadow-[0_0_0_4px_rgba(244,114,182,0.12)]"
                    required
                  />

                  <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                    설정한 날짜가 되면 저금통이 열리고 담아둔 추억을 확인할 수 있어요.
                  </p>
                </div>
              </div>

              {/* 저금통 만들기 버튼 */}
              <div className="mt-8 flex justify-end">
                <motion.button
                  /*
                   * JAR_CREATE 여덟 번째 단계에서
                   * 실제 저금통 만들기 버튼을 강조한다.
                   */
                  ref={submitTutorialTargetRef}
                  type="submit"
                  disabled={
                    loading ||
                    isJarCreateTutorialSaving
                  }
                  whileHover={{
                    scale:
                      loading ||
                      isJarCreateTutorialSaving
                        ? 1
                        : 1.03,
                  }}
                  whileTap={{
                    scale:
                      loading ||
                      isJarCreateTutorialSaving
                        ? 1
                        : 0.97,
                  }}
                  className={`rounded-2xl bg-gradient-to-r from-pink-500 to-orange-400 px-7 py-3.5 text-sm font-black text-white shadow-[0_10px_22px_rgba(244,114,89,0.30)] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isCurrentJarCreateTutorialTarget(
                      JAR_CREATE_TUTORIAL_TARGET.SUBMIT
                    )
                      ? "ring-4 ring-white"
                      : ""
                  }`}
                >
                  {loading
                    ? "만드는 중..."
                    : "저금통 만들기"}
                </motion.button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}