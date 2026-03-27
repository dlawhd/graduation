// src/pages/JarDetailPage.jsx

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";

// 영어 enum 값을 화면용 한글로 바꿔주는 작은 사전
const OPEN_MODE_LABEL = {
  ALL_AT_ONCE: "한 번에 전체 공개",
  DAILY_DRAW: "하루 1장 랜덤 공개",
};

const LOCK_LEVEL_LABEL = {
  HIDDEN: "완전 비밀",
  META_ONLY: "메타만 공개",
  TITLE_ONLY: "제목만 공개",
};

const ROLE_LABEL = {
  OWNER: "방장",
  ADMIN: "관리자",
  MEMBER: "멤버",
};

const THEME_LABEL = {
  COUPLE: "커플 추억",
  FRIEND: "친구 우정",
  FAMILY: "가족 추억",
  CUSTOM: "직접 만든 저금통",
};

// 날짜를 보기 좋게 바꿔주는 함수
function formatDate(dateTime) {
  if (!dateTime) return "-";

  return new Date(dateTime).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 오픈 상태를 사람이 읽기 쉽게 정리해주는 함수
function getOpenStatus(jar) {
  if (!jar) {
    return {
      label: "확인 중",
      description: "저금통 상태를 불러오는 중이에요.",
      chipClass: "bg-slate-100 text-slate-600",
    };
  }

  if (jar.isOpen) {
    return {
      label: "OPEN",
      description: "지금은 저금통이 열려 있어요.",
      chipClass: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: "LOCKED",
    description: "아직은 저금통이 잠겨 있어요.",
    chipClass: "bg-amber-100 text-amber-700",
  };
}

// 저금통 종류(theme)에 따라 큰 카드와 저금통 색을 정해줘.
function getThemePalette(theme) {
  if (theme === "COUPLE") {
    return {
      hero: "from-rose-100 via-pink-50 to-orange-50 border-rose-200",
      badge: "bg-gradient-to-r from-rose-400 to-orange-400 text-white",
      jarBody: "bg-gradient-to-b from-rose-100 via-pink-50 to-white border-rose-200",
      lid: "bg-gradient-to-r from-rose-400 to-orange-400",
      floating: "bg-rose-200/60",
    };
  }

  if (theme === "FRIEND") {
    return {
      hero: "from-sky-100 via-cyan-50 to-indigo-50 border-sky-200",
      badge: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white",
      jarBody: "bg-gradient-to-b from-sky-100 via-cyan-50 to-white border-sky-200",
      lid: "bg-gradient-to-r from-sky-500 to-indigo-500",
      floating: "bg-sky-200/60",
    };
  }

  if (theme === "FAMILY") {
    return {
      hero: "from-emerald-100 via-lime-50 to-amber-50 border-emerald-200",
      badge: "bg-gradient-to-r from-emerald-500 to-lime-500 text-white",
      jarBody: "bg-gradient-to-b from-emerald-100 via-lime-50 to-white border-emerald-200",
      lid: "bg-gradient-to-r from-emerald-500 to-lime-500",
      floating: "bg-emerald-200/60",
    };
  }

  return {
    hero: "from-violet-100 via-fuchsia-50 to-pink-50 border-violet-200",
    badge: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white",
    jarBody: "bg-gradient-to-b from-violet-100 via-fuchsia-50 to-white border-violet-200",
    lid: "bg-gradient-to-r from-violet-500 to-fuchsia-500",
    floating: "bg-violet-200/60",
  };
}

// 저금통 종류마다 가운데 대표 이모지를 하나씩 보여줘.
function getThemeEmoji(theme) {
  if (theme === "COUPLE") return "💞";
  if (theme === "FRIEND") return "⭐";
  if (theme === "FAMILY") return "🏡";
  return "✨";
}


// 저금통 안쪽에 보이는 작은 장식들
function JarVisual({ jar }) {
  const palette = getThemePalette(jar?.theme);

  return (
    <div className="relative mx-auto flex h-[320px] w-[260px] items-center justify-center">
      {/* 뒤쪽 둥근 빛 */}
      <div
        className={`absolute inset-6 rounded-full blur-3xl ${palette.floating}`}
      />

      {/* 반짝이 장식 */}
      <div className="absolute left-6 top-10 text-2xl">✨</div>
      <div className="absolute right-8 top-16 text-xl">💛</div>
      <div className="absolute left-10 bottom-16 text-xl">🌿</div>

      {/* 뚜껑 */}
      <div
        className={`absolute top-[48px] z-20 h-10 w-36 rounded-full ${palette.lid} shadow-lg`}
      />
      <div className="absolute top-[60px] z-30 h-2 w-14 rounded-full bg-slate-700/80" />

      {/* 저금통 몸통 */}
      <div
        className={`relative z-10 mt-8 h-[210px] w-[180px] rounded-[42%_42%_28%_28%] border-4 ${palette.jarBody} shadow-[0_20px_50px_rgba(15,23,42,0.12)]`}
      >
        {/* 유리 느낌 하이라이트 */}
        <div className="absolute left-6 top-6 h-24 w-8 rounded-full bg-white/60 blur-sm" />
        <div className="absolute right-8 top-10 h-16 w-4 rounded-full bg-white/40 blur-sm" />

        {/* 안쪽 아이콘 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="text-5xl">
            {getThemeEmoji(jar?.theme)}
          </div>

          <div className="rounded-full bg-white/80 px-4 py-2 text-sm font-bold text-slate-700 shadow">
            {jar?.isOpen ? "열린 저금통" : "잠긴 저금통"}
          </div>

          <div className="text-center text-xs text-slate-500">
            {ROLE_LABEL[jar?.myRole] || jar?.myRole}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-700">{value || "-"}</p>
    </div>
  );
}

export default function JarDetailPage() {
  // 주소에서 jarId 꺼내기
  const { jarId } = useParams();

  // 페이지 이동용
  const navigate = useNavigate();

  // 서버에서 받아온 상세 정보 저장
  const [jar, setJar] = useState(null);

  // 로딩 상태
  const [loading, setLoading] = useState(true);

  // 일반 에러 문구
  const [error, setError] = useState("");

  // 삭제 버튼 눌렀을 때 따로 로딩 표시
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 상세 데이터 불러오기
  useEffect(() => {
    async function loadJarDetail() {
      setLoading(true);
      setError("");

      try {
        const res = await apiClient.get(`/api/v1/jars/${jarId}`);

        // 우리 서버 응답은 { data: { ... } } 구조
        const data = res.data?.data;
        setJar(data || null);
      } catch (e) {
        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "저금통 정보를 불러오지 못했어요.";

        setError(serverMessage);
        setJar(null);
      } finally {
        setLoading(false);
      }
    }

    loadJarDetail();
  }, [jarId]);

  // 삭제 버튼 클릭
  async function handleDelete() {
    const ok = window.confirm(
      "이 저금통을 삭제하면 되돌리기 어려울 수 있어요.\n정말 삭제할까요?"
    );

    if (!ok) return;

    setDeleteLoading(true);

    try {
      // DELETE 같은 요청은 CSRF 토큰을 먼저 받아두는 흐름을 맞춰주는 게 안전해요.
      await fetchCsrf();
      await apiClient.delete(`/api/v1/jars/${jarId}`);

      window.alert("저금통이 삭제되었어요.");
      navigate("/jars", { replace: true });
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "저금통 삭제에 실패했어요.";

      window.alert(serverMessage);
    } finally {
      setDeleteLoading(false);
    }
  }

  const openStatus = useMemo(() => getOpenStatus(jar), [jar]);
  const palette = useMemo(() => getThemePalette(jar?.theme), [jar]);

  // 인원 진행률 계산
  const memberPercent = useMemo(() => {
    if (!jar?.maxMembers) return 0;
    return Math.min(100, Math.round((jar.memberCount / jar.maxMembers) * 100));
  }, [jar]);

  // 삭제 버튼은 OWNER일 때만 보여주기
  const canDelete = jar?.myRole === "OWNER";

  // 로딩 화면
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-b from-rose-50 via-white to-orange-50 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="animate-pulse rounded-[32px] border border-white bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="mb-6 h-5 w-28 rounded-full bg-slate-200" />
            <div className="mb-4 h-10 w-72 rounded-2xl bg-slate-200" />
            <div className="mb-10 h-5 w-96 rounded-full bg-slate-100" />

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="h-[360px] rounded-[28px] bg-slate-100" />
              <div className="space-y-4">
                <div className="h-24 rounded-[24px] bg-slate-100" />
                <div className="h-24 rounded-[24px] bg-slate-100" />
                <div className="h-24 rounded-[24px] bg-slate-100" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 에러 화면
  if (error || !jar) {
    return (
      <div className="min-h-[calc(100vh-80px)] bg-gradient-to-b from-rose-50 via-white to-orange-50 px-6 py-10">
        <div className="mx-auto max-w-3xl rounded-[32px] border border-rose-100 bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="mb-4 text-5xl">🥲</div>
          <h1 className="mb-3 text-2xl font-extrabold text-slate-800">
            저금통 정보를 불러오지 못했어요
          </h1>
          <p className="mb-8 text-sm leading-7 text-slate-500">
            {error || "요청한 저금통이 없거나 접근할 수 없어요."}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/jars"
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              목록으로 돌아가기
            </Link>

            <button
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-gradient-to-r from-rose-400 to-orange-400 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.02]"
            >
              다시 시도하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-gradient-to-b from-rose-50 via-white to-orange-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        {/* 상단 이동 링크 */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            to="/jars"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
          >
            ← 저금통 목록으로
          </Link>

          <div
            className={`rounded-full px-4 py-2 text-xs font-extrabold tracking-[0.2em] ${openStatus.chipClass}`}
          >
            {openStatus.label}
          </div>
        </div>

        {/* 메인 카드 */}
        <div
          className={`overflow-hidden rounded-[36px] border bg-gradient-to-br ${palette.hero} shadow-[0_24px_70px_rgba(15,23,42,0.10)]`}
        >
          <div className="grid gap-8 p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
            {/* 왼쪽: 분위기 + 큰 저금통 */}
            <section>
              <div className="mb-4 flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${palette.badge}`}
                >
                  {THEME_LABEL[jar.theme] || jar.theme}
                </span>

                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                  {ROLE_LABEL[jar.myRole] || jar.myRole}
                </span>

                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">
                  {OPEN_MODE_LABEL[jar.openMode] || jar.openMode}
                </span>
              </div>

              <h1 className="mb-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">
                {jar.name}
              </h1>

              <p className="mb-8 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                {jar.description || "아직 설명이 없는 저금통이에요."}
              </p>

              <div className="mb-6 rounded-[28px] border border-white/70 bg-white/70 p-5 backdrop-blur-sm">
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                  현재 상태
                </p>
                <p className="mb-1 text-lg font-extrabold text-slate-800">
                  {openStatus.description}
                </p>
                <p className="text-sm text-slate-500">
                  오픈 예정 날짜: {formatDate(jar.openAt)}
                </p>
              </div>

              <JarVisual jar={jar} />

              <div className="mt-6 rounded-[28px] border border-white/70 bg-white/70 p-5 backdrop-blur-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-extrabold text-slate-800">
                    참여 인원 현황
                  </p>
                  <p className="text-sm font-bold text-slate-500">
                    {jar.memberCount} / {jar.maxMembers}명
                  </p>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${palette.badge}`}
                    style={{ width: `${memberPercent}%` }}
                  />
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  이 저금통은 최대 {jar.maxMembers}명까지 함께할 수 있어요.
                </p>
              </div>
            </section>

            {/* 오른쪽: 정보 카드들 */}
            <aside className="space-y-5">
              <div className="rounded-[30px] border border-white/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm">
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  한눈에 보는 저금통 정보
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem
                    label="저금통 ID"
                    value={jar.jarId}
                  />
                  <InfoItem
                    label="내 역할"
                    value={ROLE_LABEL[jar.myRole] || jar.myRole}
                  />
                  <InfoItem
                    label="테마"
                    value={THEME_LABEL[jar.theme] || jar.theme}
                  />
                  <InfoItem
                    label="잠금 레벨"
                    value={LOCK_LEVEL_LABEL[jar.lockLevel] || jar.lockLevel}
                  />
                  <InfoItem
                    label="공개 방식"
                    value={OPEN_MODE_LABEL[jar.openMode] || jar.openMode}
                  />
                  <InfoItem
                    label="상태"
                    value={jar.isOpen ? "공개됨" : "잠겨 있음"}
                  />
                </div>
              </div>

              <div className="rounded-[30px] border border-white/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm">
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  시간 정보
                </p>

                <div className="space-y-3">
                  <InfoItem
                    label="생성일"
                    value={formatDate(jar.createdAt)}
                  />
                  <InfoItem
                    label="최근 수정일"
                    value={formatDate(jar.updatedAt)}
                  />
                  <InfoItem
                    label="오픈일"
                    value={formatDate(jar.openAt)}
                  />
                </div>
              </div>

              <div className="rounded-[30px] border border-white/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm">
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  빠른 동작
                </p>

                <div className="grid gap-3">
                  <Link
                    to="/jars"
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    목록으로 돌아가기
                  </Link>

                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      disabled={deleteLoading}
                      className="rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleteLoading ? "삭제하는 중..." : "저금통 삭제하기"}
                    </button>
                  )}

                  {!canDelete && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      삭제는 방장만 할 수 있어요.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[30px] border border-dashed border-rose-200 bg-white/70 p-6">
                <p className="mb-2 text-sm font-extrabold text-slate-800">
                  다음에 더 붙이면 좋은 것
                </p>
                <p className="text-sm leading-7 text-slate-500">
                  멤버 목록, 초대 코드, 메모 카드 미리보기까지 들어가면
                  상세 페이지가 더 꽉 찬 느낌이 돼요.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}