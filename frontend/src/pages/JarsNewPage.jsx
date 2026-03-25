import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import apiClient, { fetchCsrf } from "../api/apiClient";

// ===============================
// 화면용 한글 라벨
// ===============================
const THEME_LABEL = {
  BASIC: "기본",
  SPRING: "봄",
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

// ===============================
// 저금통 템플릿 4종
// ===============================
const JAR_TEMPLATES = [
  {
    id: 1,
    type: "COUPLE",
    emoji: "💞",
    title: "커플 추억 저금통",
    summary: "둘만의 사진, 메모, 기념일 이야기를 담아둘 수 있어요.",
    previewTitle: "우리 둘만의 추억 보관함",
    previewDesc: "하트와 편지, 말랑한 분위기의 로맨틱 저금통",
    values: {
      name: "우리의 추억 저금통",
      description: "함께한 소중한 순간을 하나씩 모아둘래요.",
      theme: "SPRING",
      maxMembers: 2,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "TITLE_ONLY",
    },
  },
  {
    id: 2,
    type: "FRIEND",
    emoji: "🎉",
    title: "친구 우정 저금통",
    summary: "친구들과 메시지와 추억을 모으는 공간이에요.",
    previewTitle: "우리 우정 타임캡슐",
    previewDesc: "별, 말풍선, 축하 느낌이 살아있는 신나는 저금통",
    values: {
      name: "우정 저금통",
      description: "서로에게 남기고 싶은 말들을 모아보자.",
      theme: "BASIC",
      maxMembers: 4,
      openAt: "",
      openMode: "DAILY_DRAW",
      lockLevel: "META_ONLY",
    },
  },
  {
    id: 3,
    type: "FAMILY",
    emoji: "🏡",
    title: "가족 추억 저금통",
    summary: "가족 여행, 생일, 특별한 날들을 기록해요.",
    previewTitle: "우리 가족 보물상자",
    previewDesc: "집, 잎사귀, 햇살 느낌이 담긴 포근한 저금통",
    values: {
      name: "가족 추억 저금통",
      description: "우리 가족의 특별한 이야기를 담아둘 공간이에요.",
      theme: "SPRING",
      maxMembers: 5,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "HIDDEN",
    },
  },
  {
    id: 4,
    type: "CUSTOM",
    emoji: "✨",
    title: "직접 만들기",
    summary: "내가 원하는 방식으로 처음부터 직접 설정할 수 있어요.",
    previewTitle: "나만의 커스텀 저금통",
    previewDesc: "반짝임과 자유로운 분위기의 커스텀 저금통",
    values: {
      name: "",
      description: "",
      theme: "BASIC",
      maxMembers: 2,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "HIDDEN",
    },
  },
];

// ===============================
// datetime-local -> 서버용 문자열 변환
// ===============================
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

// ===============================
// 타입별 색감
// ===============================
function getPalette(type, theme) {
  const basic = {
    bg: "from-sky-100 via-cyan-50 to-indigo-50",
    border: "border-sky-200",
    lid: "from-sky-500 to-indigo-500",
    glass: "from-sky-100 via-cyan-50 to-white",
    chip: "bg-sky-100 text-sky-700",
    glow: "bg-sky-200/60",
  };

  const spring = {
    bg: "from-rose-100 via-pink-50 to-orange-50",
    border: "border-rose-200",
    lid: "from-rose-400 to-orange-400",
    glass: "from-rose-100 via-pink-50 to-white",
    chip: "bg-rose-100 text-rose-700",
    glow: "bg-rose-200/60",
  };

  const base = theme === "SPRING" ? spring : basic;

  if (type === "FRIEND") {
    return {
      ...base,
      lid: theme === "SPRING" ? "from-orange-400 to-pink-400" : "from-cyan-500 to-blue-500",
      chip: theme === "SPRING" ? "bg-orange-100 text-orange-700" : "bg-cyan-100 text-cyan-700",
      glow: theme === "SPRING" ? "bg-orange-200/60" : "bg-cyan-200/60",
    };
  }

  if (type === "FAMILY") {
    return {
      ...base,
      lid: theme === "SPRING" ? "from-emerald-400 to-lime-400" : "from-teal-500 to-cyan-500",
      chip: theme === "SPRING" ? "bg-emerald-100 text-emerald-700" : "bg-teal-100 text-teal-700",
      glow: theme === "SPRING" ? "bg-emerald-200/60" : "bg-teal-200/60",
    };
  }

  if (type === "CUSTOM") {
    return {
      ...base,
      lid: "from-violet-500 to-fuchsia-500",
      chip: "bg-violet-100 text-violet-700",
      glow: "bg-violet-200/60",
    };
  }

  return base;
}

// ===============================
// 떠다니는 작은 장식
// ===============================
function getVisualPreset(type, theme) {
  const isSpring = theme === "SPRING";

  if (type === "COUPLE") {
    return {
      cardStyle: {
        background: isSpring
          ? "linear-gradient(135deg, #ffe4ec 0%, #fff1f6 45%, #fff7ed 100%)"
          : "linear-gradient(135deg, #ffe4ec 0%, #fdf2f8 45%, #f5f3ff 100%)",
      },
      chipClass: "bg-pink-100 text-pink-700",
      glowStyle: {
        background: "rgba(255, 105, 180, 0.25)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #ff5f8f 0%, #ff9a62 100%)",
      },
      bodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,235,242,0.96) 50%, rgba(255,247,237,0.98) 100%)",
      },
      centerEmoji: "💞",
      deco: [
        { x: "28px", y: "88px", emoji: "💌", delay: 0 },
        { x: "248px", y: "96px", emoji: "💖", delay: 0.3 },
        { x: "40px", y: "262px", emoji: "✨", delay: 0.5 },
        { x: "256px", y: "248px", emoji: "🌷", delay: 0.2 },
      ],
    };
  }

  if (type === "FRIEND") {
    return {
      cardStyle: {
        background: isSpring
          ? "linear-gradient(135deg, #fff7ed 0%, #fff1f2 45%, #eff6ff 100%)"
          : "linear-gradient(135deg, #e0f2fe 0%, #ecfeff 45%, #eef2ff 100%)",
      },
      chipClass: "bg-cyan-100 text-cyan-700",
      glowStyle: {
        background: "rgba(34, 211, 238, 0.25)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #22c1c3 0%, #3b82f6 100%)",
      },
      bodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(224,242,254,0.96) 55%, rgba(238,242,255,0.98) 100%)",
      },
      centerEmoji: "🎊",
      deco: [
        { x: "24px", y: "88px", emoji: "⭐", delay: 0 },
        { x: "250px", y: "98px", emoji: "💬", delay: 0.3 },
        { x: "42px", y: "264px", emoji: "🎈", delay: 0.5 },
        { x: "254px", y: "246px", emoji: "🎉", delay: 0.2 },
      ],
    };
  }

  if (type === "FAMILY") {
    return {
      cardStyle: {
        background: isSpring
          ? "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 45%, #fffbeb 100%)"
          : "linear-gradient(135deg, #dcfce7 0%, #ecfeff 45%, #f0fdf4 100%)",
      },
      chipClass: "bg-emerald-100 text-emerald-700",
      glowStyle: {
        background: "rgba(16, 185, 129, 0.22)",
      },
      lidStyle: {
        background: "linear-gradient(90deg, #34d399 0%, #a3e635 100%)",
      },
      bodyStyle: {
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(236,253,245,0.96) 55%, rgba(255,251,235,0.98) 100%)",
      },
      centerEmoji: "🏠",
      deco: [
        { x: "26px", y: "92px", emoji: "🏡", delay: 0 },
        { x: "252px", y: "94px", emoji: "🌿", delay: 0.3 },
        { x: "40px", y: "266px", emoji: "☀️", delay: 0.5 },
        { x: "254px", y: "248px", emoji: "💛", delay: 0.2 },
      ],
    };
  }

  return {
    cardStyle: {
      background: isSpring
        ? "linear-gradient(135deg, #f5f3ff 0%, #fdf4ff 45%, #fff7ed 100%)"
        : "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 45%, #faf5ff 100%)",
    },
    chipClass: "bg-violet-100 text-violet-700",
    glowStyle: {
      background: "rgba(139, 92, 246, 0.24)",
    },
    lidStyle: {
      background: "linear-gradient(90deg, #8b5cf6 0%, #d946ef 100%)",
    },
    bodyStyle: {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(245,243,255,0.96) 55%, rgba(250,245,255,0.98) 100%)",
    },
    centerEmoji: "✨",
    deco: [
      { x: "26px", y: "90px", emoji: "✨", delay: 0 },
      { x: "250px", y: "96px", emoji: "🎨", delay: 0.3 },
      { x: "42px", y: "264px", emoji: "🌈", delay: 0.5 },
      { x: "254px", y: "246px", emoji: "🪄", delay: 0.2 },
    ],
  };
}

