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

// 저금통 종류(theme)에 따라 큰 카드 + 아래 멤버/초대 카드 색까지 같이 정해줘.
function getThemePalette(theme) {
  if (theme === "COUPLE") {
    return {
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
    };
  }

  if (theme === "FRIEND") {
    return {
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
    };
  }

  if (theme === "FAMILY") {
    return {
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
    };
  }

  return {
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

function InfoItem({ label, value, className = "" }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${className}`}>
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-700">{value || "-"}</p>
    </div>
  );
}

function getInviteStatus(invite) {
  if (!invite) {
    return {
      label: "확인 중",
      className: "bg-slate-100 text-slate-600",
    };
  }

  if (invite.revokedAt) {
    return {
      label: "폐기됨",
      className: "bg-rose-100 text-rose-700",
    };
  }

  if (invite.usedCount >= invite.maxUses) {
    return {
      label: "사용 완료",
      className: "bg-slate-200 text-slate-700",
    };
  }

  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    return {
      label: "만료됨",
      className: "bg-amber-100 text-amber-700",
    };
  }

  if (invite.isActive) {
    return {
      label: "사용 가능",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: "종료됨",
    className: "bg-slate-100 text-slate-600",
  };
}

export default function JarDetailPage() {
  // 주소에서 jarId 꺼내기
  const { jarId } = useParams();

  // 페이지 이동용
  const navigate = useNavigate();

  // 서버에서 받아온 상세 정보 저장
  const [jar, setJar] = useState(null);

  // 상세 로딩 / 에러
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 삭제 버튼 눌렀을 때 따로 로딩 표시
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 멤버 목록 상태
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");

  // 초대 목록 상태
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState("");

  // 초대 생성 폼 상태
  const [inviteForm, setInviteForm] = useState({
    expiresInHours: "24",
    maxUses: "1",
  });

  const [createInviteLoading, setCreateInviteLoading] = useState(false);
  const [revokeLoadingId, setRevokeLoadingId] = useState(null);

  // 상세 데이터 불러오기
  async function loadJarDetail() {
    setLoading(true);
    setError("");

    try {
      const res = await apiClient.get(`/api/v1/jars/${jarId}`);
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

  // 멤버 목록 불러오기
  async function loadMembers() {
    setMembersLoading(true);
    setMembersError("");

    try {
      const res = await apiClient.get(`/api/v1/jars/${jarId}/members`);
      const items = res.data?.data?.items || [];
      setMembers(items);
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "멤버 목록을 불러오지 못했어요.";

      setMembersError(serverMessage);
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }

  // 초대 목록 불러오기
  async function loadInvites() {
    setInvitesLoading(true);
    setInvitesError("");

    try {
      const res = await apiClient.get(`/api/v1/jars/${jarId}/invites`);
      const items = res.data?.data?.items || [];
      setInvites(items);
    } catch (e) {
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "초대 목록을 불러오지 못했어요.";

      setInvitesError(serverMessage);
      setInvites([]);
    } finally {
      setInvitesLoading(false);
    }
  }

  // 페이지 열리면 상세 + 멤버 목록 로드
  useEffect(() => {
    loadJarDetail();
    loadMembers();
  }, [jarId]);

  // 상세 정보를 받아온 뒤, OWNER / ADMIN 이면 초대 목록도 로드
  useEffect(() => {
    if (!jar) return;

    const canManage = jar.myRole === "OWNER" || jar.myRole === "ADMIN";

    if (canManage) {
      loadInvites();
      return;
    }

    setInvites([]);
    setInvitesError("");
    setInvitesLoading(false);
  }, [jarId, jar?.myRole]);

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

async function handleCreateInvite(e) {
  e.preventDefault();

  const expiresInHours = Math.min(
    168,
    Math.max(1, Number(inviteForm.expiresInHours || 24))
  );

  const maxUses = Math.min(
    50,
    Math.max(1, Number(inviteForm.maxUses || 1))
  );

  setCreateInviteLoading(true);

  try {
    await fetchCsrf();

    const res = await apiClient.post(`/api/v1/jars/${jarId}/invites`, {
      expiresInHours,
      maxUses,
    });

    const created = res.data?.data;

    await loadInvites();

    window.alert(
      created?.code
        ? `초대코드가 만들어졌어요.\n코드: ${created.code}`
        : "초대코드가 만들어졌어요."
    );
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "초대코드 생성에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setCreateInviteLoading(false);
  }
}

async function handleCopyInviteCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    window.alert("초대코드를 복사했어요.");
  } catch (e) {
    window.alert("복사에 실패했어요. 다시 한 번 시도해 주세요.");
  }
}

async function handleRevokeInvite(inviteId) {
  const ok = window.confirm("이 초대코드를 폐기할까요?");

  if (!ok) return;

  setRevokeLoadingId(inviteId);

  try {
    await fetchCsrf();
    await apiClient.post(`/api/v1/jars/${jarId}/invites/${inviteId}/revoke`);

    await loadInvites();
    window.alert("초대코드를 폐기했어요.");
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "초대코드 폐기에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setRevokeLoadingId(null);
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

    const canManageInvites =
      jar?.myRole === "OWNER" || jar?.myRole === "ADMIN";

    const sortedMembers = useMemo(() => {
      const roleOrder = {
        OWNER: 0,
        ADMIN: 1,
        MEMBER: 2,
      };

      return [...members].sort((a, b) => {
        const aOrder = roleOrder[a.role] ?? 99;
        const bOrder = roleOrder[b.role] ?? 99;
        return aOrder - bOrder;
      });
    }, [members]);

    const activeInviteCount = useMemo(() => {
      return invites.filter((invite) => invite.isActive).length;
    }, [invites]);

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
              <div className={`rounded-[30px] border p-6 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  한눈에 보는 저금통 정보
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem label="저금통 ID" value={jar.jarId} className={palette.infoBox} />
                  <InfoItem label="내 역할" value={ROLE_LABEL[jar.myRole] || jar.myRole} className={palette.infoBox} />
                  <InfoItem label="테마" value={THEME_LABEL[jar.theme] || jar.theme} className={palette.infoBox} />
                  <InfoItem label="잠금 레벨" value={LOCK_LEVEL_LABEL[jar.lockLevel] || jar.lockLevel} className={palette.infoBox} />
                  <InfoItem label="공개 방식" value={OPEN_MODE_LABEL[jar.openMode] || jar.openMode} className={palette.infoBox} />
                  <InfoItem label="상태" value={jar.isOpen ? "공개됨" : "잠겨 있음"} className={palette.infoBox} />
                </div>
              </div>

              <div className={`rounded-[30px] border p-6 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  시간 정보
                </p>

                <div className="space-y-3">
                  <InfoItem label="생성일" value={formatDate(jar.createdAt)} className={palette.infoBox} />
                  <InfoItem label="최근 수정일" value={formatDate(jar.updatedAt)} className={palette.infoBox} />
                  <InfoItem label="오픈일" value={formatDate(jar.openAt)} className={palette.infoBox} />
                </div>
              </div>

              <div className={`rounded-[30px] border p-6 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <p className="mb-4 text-sm font-extrabold text-slate-800">
                  빠른 동작
                </p>

                <div className="grid gap-3">
                  <Link
                    to="/jars"
                    className={`rounded-2xl border px-4 py-3 text-center text-sm font-bold transition ${palette.outlineBtn}`}
                  >
                    목록으로 돌아가기
                  </Link>

                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      disabled={deleteLoading}
                      className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.dangerBtn}`}
                    >
                      {deleteLoading ? "삭제하는 중..." : "저금통 삭제하기"}
                    </button>
                  )}

                  {!canDelete && (
                    <div className={`rounded-2xl border border-dashed px-4 py-3 text-sm ${palette.hintBox}`}>
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
        <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                            {/* 멤버 목록 */}
                            <section className={`rounded-[32px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm ${palette.section}`}>
                              <div className="mb-5 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-extrabold text-slate-800">
                                    멤버 목록
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    지금 이 저금통에 함께 들어와 있는 사람들이에요.
                                  </p>
                                </div>

                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                                  {members.length}명
                                </span>
                              </div>

                              {membersLoading && (
                                <div className="space-y-3">
                                  {[1, 2, 3].map((item) => (
                                    <div
                                      key={item}
                                      className={`animate-pulse rounded-2xl border p-4 ${palette.softCard}`}
                                    >
                                      <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                          <div className="h-12 w-12 rounded-full bg-slate-200" />
                                          <div className="space-y-2">
                                            <div className="h-4 w-24 rounded-full bg-slate-200" />
                                            <div className="h-3 w-32 rounded-full bg-slate-100" />
                                          </div>
                                        </div>
                                        <div className="h-7 w-16 rounded-full bg-slate-200" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {!membersLoading && membersError && (
                                <div className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${palette.emptyBox}`}>
                                  {membersError}
                                </div>
                              )}

                              {!membersLoading && !membersError && sortedMembers.length === 0 && (
                                <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
                                  아직 멤버 정보가 없어요.
                                </div>
                              )}

                              {!membersLoading && !membersError && sortedMembers.length > 0 && (
                                <div className="space-y-3">
                                  {sortedMembers.map((member) => {
                                    const roleChipClass =
                                      member.role === "OWNER"
                                        ? "bg-amber-100 text-amber-700"
                                        : member.role === "ADMIN"
                                        ? "bg-sky-100 text-sky-700"
                                        : "bg-slate-100 text-slate-600";

                                    return (
                                      <div
                                        key={member.userId}
                                        className={`flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${palette.softCard}`}
                                      >
                                        <div className="flex items-center gap-4">
                                          {member.profileImageUrl ? (
                                            <img
                                              src={member.profileImageUrl}
                                              alt={member.userName || "멤버 프로필"}
                                              className="h-12 w-12 rounded-full object-cover"
                                            />
                                          ) : (
                                            <div className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-black ${palette.avatar}`}>
                                              {(member.userName || "?").slice(0, 1)}
                                            </div>
                                          )}

                                          <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                              <p className="text-sm font-bold text-slate-800">
                                                {member.userName || `사용자 ${member.userId}`}
                                              </p>

                                              {member.userId === jar.ownerId && (
                                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                                                  소유자
                                                </span>
                                              )}
                                            </div>

                                            <p className="mt-1 text-xs text-slate-500">
                                              참여 시작: {formatDate(member.joinedAt)}
                                            </p>
                                          </div>
                                        </div>

                                        <span
                                          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${roleChipClass}`}
                                        >
                                          {ROLE_LABEL[member.role] || member.role}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </section>

                            {/* 초대 관리 */}
                            <section
                              className={`rounded-[32px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm ${palette.section}`}
                            >
                              <div className="mb-5 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-extrabold text-slate-800">
                                    초대 관리
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    초대코드를 만들고, 보고, 필요하면 바로 폐기할 수 있어요.
                                  </p>
                                </div>

                                <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                                  활성 {activeInviteCount}개
                                </span>
                              </div>

                              {!canManageInvites && (
                                <div className={`rounded-2xl border border-dashed px-4 py-6 text-sm leading-7 ${palette.emptyBox}`}>
                                  초대 관리는 방장(OWNER) 또는 관리자(ADMIN)만 볼 수 있어요.
                                </div>
                              )}

                              {canManageInvites && (
                                <>
                                  <form
                                    onSubmit={handleCreateInvite}
                                    className={`mb-5 rounded-2xl border p-4 ${palette.softCard}`}
                                  >
                                    <p className="mb-4 text-sm font-bold text-slate-800">
                                      새 초대코드 만들기
                                    </p>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                      <label className="block">
                                        <span className="mb-2 block text-xs font-semibold text-slate-500">
                                          유효 시간(시간)
                                        </span>
                                        <input
                                          type="number"
                                          min="1"
                                          max="168"
                                          value={inviteForm.expiresInHours}
                                          onChange={(e) =>
                                            setInviteForm((prev) => ({
                                              ...prev,
                                              expiresInHours: e.target.value,
                                            }))
                                          }
                                          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                        />
                                      </label>

                                      <label className="block">
                                        <span className="mb-2 block text-xs font-semibold text-slate-500">
                                          최대 사용 횟수
                                        </span>
                                        <input
                                          type="number"
                                          min="1"
                                          max="50"
                                          value={inviteForm.maxUses}
                                          onChange={(e) =>
                                            setInviteForm((prev) => ({
                                              ...prev,
                                              maxUses: e.target.value,
                                            }))
                                          }
                                          className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                                        />
                                      </label>
                                    </div>

                                    <button
                                      type="submit"
                                      disabled={createInviteLoading}
                                      className={`mt-4 w-full rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                                    >
                                      {createInviteLoading
                                        ? "초대코드 만드는 중..."
                                        : "초대코드 만들기"}
                                    </button>
                                  </form>

                                  {invitesLoading && (
                                    <div className="space-y-3">
                                      {[1, 2].map((item) => (
                                        <div
                                          key={item}
                                          className={`animate-pulse rounded-2xl border p-4 ${palette.softCard}`}
                                        >
                                          <div className="mb-4 flex items-center justify-between gap-4">
                                            <div className="space-y-2">
                                              <div className="h-3 w-20 rounded-full bg-slate-200" />
                                              <div className="h-6 w-32 rounded-full bg-slate-200" />
                                            </div>
                                            <div className="h-7 w-20 rounded-full bg-slate-200" />
                                          </div>
                                          <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="h-20 rounded-2xl bg-white" />
                                            <div className="h-20 rounded-2xl bg-white" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {!invitesLoading && invitesError && (
                                    <div className={`rounded-2xl border border-dashed px-4 py-4 text-sm ${palette.emptyBox}`}>
                                      {invitesError}
                                    </div>
                                  )}

                                  {!invitesLoading && !invitesError && invites.length === 0 && (
                                    <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
                                      아직 만든 초대코드가 없어요.
                                    </div>
                                  )}

                                  {!invitesLoading && !invitesError && invites.length > 0 && (
                                    <div className="space-y-3">
                                      {invites.map((invite) => {
                                        const status = getInviteStatus(invite);

                                        return (
                                          <div
                                            key={invite.inviteId}
                                            className={`rounded-2xl border p-4 ${palette.softCard}`}
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                              <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                  초대코드
                                                </p>
                                                <p className="mt-1 text-lg font-black tracking-[0.22em] text-slate-800">
                                                  {invite.code}
                                                </p>
                                              </div>

                                              <span
                                                className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}
                                              >
                                                {status.label}
                                              </span>
                                            </div>

                                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                              <InfoItem
                                                label="만료 시간"
                                                value={formatDate(invite.expiresAt)}
                                              />
                                              <InfoItem
                                                label="사용 횟수"
                                                value={`${invite.usedCount} / ${invite.maxUses}`}
                                              />
                                              <InfoItem
                                                label="만든 시간"
                                                value={formatDate(invite.createdAt)}
                                              />
                                              <InfoItem
                                                label="폐기 시간"
                                                value={formatDate(invite.revokedAt)}
                                              />
                                            </div>

                                            <div className="mt-4 flex flex-wrap gap-2">
                                              <button
                                                type="button"
                                                onClick={() => handleCopyInviteCode(invite.code)}
                                                className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                                              >
                                                코드 복사
                                              </button>

                                              <button
                                                type="button"
                                                onClick={() => handleRevokeInvite(invite.inviteId)}
                                                disabled={
                                                  !invite.isActive ||
                                                  revokeLoadingId === invite.inviteId
                                                }
                                                className="rounded-2xl bg-gradient-to-r from-slate-700 to-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                                              >
                                                {revokeLoadingId === invite.inviteId
                                                  ? "폐기 중..."
                                                  : invite.isActive
                                                  ? "초대코드 폐기"
                                                  : "종료된 코드"}
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              )}
                            </section>
                          </div>
      </div>
    </div>
  );
}