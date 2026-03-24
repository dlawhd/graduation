import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";

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

const JAR_TEMPLATES = [
  {
    id: 1,
    emoji: "💞",
    title: "커플 추억 저금통",
    summary: "둘만의 사진, 메모, 기념일 이야기를 담아둘 수 있어요.",
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
    emoji: "🎉",
    title: "친구 우정 저금통",
    summary: "친구들과 메시지와 추억을 모으는 공간이에요.",
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
    emoji: "🏡",
    title: "가족 추억 저금통",
    summary: "가족 여행, 생일, 특별한 날들을 기록해요.",
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
    emoji: "✨",
    title: "직접 만들기",
    summary: "내가 원하는 방식으로 처음부터 직접 설정할 수 있어요.",
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

export default function JarsNewPage() {
  const navigate = useNavigate();

  const emptyForm = useMemo(
    () => ({
      name: "",
      description: "",
      theme: "BASIC",
      maxMembers: 2,
      openAt: "",
      openMode: "ALL_AT_ONCE",
      lockLevel: "HIDDEN",
    }),
    []
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTemplateClick = (template) => {
    setSelectedTemplateId(template.id);
    setForm({
      ...template.values,
      openAt: "",
    });
    setError("");
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: name === "maxMembers" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-orange-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        {/* 상단 소개 카드 */}
        <div className="mb-8 overflow-hidden rounded-[28px] bg-white/80 p-8 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 inline-block rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-600">
                새로운 추억 시작하기
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                새 저금통 만들기
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                먼저 마음에 드는 후보를 골라보고,
                <br className="hidden md:block" />
                아래 폼에서 내 스타일대로 수정해서 저금통을 완성해보자.
              </p>
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-rose-100 to-orange-100 px-6 py-5 text-center">
              <div className="text-4xl">🫙</div>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                추억을 차곡차곡
              </p>
            </div>
          </div>
        </div>

        {/* 후보 카드 */}
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold text-slate-800">
            어떤 저금통을 만들고 싶어?
          </h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {JAR_TEMPLATES.map((template) => {
              const isSelected = selectedTemplateId === template.id;

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleTemplateClick(template)}
                  className={`group rounded-[24px] border p-5 text-left transition-all duration-200 ${
                    isSelected
                      ? "border-rose-300 bg-gradient-to-br from-rose-100 to-orange-50 shadow-[0_10px_24px_rgba(244,114,182,0.16)]"
                      : "border-white bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)] hover:-translate-y-1 hover:border-rose-100 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-3xl">{template.emoji}</span>
                    {isSelected && (
                      <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-bold text-white">
                        선택됨
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-slate-800">
                    {template.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {template.summary}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 입력 폼 */}
        <form
          onSubmit={handleSubmit}
          className="rounded-[28px] bg-white p-6 shadow-[0_10px_30px_rgba(0,0,0,0.06)] md:p-8"
        >
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-800">저금통 정보 입력</h2>
            <p className="mt-2 text-sm text-slate-500">
              선택한 후보를 바탕으로 자유롭게 수정하면 돼.
            </p>
          </div>

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
                maxLength={40}
                placeholder="예: 우리의 추억 저금통"
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
                maxLength={200}
                rows={4}
                placeholder="이 저금통에 어떤 추억을 담을지 적어주세요."
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
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "만드는 중..." : "저금통 만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}