function OrbitIcon({ left, top, delay, children }) {
  return (
    <motion.div
      className="absolute text-2xl"
      style={{ left, top }}
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

function JarIllustration({ template, form }) {
  const preset = getVisualPreset(template.type, form.theme);

  return (
    <div className="relative mx-auto h-[380px] w-[320px]">
      {/* 뒤쪽 빛 */}
      <motion.div
        className="absolute left-1/2 top-[88px] h-[200px] w-[200px] -translate-x-1/2 rounded-full blur-3xl"
        style={preset.glowStyle}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* 장식들 - 이번엔 저금통 주변으로 확실히 고정 */}
      {preset.deco.map((item, index) => (
        <OrbitIcon
          key={`${item.emoji}-${index}`}
          left={item.x}
          top={item.y}
          delay={item.delay}
        >
          {item.emoji}
        </OrbitIcon>
      ))}

      {/* 저금통 본체 */}
      <motion.div
        className="absolute left-1/2 top-[54px] -translate-x-1/2"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="relative h-[280px] w-[210px]">
          {/* 뚜껑 */}
          <div
            className="absolute left-1/2 top-[0px] z-20 h-[42px] w-[160px] -translate-x-1/2 rounded-full shadow-xl"
            style={preset.lidStyle}
          />
          <div className="absolute left-1/2 top-[14px] z-30 h-[7px] w-[54px] -translate-x-1/2 rounded-full bg-slate-700/80" />

          {/* 몸통 */}
          <div
            className="absolute left-1/2 top-[34px] z-10 h-[225px] w-[180px] -translate-x-1/2 rounded-[44%_44%_30%_30%] border-[5px] border-white/70 shadow-[0_22px_45px_rgba(15,23,42,0.18)]"
            style={preset.bodyStyle}
          >
            {/* 유리 반짝임 */}
            <div className="absolute left-[18px] top-[22px] h-[120px] w-[12px] rounded-full bg-white/70 blur-[2px]" />
            <div className="absolute right-[18px] top-[34px] h-[80px] w-[8px] rounded-full bg-white/45 blur-[2px]" />

            {/* 안쪽 내용 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="text-5xl">{preset.centerEmoji}</div>

              <div className="rounded-full bg-white/90 px-4 py-2 text-xs font-bold text-slate-700 shadow">
                {LOCK_LEVEL_LABEL[form.lockLevel]}
              </div>

              <div className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-500">
                {OPEN_MODE_LABEL[form.openMode]}
              </div>

              <div className="text-xs font-semibold text-slate-500">
                최대 {form.maxMembers}명
              </div>
            </div>
          </div>

          {/* 아래 그림자 */}
          <div className="absolute bottom-[0px] left-1/2 h-[18px] w-[120px] -translate-x-1/2 rounded-full bg-slate-300/35 blur-md" />
        </div>
      </motion.div>
    </div>
  );
}

function JarPreview({ template, form }) {
  const preset = getVisualPreset(template.type, form.theme);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${template.type}-${form.theme}-${form.lockLevel}-${form.openMode}`}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.98 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="overflow-hidden rounded-[32px] border border-white/70 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]"
        style={preset.cardStyle}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${preset.chipClass}`}>
            {template.emoji} {template.title}
          </span>

          <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-bold text-slate-600">
            {THEME_LABEL[form.theme]}
          </span>
        </div>

        <h3 className="text-2xl font-black text-slate-800">
          {form.name || template.previewTitle}
        </h3>

        <p className="mt-2 text-sm leading-7 text-slate-600">
          {form.description || template.previewDesc}
        </p>

        <JarIllustration template={template} form={form} />

        <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
          <p className="text-sm font-bold text-slate-700">{template.previewTitle}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
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

  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplate.id);
  const [form, setForm] = useState({
    ...defaultTemplate.values,
    openAt: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedTemplate = useMemo(() => {
    return (
      JAR_TEMPLATES.find((template) => template.id === selectedTemplateId) ||
      defaultTemplate
    );
  }, [selectedTemplateId]);

  function handleTemplateClick(template) {
    setSelectedTemplateId(template.id);
    setForm({
      ...template.values,
      openAt: form.openAt, // 날짜는 사용자가 이미 골랐으면 유지
    });
    setError("");
  }

  function handleChange(e) {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: name === "maxMembers" ? Number(value) : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await fetchCsrf();

      const payload = {
        ...form,
        openAt: toOffsetDateTimeString(form.openAt),
      };

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
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-b from-rose-50 via-white to-orange-50 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        {/* 상단 소개 */}
        <section className="mb-8 rounded-[32px] border border-white bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <div className="mb-3 inline-flex rounded-full bg-rose-100 px-4 py-2 text-xs font-extrabold tracking-[0.18em] text-rose-700">
            새로운 추억 시작하기
          </div>

          <h1 className="mb-3 text-3xl font-black text-slate-800 md:text-4xl">
            새 저금통 만들기
          </h1>

          <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
            먼저 분위기에 맞는 저금통을 골라봐. 고르는 순간 오른쪽 미리보기가 바로 바뀌고,
            아래 설정을 조금만 다듬으면 바로 만들 수 있어.
          </p>
        </section>

        {/* 카드 + 미리보기 */}
        <section className="mb-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          {/* 왼쪽 카드 목록 */}
          <div>
            <div className="mb-4">
              <h2 className="text-2xl font-black text-slate-800">
                어떤 저금통을 만들고 싶어?
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                4가지 중 하나를 고르면 그에 맞는 저금통이 바로 보여.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              {JAR_TEMPLATES.map((template) => {
                const isSelected = selectedTemplateId === template.id;
                const palette = getPalette(template.type, template.values.theme);

                return (
                  <motion.button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateClick(template)}
                    whileHover={{ y: -4, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    className={`rounded-[28px] border p-5 text-left transition-all ${
                      isSelected
                        ? `border-transparent bg-gradient-to-br ${palette.bg} shadow-[0_16px_36px_rgba(15,23,42,0.12)]`
                        : "border-white bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
                    }`}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-3xl">{template.emoji}</div>

                      {isSelected && (
                        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-rose-600">
                          선택됨
                        </span>
                      )}
                    </div>

                    <h3 className="mb-2 text-lg font-black text-slate-800">
                      {template.title}
                    </h3>

                    <p className="text-sm leading-6 text-slate-600">
                      {template.summary}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* 오른쪽 큰 미리보기 */}
          <div>
            <JarPreview template={selectedTemplate} form={form} />
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {error}
          </div>
        )}

        {/* 입력 폼 */}
        <section className="rounded-[32px] border border-white bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="mb-6">
            <h2 className="text-2xl font-black text-slate-800">저금통 정보 입력</h2>
            <p className="mt-2 text-sm text-slate-500">
              선택한 스타일을 바탕으로 이름, 설명, 공개 방식을 원하는 대로 바꿔줘.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  저금통 이름
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="예: 우리의 2026 추억 저금통"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  설명
                </label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={4}
                  placeholder="이 저금통에 어떤 추억을 담고 싶은지 적어보자."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  테마
                </label>
                <select
                  name="theme"
                  value={form.theme}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
                >
                  <option value="BASIC">{THEME_LABEL.BASIC}</option>
                  <option value="SPRING">{THEME_LABEL.SPRING}</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  최대 인원
                </label>
                <input
                  type="number"
                  name="maxMembers"
                  value={form.maxMembers}
                  onChange={handleChange}
                  min={2}
                  max={50}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  오픈 날짜
                </label>
                <input
                  type="datetime-local"
                  name="openAt"
                  value={form.openAt}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  공개 방식
                </label>
                <select
                  name="openMode"
                  value={form.openMode}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
                >
                  <option value="ALL_AT_ONCE">{OPEN_MODE_LABEL.ALL_AT_ONCE}</option>
                  <option value="DAILY_DRAW">{OPEN_MODE_LABEL.DAILY_DRAW}</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  잠금 레벨
                </label>
                <select
                  name="lockLevel"
                  value={form.lockLevel}
                  onChange={handleChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 outline-none transition focus:border-rose-300 focus:bg-white"
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
                className="rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
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