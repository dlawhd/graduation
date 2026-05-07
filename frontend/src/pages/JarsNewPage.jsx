import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import apiClient, { fetchCsrf } from "../api/apiClient";

// ==============================
// 화면에 보여줄 한글 라벨
// ==============================
const THEME_LABEL = {
  // 새 테마 값
  SPRING: "봄",
  SUMMER: "여름",
  LAVENDER: "라벤더",
  WINTER: "겨울",

  // 예전 값 호환용
  // 혹시 기존 데이터가 잠깐 들어와도 화면이 깨지지 않게 남겨둔다.
  COUPLE: "봄",
  FRIEND: "겨울",
  FAMILY: "여름",
  CUSTOM: "라벤더",
};

const OPEN_MODE_LABEL = {
  ALL_AT_ONCE: "한 번에 전체 공개",
  DAILY_DRAW: "하루 1장 랜덤 공개",
};

const LOCK_LEVEL_LABEL = {
  HIDDEN: "완전 비밀",
  META_ONLY: "메타만 공개",
  TITLE_ONLY: "제목만 공개",
};

// ==============================
// 4가지 저금통 템플릿
// ==============================
// 지금 화면에서는 먼저 4개만 보여준다.
// SPRING  = 기존 커플 추억
// WINTER  = 기존 친구 우정
// SUMMER  = 기존 가족 추억
// LAVENDER = 기존 직접 만들기
const JAR_TEMPLATES = [
  {
    id: 1,
    type: "SPRING",
    emoji: "🌸",
    title: "봄 저금통",
    summary: "분홍빛 봄처럼 따뜻한 추억을 담아둘 수 있어요.",
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
    type: "WINTER",
    emoji: "❄️",
    title: "겨울 저금통",
    summary: "친구들과의 반짝이는 우정과 메시지를 모으는 공간이에요.",
    previewTitle: "우리 겨울 우정 타임캡슐",
    previewDesc: "눈, 별, 말풍선 느낌이 살아있는 시원한 우정 저금통",
    values: {
      name: "겨울 우정 저금통",
      description: "서로에게 남기고 싶은 말들을 차곡차곡 모아보자.",
      theme: "WINTER",
      maxMembers: 4,
      openAt: "",
      openMode: "DAILY_DRAW",
      lockLevel: "META_ONLY",
    },
  },
  {
    id: 3,
    type: "SUMMER",
    emoji: "🌿",
    title: "여름 저금통",
    summary: "가족 여행, 생일, 특별한 날들을 싱그럽게 기록해요.",
    previewTitle: "우리 가족 여름 보물상자",
    previewDesc: "잎사귀, 햇살, 집의 포근함이 담긴 가족 저금통",
    values: {
      name: "여름 가족 추억 저금통",
      description: "우리 가족의 특별한 이야기를 싱그럽게 담아둘 공간이에요.",
      theme: "SUMMER",
      maxMembers: 5,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "HIDDEN",
    },
  },
  {
    id: 4,
    type: "LAVENDER",
    emoji: "💜",
    title: "라벤더 저금통",
    summary: "차분한 라벤더 분위기로 원하는 방식의 저금통을 만들 수 있어요.",
    previewTitle: "나만의 라벤더 저금통",
    previewDesc: "보라빛 반짝임과 자유로운 분위기의 직접 만들기 저금통",
    values: {
      name: "",
      description: "",
      theme: "LAVENDER",
      maxMembers: 2,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "HIDDEN",
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
// 저금통 theme 값만 보고, 예전에 쓰던 "style 객체 모양" 그대로 돌려주는 함수
function getVisualPreset(theme) {
  // =========================
  // 1) 커플 저금통
  // =========================
  if (theme === "SPRING" || theme === "COUPLE") {
    return {
      // 바깥 큰 미리보기 카드 배경
      previewCardStyle: {
        background:
          "linear-gradient(135deg, #fff1f4 0%, #fff7fb 45%, #fff6eb 100%)",
      },

      // 왼쪽 작은 배지 스타일
      badgeStyle: {
        backgroundColor: "#ffeff5",
        color: "#e63c74",
      },

      // 오른쪽 작은 테마 배지 스타일
      themeBadgeStyle: {
        backgroundColor: "#fff3e8",
        color: "#ff8a3d",
      },

      // 뒤쪽 번지는 빛 효과
      glowStyle: {
        background:
          "radial-gradient(circle, rgba(255,108,163,0.35) 0%, rgba(255,108,163,0.06) 65%, rgba(255,108,163,0) 100%)",
      },

      // 저금통 뚜껑 스타일
      lidStyle: {
        background: "linear-gradient(90deg, #ff6391 0%, #ffb25e 100%)",
      },

      // 저금통 몸통 스타일
      jarBodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,248,251,0.92) 55%, rgba(255,241,228,0.96) 100%)",
        border: "4px solid rgba(255,255,255,0.8)",
        boxShadow: "0 24px 45px rgba(255, 118, 160, 0.20)",
      },

      // 가운데 작은 라벨 알약 모양
      labelPillStyle: {
        backgroundColor: "rgba(255,255,255,0.92)",
        color: "#5b5560",
      },

      // 가운데 대표 이모지
      centerEmoji: "🌸",

      // 주변 장식 이모지
      decor: [

      ],

      // 포인트 선 색
      accentLine: "#ff7ea8",
    };
  }

  // =========================
  // 2) 친구 저금통
  // =========================
  if (theme === "WINTER" || theme === "FRIEND") {
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

      centerEmoji: "❄️",

      decor: [

      ],

      accentLine: "#5cb9ff",
    };
  }

  // =========================
  // 3) 가족 저금통
  // =========================
  if (theme === "SUMMER" || theme === "FAMILY") {
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

      centerEmoji: "🌿",

      decor: [

      ],

      accentLine: "#4fc26d",
    };
  }

  // =========================
  // 4) 라벤더 저금통
  // - 기존 직접 만들기(CUSTOM) 역할
  // =========================
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

    centerEmoji: "💜",

    decor: [
    ],

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
  if (theme === "SPRING" || theme === "COUPLE") {
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
  if (theme === "WINTER" || theme === "FRIEND") {
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
  if (theme === "SUMMER" || theme === "FAMILY") {
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
  if (theme === "SPRING" || theme === "COUPLE") {
    return {
      icons: ["🌸", "🌸", "💮", "🩷"],
    };
  }

  if (theme === "WINTER" || theme === "FRIEND") {
    return {
      icons: ["❄️", "❄️", "🤍", "❅"],
    };
  }

  if (theme === "SUMMER" || theme === "FAMILY") {
    return {
      icons: ["🌿", "🍃", "☘️", "💚"],
    };
  }

  return {
    icons: ["💜", "🔮", "🪻", "🟣"],
  };
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
      size: 14 + Math.random() * 7,

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
    <div className="relative mx-auto mt-4 h-[390px] w-full max-w-[430px]">
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
            animation-name: previewJarParticleFall;
            animation-duration: var(--fall-duration);
            animation-delay: var(--fall-delay);
            animation-timing-function: ease-in-out;
            animation-fill-mode: forwards;
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
        className="absolute left-1/2 top-[45px] -translate-x-1/2"
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
                className="preview-jar-particle absolute z-20 select-none"
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
                {particle.icon}
              </span>
            ))}

            {/* 안쪽 내용 */}
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3">
              <div className="text-[52px]">{preset.centerEmoji}</div>
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
        className="rounded-[28px] border border-white/70 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.10)]"
        style={preset.previewCardStyle}
      >
        {/* 뱃지 */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-extrabold"
            style={preset.badgeStyle}
          >
            {template.emoji} {template.title}
          </span>

          <span
            className="rounded-full px-3 py-1 text-xs font-extrabold"
            style={preset.themeBadgeStyle}
          >
            {THEME_LABEL[form.theme]}
          </span>
        </div>

        {/* 제목/설명 */}
        <h3 className="text-[38px] font-black leading-tight text-slate-800">
          {form.name || template.previewTitle}
        </h3>

        <p className="mt-3 text-lg leading-8 text-slate-600">
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
        <div className="rounded-[20px] bg-white/88 p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
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
  const navigate = useNavigate();

  const defaultTemplate = JAR_TEMPLATES[0];

  const [form, setForm] = useState({
      ...defaultTemplate.values,
      openAt: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedTemplate = useMemo(() => {
    return (
      JAR_TEMPLATES.find((template) => template.values.theme === form.theme) ||
      defaultTemplate
    );
  }, [form.theme, defaultTemplate]);

    // 템플릿 카드를 누르면 그 템플릿의 theme 기본값이 form에 들어가게 함
    function handleTemplateClick(template) {
      setForm((prev) => ({
        ...template.values,

        // 사용자가 이미 고른 날짜는 유지해줄게.
        openAt: prev.openAt,
      }));

      setError("");
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

      // 나중에 삭제. 오류 찾기
      console.log("=== [CREATE REQUEST] ===");
      console.log("form.openAt =", form.openAt); // input datetime-local 원본
      console.log("payload.openAt =", payload.openAt); // 서버로 보내는 최종 값
      console.log("new Date(form.openAt) =", new Date(form.openAt).toString());
      console.log("timezoneOffset =", new Date().getTimezoneOffset());

      const res = await apiClient.post("/api/v1/jars", payload);
      const createdJar = res.data?.data;

      navigate(`/jars/${createdJar.jarId}`);
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
    <div className="min-h-[calc(100vh-80px)] bg-[#f8f4ef] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        {/* 상단 소개 */}
        <section className="mb-8 rounded-[24px] bg-[#fffafb] p-8 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <div className="mb-4 inline-flex rounded-full bg-[#ffe9ef] px-4 py-2 text-xs font-extrabold text-[#ff537e]">
            새로운 추억 시작하기
          </div>

          <h1 className="text-4xl font-black text-slate-800">새 저금통 만들기</h1>

          <p className="mt-4 text-base leading-8 text-slate-600">
            먼저 분위기에 맞는 저금통을 골라봐. 고르는 순간 오른쪽 미리보기가 바로 바뀌고,
            아래 설정을 조금만 다듬으면 바로 만들 수 있어.
          </p>
        </section>

        {/* 선택 카드 + 큰 미리보기 */}
        <section className="grid gap-8 xl:grid-cols-[1fr_1.1fr]">
          {/* 왼쪽 카드 목록 */}
          <div>
            <h2 className="text-3xl font-black text-slate-800">
              어떤 저금통을 만들고 싶어?
            </h2>
            <p className="mt-2 text-base text-slate-500">
              4가지 테마 중 하나를 고르면 그에 맞는 저금통이 바로 보여.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
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
                    className={`rounded-[20px] border p-5 text-left shadow-sm transition ${
                      isSelected ? "" : "border-[#ece7e1] bg-white"
                    }`}
                    style={isSelected ? templateCardStyle.cardStyle : undefined}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-3xl">{template.emoji}</div>

                      {isSelected && (
                        <span
                          className="rounded-full px-3 py-1 text-xs font-extrabold"
                          style={templateCardStyle.badgeStyle}
                        >
                          선택됨
                        </span>
                      )}
                    </div>

                    <h3 className="text-xl font-black text-slate-800">{template.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {template.summary}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* 오른쪽 미리보기 */}
          <div>
            <JarPreview template={selectedTemplate} form={form} />
          </div>
        </section>

        {/* 에러 */}
        {error && (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {error}
          </div>
        )}

        {/* 입력 폼 */}
        <section className="mt-10 rounded-[24px] bg-white p-8 shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <h2 className="text-3xl font-black text-slate-800">저금통 정보 입력</h2>
          <p className="mt-3 text-base text-slate-500">
            선택한 스타일을 바탕으로 이름, 설명, 공개 방식을 원하는 대로 바꿔줘.
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  저금통 이름
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="예: 우리의 2026 추억 저금통"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-pink-300 focus:bg-white"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  설명
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={4}
                  placeholder="이 저금통에 어떤 추억을 담고 싶은지 적어보자."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-pink-300 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  테마
                </label>
                <select
                  name="theme"
                  value={form.theme}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-pink-300 focus:bg-white"
                >
                  <option value="SPRING">{THEME_LABEL.SPRING}</option>
                  <option value="SUMMER">{THEME_LABEL.SUMMER}</option>
                  <option value="LAVENDER">{THEME_LABEL.LAVENDER}</option>
                  <option value="WINTER">{THEME_LABEL.WINTER}</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  최대 인원
                </label>
                <input
                  type="number"
                  name="maxMembers"
                  value={form.maxMembers}
                  onChange={handleChange}
                  min={2}
                  max={50}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-pink-300 focus:bg-white"
                  required
                />
              </div>


              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                 오픈 날짜
                </label>
                <input
                  type="datetime-local"
                  name="openAt"
                  value={form.openAt}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-pink-300 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  공개 방식
                </label>
                <select
                  name="openMode"
                  value={form.openMode}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-pink-300 focus:bg-white"
                >
                  <option value="ALL_AT_ONCE">{OPEN_MODE_LABEL.ALL_AT_ONCE}</option>
                  <option value="DAILY_DRAW">{OPEN_MODE_LABEL.DAILY_DRAW}</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  잠금 레벨
                </label>
                <select
                  name="lockLevel"
                  value={form.lockLevel}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-pink-300 focus:bg-white"
                >
                  <option value="HIDDEN">{LOCK_LEVEL_LABEL.HIDDEN}</option>
                  <option value="META_ONLY">{LOCK_LEVEL_LABEL.META_ONLY}</option>
                  <option value="TITLE_ONLY">{LOCK_LEVEL_LABEL.TITLE_ONLY}</option>
                </select>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="rounded-2xl bg-gradient-to-r from-pink-500 to-orange-400 px-6 py-3 text-sm font-bold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "만드는 중..." : "저금통 만들기"}
              </motion.button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}