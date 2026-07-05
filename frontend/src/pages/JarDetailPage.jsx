// src/pages/JarDetailPage.jsx

import { useEffect, useMemo, useState, useRef } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";
import { getChatUnreadCount } from "../api/chatApi";
import NoteSection from "./NoteSection";
import InfoItem from "../features/jarDetail/components/InfoItem";
import JarMenuModal from "../features/jarDetail/components/JarMenuModal";
import JarChatModal from "../features/jarDetail/components/JarChatModal";
import JarVisual from "../features/jarDetail/components/JarVisual";
import JarOpenCelebrationModal from "../features/jarDetail/components/JarOpenCelebrationModal";
import JarZoomNoteDetailModal from "../features/jarDetail/components/JarZoomNoteDetailModal";
import JarZoomModal from "../features/jarDetail/components/JarZoomModal";
import MemoryDrawModal from "../features/jarDetail/components/MemoryDrawModal";
import { useJarDetail } from "../features/jarDetail/hooks/useJarDetail";
import { useJarMembers } from "../features/jarDetail/hooks/useJarMembers";
import { useJarInvites } from "../features/jarDetail/hooks/useJarInvites";
import { useJarDailyDraw } from "../features/jarDetail/hooks/useJarDailyDraw";
import { useJarRealtimeEvents } from "../features/jarDetail/hooks/useJarRealtimeEvents";
import {
  ROLE_LABEL,
  THEME_LABEL,
} from "../features/jarDetail/constants/jarDetailLabels";
import {
  formatDate,
  formatDateTimeLocalValue,
  toKstOffsetDateTime,
} from "../features/jarDetail/utils/jarDetailDateUtils";
import {
  normalizeCommentItems,
  getTotalCommentCount,
  normalizeCommentContent,
  findCommentPath,
  normalizeJarZoomNotes,
} from "../features/jarDetail/utils/jarDetailUtils";
import {
    getThemePageDecorationIcon,
    getThemePalette,
} from "../features/jarDetail/theme/jarDetailTheme";

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

// 초대코드 상태를 판단해서, 각 저금통 테마에 맞는 색까지 같이 돌려주는 함수
function getInviteStatus(invite, palette) {
  if (!invite) {
    return {
      label: "확인 중",
      className: "bg-slate-100 text-slate-600",
    };
  }

  // 관리자가 직접 폐기한 코드
  if (invite.revokedAt) {
    return {
      label: "폐기됨",
      className: palette.inviteStatusRevoked,
    };
  }

  // 최대 사용 횟수를 다 채운 코드
  if (invite.usedCount >= invite.maxUses) {
    return {
      label: "사용 완료",
      className: palette.inviteStatusUsed,
    };
  }

  // 시간이 지나서 만료된 코드
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    return {
      label: "만료됨",
      className: palette.inviteStatusExpired,
    };
  }

  // 지금 바로 사용할 수 있는 코드
  if (invite.isActive) {
    return {
      label: "사용 가능",
      className: palette.inviteStatusActive,
    };
  }

  return {
    label: "종료됨",
    className: "bg-slate-100 text-slate-600",
  };
}

export default function JarDetailPage() {

  // 지금 어떤 댓글 아래에 답글 입력창을 열었는지 저장
  const [replyTargetCommentId, setReplyTargetCommentId] = useState(null);

  // 댓글별 답글 입력값 저장
  // 예:
  // {
  //   10: "첫 번째 댓글에 쓰는 답글",
  //   20: "두 번째 댓글에 쓰는 답글"
  // }
  const [replyDraftMap, setReplyDraftMap] = useState({});

  // 어떤 댓글의 답글 목록을 펼쳐서 보고 있는지 저장
  const [replyExpandedMap, setReplyExpandedMap] = useState({});

  // 현재 상세 모달에서 보고 있는 댓글 목록
  const [jarZoomComments, setJarZoomComments] = useState([]);

  // 댓글 로딩 / 에러
  const [jarZoomCommentsLoading, setJarZoomCommentsLoading] = useState(false);
  const [jarZoomCommentsError, setJarZoomCommentsError] = useState("");

  // 새 댓글 입력창 값
  const [commentDraft, setCommentDraft] = useState("");

  // 댓글 등록 / 수정 공통 저장 로딩
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  // 지금 수정 중인 댓글 id
  const [editingCommentId, setEditingCommentId] = useState(null);

  // 수정 textarea 값
  const [editingContent, setEditingContent] = useState("");

  // 삭제 중인 댓글 id
  const [deletingCommentId, setDeletingCommentId] = useState(null);

  // 주소에서 jarId 꺼내기
  const { jarId } = useParams();

  // 현재 페이지로 넘어올 때 함께 전달된 state 읽기
  const location = useLocation();

  // 페이지 이동용
  const navigate = useNavigate();

  // 알림에서 들어왔을 때 어느 댓글을 강조할지 저장
  const [focusedCommentId, setFocusedCommentId] = useState(null);

  // 아직 스크롤/강조 처리 전인 댓글 id
  const [pendingFocusCommentId, setPendingFocusCommentId] = useState(null);

  // 같은 location state를 여러 번 처리하지 않도록 막는 ref
  const handledNotificationLocationKeyRef = useRef(null);

  // 삭제 버튼 눌렀을 때 따로 로딩 표시
  const [deleteLoading, setDeleteLoading] = useState(false);

  // NoteSection에게 보내는 열기 신호
  const [noteCreateRequestId, setNoteCreateRequestId] = useState(0);

  // 다음 단계에서 쪽지가 저금통으로 들어가는 좌표 잡을 때 쓸 준비물
  const jarVisualRef = useRef(null);

  const [jarZoomDetailOpen, setJarZoomDetailOpen] = useState(false);
  const [jarZoomDetailNoteId, setJarZoomDetailNoteId] = useState(null);
  const [jarZoomDetailNote, setJarZoomDetailNote] = useState(null);
  const [jarZoomDetailLoading, setJarZoomDetailLoading] = useState(false);
  const [jarZoomDetailError, setJarZoomDetailError] = useState("");

  // 저금통 확대 보기 모달 상태
  const [jarZoomOpen, setJarZoomOpen] = useState(false);
  const [jarZoomNotes, setJarZoomNotes] = useState([]);
  const [jarZoomLoading, setJarZoomLoading] = useState(false);
  const [jarZoomError, setJarZoomError] = useState("");

  // 저금통 채팅 모달 상태
  // false면 닫힘, true면 열림
  const [jarChatOpen, setJarChatOpen] = useState(false);

  // 한 눈에 보는 저금통 정보 모달 상태
  const [jarInfoOpen, setJarInfoOpen] = useState(false);

  // 멤버 목록 모달 상태
  const [memberListOpen, setMemberListOpen] = useState(false);

  // 초대 관리 모달 상태
  const [inviteManageOpen, setInviteManageOpen] = useState(false);

  // 추억 쪽지 뽑기 모달 상태
  // false면 닫힘, true면 열림
  const [memoryDrawOpen, setMemoryDrawOpen] = useState(false);

  // 저금통 오픈 축하 모달 상태
  // 서버에서 JAR_OPENED 이벤트가 오면 true로 바뀌고, 화면 가운데 오픈 연출이 뜬다.
  const [jarOpenCelebrationOpen, setJarOpenCelebrationOpen] = useState(false);

  // 방금 받은 저금통 오픈 이벤트 정보를 저장한다.
  // 예: { jarId, eventType: "JAR_OPENED", isOpen: true, openedAt, message }
  const [jarOpenCelebrationEvent, setJarOpenCelebrationEvent] = useState(null);

  // NoteSection을 강제로 다시 그리기 위한 숫자다.
  // 저금통이 열리면 오픈 전 마스킹된 쪽지 목록을 새로 불러오게 하려고 사용한다.
  const [noteSectionRefreshKey, setNoteSectionRefreshKey] = useState(0);

  // 오픈 축하 모달을 몇 초 뒤 자동으로 닫을 때 사용할 타이머 보관함이다.
  const jarOpenCelebrationTimerRef = useRef(null);

  // 채팅방 밖에서 보여줄 안 읽은 채팅 개수
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const [jarZoomReactingNoteId, setJarZoomReactingNoteId] = useState(null);

  // 설정 수정 모달 상태
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  // 수정 폼 상태
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    // 새 기본값은 라벤더로 둔다.
    theme: "LAVENDER",
    maxMembers: "2",
    openMode: "ALL_AT_ONCE",
    lockLevel: "HIDDEN",
    openAt: "",
  });

  // useJarDetail: 저금통 상세/내 정보
  const { jar, setJar, me, loading, error, loadJarDetail } = useJarDetail(jarId);

  // useJarMembers: 멤버 목록/강퇴/역할 변경/나가기
  const {
    members,
    membersLoading,
    membersError,
    loadMembers,
    sortedMembers,
    roleUpdateLoadingId,
    kickLoadingId,
    leaveLoading,
    canLeaveJar,
    canChangeMemberRole,
    canKickMembers,
    handleLeaveJar,
    handleChangeMemberRole,
    handleKickMember,
  } = useJarMembers({
    jarId,
    jar,
    navigate,
    loadJarDetail,
  });

  // useJarInvites: 초대코드 생성/조회/폐기/숨김
  const {
    invites,
    invitesLoading,
    invitesError,
    inviteForm,
    setInviteForm,
    createInviteLoading,
    revokeLoadingId,
    invitePage,
    setInvitePage,
    canManageInvites,
    activeInviteCount,
    visibleInvites,
    invitePageCount,
    pagedInvites,
    hiddenRevokedCount,
    getInviteUrl,
    handleCreateInvite,
    handleCopyInviteUrl,
    handleCopyInviteCode,
    handleRevokeInvite,
    handleHideRevokedInvite,
    handleRestoreHiddenInvites,
  } = useJarInvites({ jarId, jar });

  // useJarDailyDraw: 오늘의 추억 한 장
  const {
    dailyDrawToday,
    dailyDrawHistory,
    dailyDrawLoading,
    dailyDrawDrawing,
    dailyDrawError,
    dailyDrawRealtimeMessage,
    setDailyDrawRealtimeMessage,
    dailyDrawRealtimeMessageTimerRef,
    showMemoryDrawBadge,
    loadDailyDrawToday,
    loadDailyDrawHistory,
    refreshDailyDraw,
    handleDrawDailyDrawToday,
  } = useJarDailyDraw({
    jarId,
    jar,
    memoryDrawOpen,
    loadJarZoomNotes,
  });

  // seJarRealtimeEvents: WebSocket 실시간 이벤트
  useJarRealtimeEvents({
    jarId,
    jar,
    me,
    navigate,
    loadMembers,
    loadJarDetail,
    setJar,
    jarOpenCelebrationTimerRef,
    setJarOpenCelebrationEvent,
    setJarOpenCelebrationOpen,
    setNoteSectionRefreshKey,
    loadJarZoomNotes,
    jarZoomDetailOpen,
    jarZoomDetailNoteId,
    handleOpenJarZoomNoteDetail,
    loadJarZoomComments,
    patchCommentCountEverywhere,
    patchJarZoomDetailNote,
    patchJarZoomNoteInList,
    loadDailyDrawToday,
    loadDailyDrawHistory,
    dailyDrawRealtimeMessageTimerRef,
    setDailyDrawRealtimeMessage,
  });

  // 알림에서 /jars/:jarId 로 들어왔을 때
  // 1) 저금통 확대 모달 열고
  // 2) 해당 쪽지 상세 모달 열고
  // 3) 필요하면 특정 댓글까지 찾는 흐름
  useEffect(() => {
    const fromNotification = !!location.state?.fromNotification;
    const focusNoteId = location.state?.focusNoteId
      ? Number(location.state.focusNoteId)
      : null;
    const focusCommentId = location.state?.focusCommentId
      ? Number(location.state.focusCommentId)
      : null;

    if (!jar) return;
    if (!fromNotification) return;
    if (!focusNoteId) return;

    // 같은 navigation entry는 한 번만 처리
    if (handledNotificationLocationKeyRef.current === location.key) {
      return;
    }

    handledNotificationLocationKeyRef.current = location.key;

    async function openFromNotification() {
      // 저금통 확대 모달 먼저 열기
      setJarZoomOpen(true);

      // 오른쪽 목록도 같이 채워두면 화면이 자연스러워
      await loadJarZoomNotes();

      // 쪽지 상세 열기 + 필요하면 댓글 포커스 정보도 같이 넘기기
      await handleOpenJarZoomNoteDetail(focusNoteId, {
        focusCommentId,
      });
    }

    openFromNotification();
  }, [jar, location.key, location.state]);

  // 댓글 목록이 준비되면
  // - 목표 댓글이 대댓글인지 찾아서 부모 답글 목록을 펼치고
  // - 그 댓글 위치로 스크롤하고
  // - 잠깐 강조해줘
  useEffect(() => {
    if (!jarZoomDetailOpen) return;
    if (!pendingFocusCommentId) return;
    if (jarZoomCommentsLoading) return;
    if (!Array.isArray(jarZoomComments) || jarZoomComments.length === 0) return;

    const path = findCommentPath(jarZoomComments, pendingFocusCommentId);

    // 못 찾았으면 무한 대기하지 않게 정리
    if (!path) {
      setPendingFocusCommentId(null);
      return;
    }

    // 마지막은 진짜 target 댓글이고,
    // 앞쪽 id들은 "이 댓글을 보려면 펼쳐야 하는 부모 댓글"이야.
    const parentIdsToExpand = path.slice(0, -1);

    if (parentIdsToExpand.length > 0) {
      setReplyExpandedMap((prev) => {
        const next = { ...prev };

        parentIdsToExpand.forEach((commentId) => {
          next[commentId] = true;
        });

        return next;
      });
    }

    const targetId = Number(pendingFocusCommentId);

    const scrollTimer = window.setTimeout(() => {
      const targetElement = document.getElementById(`jar-comment-${targetId}`);

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }

      setFocusedCommentId(targetId);
    }, 180);

    const clearHighlightTimer = window.setTimeout(() => {
      setFocusedCommentId((prev) =>
        Number(prev) === targetId ? null : prev
      );
    }, 2600);

    setPendingFocusCommentId(null);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearHighlightTimer);
    };
  }, [
    jarZoomDetailOpen,
    jarZoomComments,
    jarZoomCommentsLoading,
    pendingFocusCommentId,
  ]);

  /*
   * 채팅 모달이 닫혀 있을 때도
   * 채팅 버튼 옆 숫자는 계속 갱신되어야 해.
   *
   * 그래서 JarChatPanel이 사라져 있어도
   * JarDetailPage에서 unread count만 가볍게 polling 해준다.
   */
  useEffect(() => {
    if (!jarId) return;

    // 처음 들어왔을 때 1번 바로 조회
    loadChatUnreadCount();

    // 채팅 모달이 열려 있으면 JarChatPanel이 직접 메시지를 보고 읽음 처리하므로
    // 바깥 badge polling은 잠깐 멈춰도 괜찮아.
    if (jarChatOpen) return;

    const timerId = window.setInterval(() => {
      loadChatUnreadCount();
    }, 3000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [jarId, jarChatOpen]);

    useEffect(() => {
      if (!jar) return;

      setEditForm({
        name: jar.name ?? "",
        description: jar.description ?? "",
        theme: jar.theme ?? "LAVENDER",
        maxMembers: String(jar.maxMembers ?? 2),
        openMode: jar.openMode ?? "ALL_AT_ONCE",
        lockLevel: jar.lockLevel ?? "HIDDEN",
        openAt: formatDateTimeLocalValue(jar.openAt),
      });
    }, [jar]);

    useEffect(() => {
      if (!jar) return;
    }, [jar]);

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

async function handleUpdateJar(e) {
  e.preventDefault();

  if (!canEditJar) {
    window.alert("저금통 수정은 방장 또는 관리자만 할 수 있어요.");
    return;
  }

  const trimmedName = editForm.name.trim();
  const trimmedDescription = editForm.description.trim();
  const maxMembers = Number(editForm.maxMembers);

  if (!trimmedName) {
    window.alert("저금통 이름을 입력해 주세요.");
    return;
  }

  if (!Number.isFinite(maxMembers) || maxMembers < 2 || maxMembers > 50) {
    window.alert("최대 인원은 2명 이상 50명 이하로 입력해 주세요.");
    return;
  }

  if (!editForm.openAt) {
    window.alert("오픈일을 입력해 주세요.");
    return;
  }

  setEditLoading(true);

  try {
    await fetchCsrf();

    await apiClient.patch(`/api/v1/jars/${jarId}`, {
      name: trimmedName,
      description: trimmedDescription,
      theme: editForm.theme,
      maxMembers,
      openAt: editForm.openAt,
      openMode: editForm.openMode,
      lockLevel: editForm.lockLevel,
    });

    await loadJarDetail();
    await loadMembers();

    setEditOpen(false);
    window.alert("저금통 설정을 수정했어요.");
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "저금통 수정에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setEditLoading(false);
  }
}

// 숫자 1 올려서 NoteSection에게 열어! 보냄
function handleOpenNoteComposer() {
  setNoteCreateRequestId((prev) => prev + 1);
}

// 쪽지가 날아가서 들어갈 "저금통 입구" 좌표를 계산해 주는 함수
function getJarDropTargetRect() {
  const jarElement = jarVisualRef.current;

  if (!jarElement) return null;

  const rect = jarElement.getBoundingClientRect();

  return {
    // 저금통 가로 가운데
    x: rect.left + rect.width / 2,

    // 뚜껑 바로 아래쯤을 목표 지점으로 잡아줘
    y: rect.top + 86,
  };
}

// 확대 모달에서 보여줄 쪽지 목록 불러오기
async function loadJarZoomNotes() {
  setJarZoomLoading(true);
  setJarZoomError("");

  try {
    const res = await apiClient.get(`/api/v1/jars/${jarId}/notes`, {
      params: {
        page: 0,
        size: 24,
      },
    });

    const items = normalizeJarZoomNotes(res.data?.data);
    setJarZoomNotes(items);
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "저금통 안의 쪽지를 불러오지 못했어요.";

    setJarZoomError(serverMessage);
    setJarZoomNotes([]);
  } finally {
    setJarZoomLoading(false);
  }
}

async function loadJarZoomComments(noteId) {
  if (!noteId) return [];

  setJarZoomCommentsLoading(true);
  setJarZoomCommentsError("");

  try {
    const res = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );

    const items = normalizeCommentItems(res.data?.data);
    setJarZoomComments(items);

    // WebSocket 이벤트 처리 쪽에서 댓글 개수 계산할 수 있게 반환
    return items;
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "댓글을 불러오지 못했어요.";

    setJarZoomCommentsError(serverMessage);
    setJarZoomComments([]);

    return [];
  } finally {
    setJarZoomCommentsLoading(false);
  }
}


async function handleOpenJarZoomNoteDetail(noteId, options = {}) {
    if (!noteId) return;

      const focusCommentId = options?.focusCommentId ?? null;

      // 이번에 특정 댓글로 들어온 경우 나중에 스크롤할 수 있게 저장
      setPendingFocusCommentId(focusCommentId ? Number(focusCommentId) : null);

      // 예전 강조 흔적은 먼저 지워줘
      setFocusedCommentId(null);

  setJarZoomDetailOpen(true);
  setJarZoomDetailNoteId(noteId);
  setJarZoomDetailLoading(true);
  setJarZoomDetailError("");
  setJarZoomDetailNote(null);

  // 댓글 관련 상태도 초기화
  setJarZoomComments([]);
  setJarZoomCommentsError("");
  setCommentDraft("");
  setEditingCommentId(null);
  setEditingContent("");

  setReplyTargetCommentId(null);
  setReplyDraftMap({});
  setReplyExpandedMap({});

  try {
    const [noteRes, commentRes] = await Promise.all([
      apiClient.get(`/api/v1/jars/${jarId}/notes/${noteId}`),
      apiClient.get(`/api/v1/jars/${jarId}/notes/${noteId}/comments`),
    ]);

    setJarZoomDetailNote(noteRes.data?.data || null);
    setJarZoomComments(normalizeCommentItems(commentRes.data?.data));
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "쪽지 상세를 불러오지 못했어요.";

    setJarZoomDetailError(serverMessage);
  } finally {
    setJarZoomDetailLoading(false);
    setJarZoomCommentsLoading(false);
  }
}

function handleCloseJarZoomNoteDetail() {
  setJarZoomDetailOpen(false);
  setJarZoomDetailNoteId(null);
  setJarZoomDetailNote(null);
  setJarZoomDetailError("");
  setJarZoomDetailLoading(false);

  setReplyTargetCommentId(null);
  setReplyDraftMap({});
  setReplyExpandedMap({});
  setPendingFocusCommentId(null);
  setFocusedCommentId(null);
}

async function handleReactInJarZoomDetail(noteId, emoji) {
  if (!jar?.jarId || !noteId) return;

  if (!jar?.isOpen) {
    window.alert("저금통이 열린 뒤에 리액션을 남길 수 있어요.");
    return;
  }

  setJarZoomReactingNoteId(noteId);

  try {
    await fetchCsrf();

    const res = await apiClient.post(
      `/api/v1/jars/${jarId}/notes/${noteId}/reactions`,
      { emoji }
    );

    const summary = res.data?.data;

    patchJarZoomDetailNote(noteId, summary);
    patchJarZoomNoteInList(noteId, summary);
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "리액션 처리에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setJarZoomReactingNoteId(null);
  }
}



function patchJarZoomNoteInList(noteId, summary) {
  setJarZoomNotes((prev) =>
    (prev || []).map((item) =>
      (item?.noteId ?? item?.id) === noteId
        ? {
            ...item,
            myReaction: summary?.myReaction ?? null,
            reactionCounts: Array.isArray(summary?.counts)
              ? summary.counts
              : Array.isArray(summary?.reactionCounts)
              ? summary.reactionCounts
              : [],
          }
        : item
    )
  );
}

function patchJarZoomDetailNote(noteId, summary) {
  setJarZoomDetailNote((prev) => {
    if (!prev) return prev;
    if ((prev?.noteId ?? prev?.id) !== noteId) return prev;

    return {
      ...prev,
      myReaction: summary?.myReaction ?? null,
      reactionCounts: Array.isArray(summary?.counts)
        ? summary.counts
        : Array.isArray(summary?.reactionCounts)
        ? summary.reactionCounts
        : [],
    };
  });
}

function patchCommentCountEverywhere(noteId, nextCount) {
  setJarZoomNotes((prev) =>
    (prev || []).map((item) =>
      (item?.noteId ?? item?.id) === noteId
        ? {
            ...item,
            commentCount: nextCount,
          }
        : item
    )
  );

  setJarZoomDetailNote((prev) => {
    if (!prev) return prev;
    if ((prev?.noteId ?? prev?.id) !== noteId) return prev;

    return {
      ...prev,
      commentCount: nextCount,
    };
  });
}

/*
 * 어떤 댓글 아래에 답글 입력창을 열지 정하는 함수야.
 *
 * UX 규칙
 * - 같은 댓글을 다시 누르면 닫기
 * - 다른 댓글로 이동할 때
 *   입력 중인 답글이 비어 있으면 바로 이동
 *   입력 중인 답글이 있으면 한 번 물어보고 이동
 */
function handleToggleReply(commentId) {
  // 지금 열려 있는 답글창이 없으면 그냥 열기
  if (!replyTargetCommentId) {
    setReplyTargetCommentId(commentId);
    return;
  }

  // 같은 댓글을 다시 누르면 닫기
  if (replyTargetCommentId === commentId) {
    const currentDraft = normalizeCommentContent(
      replyDraftMap[replyTargetCommentId]
    );

    if (currentDraft) {
      const ok = window.confirm("작성 중인 답글이 있어요. 닫을까요?");
      if (!ok) return;
    }

    setReplyTargetCommentId(null);
    return;
  }

  // 다른 댓글로 이동하려는 경우
  const currentDraft = normalizeCommentContent(
    replyDraftMap[replyTargetCommentId]
  );

  // 작성 중인 내용이 있으면 확인
  if (currentDraft) {
    const ok = window.confirm(
      "작성 중인 답글이 있어요.\n다른 댓글로 이동하면 지금 내용은 그대로 두고 입력창만 바뀌어요. 이동할까요?"
    );

    if (!ok) return;
  }

  setReplyTargetCommentId(commentId);
}

/*
 * 특정 댓글의 답글 목록을 펼치거나 숨기는 함수야.
 *
 * - true면 답글 목록 보여주기
 * - false면 답글 목록 숨기기
 */
function handleToggleReplies(commentId) {
  setReplyExpandedMap((prev) => ({
    ...prev,
    [commentId]: !prev[commentId],
  }));
}

/*
 * 특정 댓글 아래 답글 입력값을 저장하는 함수야.
 */
function handleReplyDraftChange(commentId, value) {
  setReplyDraftMap((prev) => ({
    ...prev,
    [commentId]: value,
  }));
}

/*
 * 이 함수는 특정 댓글 아래에 대댓글을 등록하는 역할을 해.
 */
async function handleCreateReply(parentCommentId) {
  const noteId = jarZoomDetailNoteId;
  const content = normalizeCommentContent(replyDraftMap[parentCommentId]);

  if (!noteId || !parentCommentId) return;

  if (!content) {
    window.alert("답글 내용을 입력해 주세요.");
    return;
  }

  setCommentSubmitting(true);

  try {
    await fetchCsrf();

    // 답글을 저장하고, 저장된 답글 id를 받아온다.
    const createRes = await apiClient.post(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`,
      {
        content,
        parentCommentId,
      }
    );

    const createdCommentId = createRes.data?.data?.commentId;

    // 댓글 전체를 다시 불러온다.
    const refreshedComments = await loadJarZoomComments(noteId);

    // 새로 만든 답글이 댓글 트리 어디에 있는지 찾는다.
    const createdPath = findCommentPath(refreshedComments, createdCommentId);

    // 새 답글을 보려면 펼쳐야 하는 부모 댓글들을 전부 펼친다.
    if (createdPath && createdPath.length > 1) {
      const parentIdsToExpand = createdPath.slice(0, -1);

      setReplyExpandedMap((prev) => {
        const next = { ...prev };

        parentIdsToExpand.forEach((commentId) => {
          next[commentId] = true;
        });

        return next;
      });
    } else {
      // 혹시 path를 못 찾으면 최소한 답글 단 대상 댓글은 펼친다.
      setReplyExpandedMap((prev) => ({
        ...prev,
        [parentCommentId]: true,
      }));
    }

    // 입력창 값 비우기
    setReplyDraftMap((prev) => ({
      ...prev,
      [parentCommentId]: "",
    }));

    // 답글 입력창 닫기
    setReplyTargetCommentId(null);

    // 방금 답글 단 댓글의 답글 목록 펼치기
    setReplyExpandedMap((prev) => ({
      ...prev,
      [parentCommentId]: true,
    }));

    // 총 댓글 수 다시 계산
    patchCommentCountEverywhere(noteId, getTotalCommentCount(refreshedComments));
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "답글 등록에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setCommentSubmitting(false);
  }
}

async function handleCreateComment() {
  const noteId = jarZoomDetailNoteId;
  const content = normalizeCommentContent(commentDraft);

  if (!noteId) return;

  if (!content) {
    window.alert("댓글 내용을 입력해 주세요.");
    return;
  }

  setCommentSubmitting(true);

  try {
    await fetchCsrf();

    await apiClient.post(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`,
      { content }
    );

    const commentRes = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );
    const items = normalizeCommentItems(commentRes.data?.data);

    setJarZoomComments(items);
    setCommentDraft("");
    patchCommentCountEverywhere(noteId, getTotalCommentCount(items));
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "댓글 등록에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setCommentSubmitting(false);
  }
}

async function handleUpdateComment(commentId) {
  const noteId = jarZoomDetailNoteId;
  const content = normalizeCommentContent(editingContent);

  if (!noteId || !commentId) return;

  if (!content) {
    window.alert("댓글 내용을 입력해 주세요.");
    return;
  }

  setCommentSubmitting(true);

  try {
    await fetchCsrf();

    await apiClient.patch(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments/${commentId}`,
      { content }
    );

    const commentRes = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );
    const items = normalizeCommentItems(commentRes.data?.data);

    setJarZoomComments(items);
    setEditingCommentId(null);
    setEditingContent("");
    patchCommentCountEverywhere(noteId, getTotalCommentCount(items));
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "댓글 수정에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setCommentSubmitting(false);
  }
}

async function handleDeleteComment(commentId) {
  const noteId = jarZoomDetailNoteId;

  if (!noteId || !commentId) return;

  const ok = window.confirm("이 댓글을 삭제할까요?");
  if (!ok) return;

  setDeletingCommentId(commentId);

  try {
    await fetchCsrf();

    await apiClient.delete(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments/${commentId}`
    );

    const commentRes = await apiClient.get(
      `/api/v1/jars/${jarId}/notes/${noteId}/comments`
    );
    const items = normalizeCommentItems(commentRes.data?.data);

    setJarZoomComments(items);
    patchCommentCountEverywhere(noteId, getTotalCommentCount(items));

    if (editingCommentId === commentId) {
      setEditingCommentId(null);
      setEditingContent("");
    }
  } catch (e) {
    const serverMessage =
      e?.response?.data?.error?.message ||
      e?.response?.data?.message ||
      e?.message ||
      "댓글 삭제에 실패했어요.";

    window.alert(serverMessage);
  } finally {
    setDeletingCommentId(null);
  }
}


function handleStartEditComment(comment) {
  setEditingCommentId(comment.commentId);
  setEditingContent(comment.content || "");
}

function handleCancelEditComment() {
  setEditingCommentId(null);
  setEditingContent("");
}

// 저금통 클릭 시 확대 모달 열기
async function handleOpenJarZoom() {
  setJarZoomOpen(true);

  // 오픈 전에는 쪽지 목록 자체를 불러오지 않는다.
  // 이유:
  // - 저금통은 열리기 전까지 비밀이라는 콘셉트가 중요하다.
  // - 화면에서 숨기더라도 굳이 목록 API를 호출할 필요가 없다.
  if (!jar?.isOpen) {
    setJarZoomNotes([]);
    setJarZoomError("");
    setJarZoomLoading(false);
    return;
  }

  await loadJarZoomNotes();
}

// 저금통 확대 모달 닫기
function handleCloseJarZoom() {
  setJarZoomOpen(false);
}

/*
 * 채팅 버튼 옆에 보여줄 안 읽은 메시지 개수를 불러오는 함수야.
 *
 * 쉽게 말하면:
 * - 서버에 "내가 안 본 채팅 몇 개야?"라고 물어봄
 * - 그 숫자를 버튼 빨간 뱃지에 보여줌
 */
async function loadChatUnreadCount() {
  if (!jarId) return;

  try {
    const data = await getChatUnreadCount(jarId);
    setChatUnreadCount(Number(data?.unreadCount || 0));
  } catch {
    // unread count는 보조 기능이라 실패해도 화면을 깨지 않게 0으로 둠
    setChatUnreadCount(0);
  }
}

/*
 * Daily Draw 카드에서 쪽지 상세 열기
 *
 * 역할:
 * - 오늘 카드나 히스토리에서 쪽지를 누르면
 * - 기존에 만들어둔 JarZoomNoteDetailModal을 재사용해서 상세를 보여준다.
 */
async function handleOpenDailyDrawNoteDetail(noteId) {
  if (!noteId) return;

  // 오른쪽 확대 목록도 자연스럽게 채워두기 위해 확대 모달을 같이 열어둔다.
  setJarZoomOpen(true);

  await loadJarZoomNotes();
  await handleOpenJarZoomNoteDetail(noteId);
}

/*
 * 채팅 모달 열기
 *
 * 사용자가 채팅방을 열었다는 건
 * 이제 메시지를 보러 들어간다는 뜻이므로
 * 버튼의 unread badge는 우선 0으로 숨겨준다.
 *
 * 실제 서버 읽음 처리는 JarChatPanel 안에서 마지막 메시지 기준으로 처리된다.
 */
function handleOpenJarChat() {
  setJarChatOpen(true);
  setChatUnreadCount(0);
}

/*
 * 추억 쪽지 뽑기 모달 열기
 *
 * 역할:
 * - 사용자가 "추억 쪽지 뽑기" 버튼을 누르면 실행된다.
 * - 화면 주변을 어둡게 만드는 모달을 연다.
 * - 저금통이 이미 열려 있으면 오늘 뽑기 상태도 최신으로 맞춘다.
 */
async function handleOpenMemoryDraw() {
  setMemoryDrawOpen(true);

  // 저금통이 열려 있을 때만 뽑기 데이터를 다시 확인한다.
  if (jar?.isOpen) {
    await refreshDailyDraw();
  }
}

/*
 * 추억 쪽지 뽑기 모달 닫기
 */
function handleCloseMemoryDraw() {
  setMemoryDrawOpen(false);
}

/*
 * 추억 쪽지 뽑기 모달에서 쪽지 상세를 열 때 사용한다.
 *
 * 이유:
 * - 뽑기 모달이 계속 떠 있으면
 *   쪽지 상세 모달과 겹쳐서 화면이 복잡해진다.
 * - 그래서 먼저 뽑기 모달을 닫고,
 *   기존 쪽지 상세 모달을 연다.
 */
async function handleOpenMemoryDrawNoteDetail(noteId) {
  setMemoryDrawOpen(false);
  await handleOpenDailyDrawNoteDetail(noteId);
}

/*
 * 오늘의 추억 한 장 모달에서 전체 추억 보러가기를 눌렀을 때 사용한다.
 *
 * 역할:
 * - 오늘의 추억 모달을 닫고
 * - 기존 저금통 확대 모달을 열어서
 * - 전체 쪽지 목록을 보여준다.
 */
async function handleOpenMemoryDrawAllNotes() {
  setMemoryDrawOpen(false);
  setJarZoomOpen(true);
  await loadJarZoomNotes();
}

/*
 * 오늘의 추억 한 장 모달에서 채팅하러가기를 눌렀을 때 사용한다.
 *
 * 역할:
 * - 오늘의 추억 모달을 닫고
 * - 저금통 채팅 모달을 연다.
 */
function handleOpenMemoryDrawChat() {
  setMemoryDrawOpen(false);
  handleOpenJarChat();
}

/*
 * 채팅 모달 닫기
 *
 * 모달을 닫은 뒤 서버 기준 unread count를 다시 한 번 맞춰준다.
 */
async function handleCloseJarChat() {
  setJarChatOpen(false);
  await loadChatUnreadCount();
}

/*
 * 저금통 오픈 축하 모달 닫기
 * 사용자가 X 버튼을 누르거나 "조금 있다 보기"를 누르면 실행된다.
 */
function handleCloseJarOpenCelebration() {
  setJarOpenCelebrationOpen(false);

  if (jarOpenCelebrationTimerRef.current) {
    window.clearTimeout(jarOpenCelebrationTimerRef.current);
  }
}

/*
 * 저금통 오픈 축하 모달에서 "추억 보러가기"를 눌렀을 때 실행된다.
 *
 * 역할:
 * - 축하 모달을 닫고
 * - 기존에 만들어둔 저금통 확대 모달을 연다.
 */
async function handleViewOpenedJarNotes() {
  handleCloseJarOpenCelebration();
  await handleOpenJarZoom();
}

  const openStatus = useMemo(() => getOpenStatus(jar), [jar]);

  const palette = useMemo(
    () => getThemePalette(jar?.theme),
    [jar?.theme]
  );

  /*
   * 페이지 전체 배경 클래스
   *
   * 역할:
   * - 테마에 pageBg가 있으면 그 배경을 사용한다.
   * - 아직 pageBg를 만들지 않은 테마는 기존 분홍/주황 배경을 그대로 사용한다.
   */
  const pageBackgroundClass =
    palette.pageBg ?? "bg-gradient-to-b from-rose-50 via-white to-orange-50";

  /*
   * 테마 배경 장식을 보여줄지 결정하는 값이다.
   *
   * 역할:
   * - pageBg가 있는 테마라면 배경색과 외곽 장식을 보여준다.
   * - 이제 달빛뿐 아니라 봄, 여름, 가을, 겨울, 라벤더, 이슬, 모래도 모두 적용된다.
   */
  const hasThemePageDecoration = Boolean(palette.pageBg);

  /*
   * 현재 저금통 테마에 맞는 페이지 장식 SVG 컴포넌트다.
   *
   * 역할:
   * - SPRING이면 SpringPageDecorationIcon
   * - SUMMER이면 SummerPageDecorationIcon
   * - 없는 테마면 null을 반환해서 화면에 아무것도 그리지 않는다.
   */
  const ThemePageDecorationIcon = getThemePageDecorationIcon(jar?.theme);

  // 인원 진행률 계산
  const memberPercent = useMemo(() => {
    if (!jar?.maxMembers) return 0;
    return Math.min(100, Math.round((jar.memberCount / jar.maxMembers) * 100));
  }, [jar]);

  // 삭제 버튼은 OWNER일 때만 보여주기
  const canDelete = jar?.myRole === "OWNER";

  // 수정 가능한 사람 체크
  const canEditJar = jar?.myRole === "OWNER" || jar?.myRole === "ADMIN";

  // 로딩 화면
  if (loading) {
    return (
      <div className={`relative min-h-[calc(100vh-80px)] overflow-hidden px-6 py-10 ${pageBackgroundClass}`}>
        {/* 달빛 테마일 때만 보이는 페이지 외곽 장식 */}
        {hasThemePageDecoration && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* 오른쪽 위 달빛 번짐 */}
            <div
              className={`absolute -right-10 -top-12 h-96 w-96 rounded-full blur-3xl ${palette.pageGlowPrimary}`}
            />

            {/* 왼쪽 위 보랏빛 번짐 */}
            <div
              className={`absolute -left-10 top-24 h-72 w-72 rounded-full blur-3xl ${palette.pageGlowSecondary}`}
            />

            {/* 오른쪽 아래 아주 약한 안개빛 */}
            <div
              className={`absolute bottom-10 right-[18%] h-48 w-48 rounded-full blur-3xl ${palette.pageGlowSoft}`}
            />

            {/* 작은 별빛들 */}
            {/* 작은 별빛들 */}
            <span className={`absolute right-[16%] top-16 h-2 w-2 rounded-full ${palette.pageStar}`} />
            <span className={`absolute right-[23%] top-28 h-1.5 w-1.5 rounded-full ${palette.pageStar}`} />
            <span className={`absolute left-[10%] top-24 h-2 w-2 rounded-full ${palette.pageStar}`} />
            <span className={`absolute left-[18%] top-44 h-1.5 w-1.5 rounded-full ${palette.pageStar}`} />
            <span className={`absolute right-[32%] top-52 h-1.5 w-1.5 rounded-full ${palette.pageStar}`} />

            {/* 별이 너무 점처럼만 보이지 않게 작은 테마 반짝이도 추가 */}
            <span className={`absolute right-[12%] top-32 text-xs drop-shadow-sm ${palette.pageSparkle}`}>
              ✦
            </span>
            <span className={`absolute left-[14%] top-36 text-[10px] drop-shadow-sm ${palette.pageSparkle}`}>
              ✧
            </span>
            <span className={`absolute right-[38%] top-24 text-[10px] drop-shadow-sm ${palette.pageSparkle}`}>
              ✦
            </span>
             {/* 테마 대표 SVG 장식 */}
                {ThemePageDecorationIcon && (
                  <>
                    <ThemePageDecorationIcon
                      className={`absolute left-[8%] top-20 h-9 w-9 rotate-[-12deg] ${palette.pageSparkle}`}
                    />

                    <ThemePageDecorationIcon
                      className={`absolute right-[9%] top-44 h-11 w-11 rotate-[10deg] ${palette.pageSparkle}`}
                    />

                    <ThemePageDecorationIcon
                      className={`absolute bottom-24 right-[22%] h-8 w-8 rotate-[-6deg] ${palette.pageSparkle}`}
                    />
                  </>
                )}
          </div>
        )}

        <div className="relative z-10 mx-auto max-w-6xl">
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
      <div className={`relative min-h-[calc(100vh-80px)] overflow-hidden px-6 py-10 ${pageBackgroundClass}`}>
        {/* 달빛 테마일 때만 보이는 페이지 외곽 장식 */}
        {hasThemePageDecoration && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* 오른쪽 위 달빛 번짐 */}
            <div
              className={`absolute -right-10 -top-12 h-96 w-96 rounded-full blur-3xl ${palette.pageGlowPrimary}`}
            />

            {/* 왼쪽 위 보랏빛 번짐 */}
            <div
              className={`absolute -left-10 top-24 h-72 w-72 rounded-full blur-3xl ${palette.pageGlowSecondary}`}
            />

            {/* 오른쪽 아래 아주 약한 안개빛 */}
            <div
              className={`absolute bottom-10 right-[18%] h-48 w-48 rounded-full blur-3xl ${palette.pageGlowSoft}`}
            />

            {/* 작은 별빛들 */}
            {/* 작은 별빛들 */}
            <span className={`absolute right-[16%] top-16 h-2 w-2 rounded-full ${palette.pageStar}`} />
            <span className={`absolute right-[23%] top-28 h-1.5 w-1.5 rounded-full ${palette.pageStar}`} />
            <span className={`absolute left-[10%] top-24 h-2 w-2 rounded-full ${palette.pageStar}`} />
            <span className={`absolute left-[18%] top-44 h-1.5 w-1.5 rounded-full ${palette.pageStar}`} />
            <span className={`absolute right-[32%] top-52 h-1.5 w-1.5 rounded-full ${palette.pageStar}`} />

            {/* 별이 너무 점처럼만 보이지 않게 작은 테마 반짝이도 추가 */}
            <span className={`absolute right-[12%] top-32 text-xs drop-shadow-sm ${palette.pageSparkle}`}>
              ✦
            </span>
            <span className={`absolute left-[14%] top-36 text-[10px] drop-shadow-sm ${palette.pageSparkle}`}>
              ✧
            </span>
            <span className={`absolute right-[38%] top-24 text-[10px] drop-shadow-sm ${palette.pageSparkle}`}>
              ✦
            </span>
             {/* 테마 대표 SVG 장식 */}
                {ThemePageDecorationIcon && (
                  <>
                    <ThemePageDecorationIcon
                      className={`absolute left-[8%] top-20 h-9 w-9 rotate-[-12deg] ${palette.pageSparkle}`}
                    />

                    <ThemePageDecorationIcon
                      className={`absolute right-[9%] top-44 h-11 w-11 rotate-[10deg] ${palette.pageSparkle}`}
                    />

                    <ThemePageDecorationIcon
                      className={`absolute bottom-24 right-[22%] h-8 w-8 rotate-[-6deg] ${palette.pageSparkle}`}
                    />
                  </>
                )}
          </div>
        )}

        <div className="relative z-10 mx-auto max-w-6xl">
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


              </div>

              <h1 className="mb-3 text-3xl font-black leading-tight text-slate-800 md:text-4xl">
                {jar.name}
              </h1>

              <p className="mb-8 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                {jar.description || "아직 설명이 없는 저금통이에요."}
              </p>

              <div className={`mb-6 rounded-[28px] border p-5 shadow-sm backdrop-blur-sm ${palette.panel}`}>
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


              <div className="relative mb-6 flex flex-col items-center">
                <JarVisual
                  jar={jar}
                  jarRef={jarVisualRef}
                  onClick={handleOpenJarZoom}
                  interactive
                />

                {/* 저금통 아래 주요 버튼들 */}
                <div className="mt-20 grid w-full max-w-xl gap-3 sm:grid-cols-3">
                  {/* 새 쪽지 작성 버튼 */}
                  <button
                    type="button"
                    onClick={handleOpenNoteComposer}
                    className={`w-full rounded-2xl px-4 py-3 text-sm font-bold shadow-[0_16px_36px_rgba(15,23,42,0.16)] transition hover:scale-[1.02] ${palette.primaryButton}`}
                  >
                    새 쪽지 쓰기
                  </button>

                  {/* 저금통 채팅 모달 열기 버튼 */}
                  <button
                    type="button"
                    onClick={handleOpenJarChat}
                    className={`relative w-full rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm transition hover:scale-[1.02] ${palette.outlineButton}`}
                  >
                    저금통 채팅

                    {chatUnreadCount > 0 && (
                      <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-2 text-[11px] font-black text-white shadow-md">
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </span>
                    )}
                  </button>

                  {/* 추억 쪽지 뽑기 모달 열기 버튼 */}
                  <button
                    type="button"
                    onClick={handleOpenMemoryDraw}
                    className={`relative w-full rounded-2xl border px-4 py-3 text-sm font-bold shadow-sm transition hover:scale-[1.02] ${palette.outlineButton}`}
                  >
                    추억 쪽지 뽑기

                    {showMemoryDrawBadge && (
                      <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-500 px-2 text-[11px] font-black text-white shadow-md">
                        1
                      </span>
                    )}
                  </button>
                </div>
              </div>


            </section>

            {/* 오른쪽: 정보 카드들 */}
            {/* 오른쪽: 버튼형 메뉴 카드들 */}
            <aside className="space-y-5">
              <div className={`rounded-[30px] border p-6 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <p className="mb-2 text-sm font-extrabold text-slate-800">
                  저금통 메뉴
                </p>

                <p className="mb-5 text-xs leading-6 text-slate-500">
                  필요한 정보와 관리 기능을 버튼으로 열어서 볼 수 있어요.
                </p>

                <div className="grid gap-3">
                  {/* 저금통 정보 + 시간 정보를 합친 모달 열기 */}
                  <button
                    type="button"
                    onClick={() => setJarInfoOpen(true)}
                    className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] ${palette.primaryButton}`}
                  >
                    한 눈에 보는 저금통 정보
                  </button>

                  {/* 멤버 목록 모달 열기 */}
                  <button
                    type="button"
                    onClick={() => setMemberListOpen(true)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold transition hover:scale-[1.01] ${palette.outlineButton}`}
                  >
                    멤버 목록
                    <span className="ml-2 text-xs opacity-80">
                      {members.length}명
                    </span>
                  </button>

                  {/* 초대 관리 모달 열기 */}
                  <button
                    type="button"
                    onClick={() => setInviteManageOpen(true)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-bold transition hover:scale-[1.01] ${palette.outlineButton}`}
                  >
                    초대 관리
                    <span className="ml-2 text-xs opacity-80">
                      활성 {activeInviteCount}개
                    </span>
                  </button>
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

                  {canEditJar && (
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] ${palette.primaryButton}`}
                    >
                      저금통 설정 수정하기
                    </button>
                  )}

                  {canLeaveJar && (
                    <button
                      type="button"
                      onClick={handleLeaveJar}
                      disabled={leaveLoading}
                      className={`rounded-2xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.outlineBtn}`}
                    >
                      {leaveLoading ? "나가는 중..." : "저금통 나가기"}
                    </button>
                  )}

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
              {/* 오른쪽 아래: 저금통 현황 카드 */}
              <div className={`rounded-[30px] border p-6 shadow-sm backdrop-blur-sm ${palette.panel}`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">
                      저금통 현황
                    </p>

                    <p className="mt-1 text-xs leading-6 text-slate-500">
                      지금 저금통의 참여 상태를 빠르게 확인할 수 있어요.
                    </p>
                  </div>


                </div>

                {/* 참여 인원 */}
                <div className={`rounded-2xl border px-4 py-4 ${palette.infoBox}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                      Members
                    </p>

                    <p className="text-sm font-black text-slate-700">
                      {jar.memberCount} / {jar.maxMembers}명
                    </p>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${palette.badge}`}
                      style={{ width: `${memberPercent}%` }}
                    />
                  </div>

                  <p className="mt-3 text-xs leading-6 text-slate-500">
                    이 저금통은 최대 {jar.maxMembers}명까지 함께할 수 있어요.
                  </p>
                </div>

                {/* 오픈 상태 한 줄 안내 */}
                <div className={`mt-3 rounded-2xl border border-dashed px-4 py-3 text-xs leading-6 ${palette.hintBox}`}>
                  {openStatus.description}
                </div>
              </div>
            </aside>
          </div>
        </div>

        <NoteSection
          key={`note-section-${jarId}-${noteSectionRefreshKey}`}
          jar={jar}
          palette={palette}
          formatDate={formatDate}
          showCreateButton={false}
          showSearchControls={false}
          createRequestId={noteCreateRequestId}
          getJarDropTargetRect={getJarDropTargetRect}
        />

        <JarZoomModal
          open={jarZoomOpen}
          jar={jar}
          notes={jarZoomNotes}
          loading={jarZoomLoading}
          error={jarZoomError}
          palette={palette}
          onClose={handleCloseJarZoom}
          onRetry={loadJarZoomNotes}
          onOpenNoteDetail={handleOpenJarZoomNoteDetail}
          onReactNote={handleReactInJarZoomDetail}
          reactingNoteId={jarZoomReactingNoteId}
        />

        <JarChatModal
          open={jarChatOpen}
          jar={jar}
          palette={palette}
          currentUserId={me?.userId}
          onClose={handleCloseJarChat}
        />

        <MemoryDrawModal
          open={memoryDrawOpen}
          jar={jar}
          palette={palette}
          today={dailyDrawToday}
          history={dailyDrawHistory}
          loading={dailyDrawLoading}
          drawing={dailyDrawDrawing}
          error={dailyDrawError}
          onClose={handleCloseMemoryDraw}
          onDraw={handleDrawDailyDrawToday}
          onReload={refreshDailyDraw}
          onOpenNoteDetail={handleOpenMemoryDrawNoteDetail}
          onOpenAllNotes={handleOpenMemoryDrawAllNotes}
          onOpenChat={handleOpenMemoryDrawChat}
          realtimeMessage={dailyDrawRealtimeMessage}
        />

        <JarOpenCelebrationModal
          open={jarOpenCelebrationOpen}
          jar={jar}
          palette={palette}
          event={jarOpenCelebrationEvent}
          onClose={handleCloseJarOpenCelebration}
          onViewNotes={handleViewOpenedJarNotes}
        />
        <JarMenuModal
          open={jarInfoOpen}
          title="한 눈에 보는 저금통 정보"
          description="저금통 기본 정보와 시간 정보를 한 번에 확인할 수 있어요."
          badge={jar?.isOpen ? "OPEN" : "LOCKED"}
          palette={palette}
          onClose={() => setJarInfoOpen(false)}
          maxWidthClass="max-w-3xl"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {/* 저금통 ID는 화면에 보여주지 않는다.
                DB와 API에서는 jarId가 그대로 유지되므로 내부 식별에는 문제가 없다. */}
            <InfoItem
              label="내 역할"
              value={ROLE_LABEL[jar.myRole] || jar.myRole}
              className={palette.infoBox}
            />

            <InfoItem
              label="테마"
              value={THEME_LABEL[jar.theme] || jar.theme}
              className={palette.infoBox}
            />

            <InfoItem
              label="상태"
              value={jar.isOpen ? "공개됨" : "잠겨 있음"}
              className={palette.infoBox}
            />

            <InfoItem
              label="참여 인원"
              value={`${jar.memberCount} / ${jar.maxMembers}명`}
              className={palette.infoBox}
            />

            <InfoItem
              label="생성일"
              value={formatDate(jar.createdAt)}
              className={palette.infoBox}
            />

            <InfoItem
              label="최근 수정일"
              value={formatDate(jar.updatedAt)}
              className={palette.infoBox}
            />

            <div className="sm:col-span-2">
              <InfoItem
                label="오픈일"
                value={formatDate(jar.openAt)}
                className={palette.infoBox}
              />
            </div>
          </div>
        </JarMenuModal>

        <JarZoomNoteDetailModal
          open={jarZoomDetailOpen}
          note={jarZoomDetailNote}
          loading={jarZoomDetailLoading}
          error={jarZoomDetailError}
          jar={jar}
          palette={palette}
          onClose={handleCloseJarZoomNoteDetail}
          onRetry={() => handleOpenJarZoomNoteDetail(jarZoomDetailNoteId)}
          reacting={jarZoomReactingNoteId === jarZoomDetailNoteId}
          onReact={(emoji) => handleReactInJarZoomDetail(jarZoomDetailNoteId, emoji)}

          comments={jarZoomComments}
          commentsLoading={jarZoomCommentsLoading}
          commentsError={jarZoomCommentsError}
          currentUserId={me?.userId}
          commentDraft={commentDraft}
          onCommentDraftChange={setCommentDraft}
          onCreateComment={handleCreateComment}
          commentSubmitting={commentSubmitting}
          editingCommentId={editingCommentId}
          editingContent={editingContent}
          onStartEditComment={handleStartEditComment}
          onEditCommentChange={setEditingContent}
          onCancelEditComment={handleCancelEditComment}
          onUpdateComment={handleUpdateComment}
          deletingCommentId={deletingCommentId}
          onDeleteComment={handleDeleteComment}

          replyTargetCommentId={replyTargetCommentId}
          replyDraftMap={replyDraftMap}
          onToggleReply={handleToggleReply}
          onReplyDraftChange={handleReplyDraftChange}
          onCreateReply={handleCreateReply}
          replyExpandedMap={replyExpandedMap}
          onToggleReplies={handleToggleReplies}
          focusedCommentId={focusedCommentId}
        />

        {/* 멤버 목록 모달 */}
        <JarMenuModal
          open={memberListOpen}
          title="멤버 목록"
          description="지금 이 저금통에 함께 들어와 있는 사람들을 확인하고 관리할 수 있어요."
          badge={`${members.length}명`}
          palette={palette}
          onClose={() => setMemberListOpen(false)}
          maxWidthClass="max-w-4xl"
        >
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
                          alt={member.name || "멤버 프로필"}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-black ${palette.avatar}`}>
                          {(member.name || "?").slice(0, 1)}
                        </div>
                      )}

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-slate-800">
                            {member.name || `사용자 ${member.userId}`}
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

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {canChangeMemberRole && member.role !== "OWNER" ? (
                        <select
                          value={member.role}
                          disabled={roleUpdateLoadingId === member.userId || kickLoadingId === member.userId}
                          onChange={(e) => {
                            const nextRole = e.target.value;

                            if (nextRole === member.role) return;

                            handleChangeMemberRole(member.userId, nextRole);
                          }}
                          className={`rounded-full border px-3 py-2 text-xs font-bold outline-none transition disabled:cursor-not-allowed disabled:opacity-60 ${palette.input}`}
                        >
                          <option value="ADMIN">관리자</option>
                          <option value="MEMBER">멤버</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${roleChipClass}`}
                        >
                          {ROLE_LABEL[member.role] || member.role}
                        </span>
                      )}

                      {canKickMembers && member.role !== "OWNER" && (
                        <button
                          type="button"
                          disabled={kickLoadingId === member.userId || roleUpdateLoadingId === member.userId}
                          onClick={() =>
                            handleKickMember(member.userId, member.name, member.role)
                          }
                          className={`rounded-full px-3 py-2 text-xs font-bold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.dangerBtn}`}
                        >
                          {kickLoadingId === member.userId ? "강퇴 중..." : "강퇴"}
                        </button>
                      )}

                      {roleUpdateLoadingId === member.userId && (
                        <span className="text-xs font-semibold text-slate-500">
                          변경 중...
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </JarMenuModal>

        {/* 초대 관리 모달 */}
        <JarMenuModal
          open={inviteManageOpen}
          title="초대 관리"
          description="초대코드를 만들고, 보고, 필요하면 바로 폐기할 수 있어요."
          badge={`활성 ${activeInviteCount}개`}
          palette={palette}
          onClose={() => setInviteManageOpen(false)}
          maxWidthClass="max-w-5xl"
        >
        <section className={`rounded-[32px] border p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm ${palette.section}`}>
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
                className={`mb-5 rounded-2xl border p-4 ${palette.inviteCard}`}
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
                      className={`animate-pulse rounded-2xl border p-4 ${palette.inviteCard}`}
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

              {hiddenRevokedCount > 0 && (
                <div
                  className={`mb-4 flex flex-col gap-3 rounded-2xl border border-dashed px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${palette.hintBox}`}
                >
                  <p className="text-sm">
                    숨긴 폐기 코드가 <b>{hiddenRevokedCount}개</b> 있어요.
                  </p>

                  <button
                    type="button"
                    onClick={handleRestoreHiddenInvites}
                    className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                  >
                    숨긴 코드 다시 보기
                  </button>
                </div>
              )}

              {!invitesLoading &&
                !invitesError &&
                visibleInvites.length === 0 && (
                  <div
                    className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}
                  >
                    보이는 초대코드가 없어요.
                  </div>
                )}

              {!invitesLoading &&
                !invitesError &&
                visibleInvites.length > 0 && (
                  <>
                    <div className="space-y-3">
                      {pagedInvites.map((invite) => {
                        const status = getInviteStatus(
                          invite,
                          palette
                        );

                        return (
                          <div
                            key={invite.inviteId}
                            className={`rounded-2xl border p-4 ${palette.inviteCard}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  초대코드
                                </p>
                                <p className="mt-1 text-lg font-black tracking-[0.22em] text-slate-800">
                                  {invite.code}
                                </p>

                                  {/* 초대코드 밑에 실제 공유할 링크도 같이 보여줘 */}
                                  <div className={`mt-3 rounded-2xl border px-4 py-3 ${palette.inviteInfoBox}`}>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                      초대 링크
                                    </p>
                                    <p className="mt-2 break-all text-sm font-semibold text-slate-700">
                                      {getInviteUrl(invite.code)}
                                    </p>
                                  </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}
                                >
                                  {status.label}
                                </span>

                                {invite.revokedAt && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleHideRevokedInvite(
                                        invite.inviteId
                                      )
                                    }
                                    title="화면에서 숨기기"
                                    aria-label="폐기된 초대코드 숨기기"
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-base font-bold transition ${palette.outlineButton}`}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <InfoItem
                                label="만료 시간"
                                value={formatDate(
                                  invite.expiresAt
                                )}
                                className={
                                  palette.inviteInfoBox
                                }
                              />
                              <InfoItem
                                label="사용 횟수"
                                value={`${invite.usedCount} / ${invite.maxUses}`}
                                className={
                                  palette.inviteInfoBox
                                }
                              />
                              <InfoItem
                                label="만든 시간"
                                value={formatDate(
                                  invite.createdAt
                                )}
                                className={
                                  palette.inviteInfoBox
                                }
                              />
                              <InfoItem
                                label="폐기 시간"
                                value={formatDate(
                                  invite.revokedAt
                                )}
                                className={
                                  palette.inviteInfoBox
                                }
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
                                onClick={() => handleCopyInviteUrl(invite.code)}
                                className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                              >
                                링크 복사
                              </button>

                              <button
                                type="button"
                                onClick={() => handleRevokeInvite(invite.inviteId)}
                                disabled={!invite.isActive || revokeLoadingId === invite.inviteId}
                                className={`rounded-2xl px-4 py-2 text-sm font-bold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50 ${
                                  invite.isActive
                                    ? palette.dangerBtn
                                    : "bg-slate-200 text-slate-500"
                                }`}
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

                    <div className="mt-5 flex flex-col gap-3 border-t border-white/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-semibold text-slate-500">
                        {invitePage} / {invitePageCount} 페이지
                      </p>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setInvitePage((prev) =>
                              Math.max(1, prev - 1)
                            )
                          }
                          disabled={invitePage === 1}
                          className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineButton}`}
                        >
                          이전
                        </button>

                        {Array.from(
                          { length: invitePageCount },
                          (_, index) => index + 1
                        ).map((pageNumber) => (
                          <button
                            key={pageNumber}
                            type="button"
                            onClick={() =>
                              setInvitePage(pageNumber)
                            }
                            className={`rounded-2xl px-3 py-2 text-sm font-bold transition ${
                              pageNumber === invitePage
                                ? palette.primaryButton
                                : palette.outlineButton
                            }`}
                          >
                            {pageNumber}
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            setInvitePage((prev) =>
                              Math.min(
                                invitePageCount,
                                prev + 1
                              )
                            )
                          }
                          disabled={
                            invitePage === invitePageCount
                          }
                          className={`rounded-2xl border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${palette.outlineButton}`}
                        >
                          다음
                        </button>
                      </div>
                    </div>
                  </>
                )}
            </>
            )}
        </section>
        </JarMenuModal>

      </div>
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[32px] border border-white/70 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-lg font-black text-slate-800">저금통 설정 수정</p>
                <p className="mt-1 text-sm text-slate-500">
                  이름부터 오픈 방식, 잠금 레벨, 오픈일까지 한 번에 바꿀 수 있어요.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleUpdateJar} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    저금통 이름
                  </span>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    최대 인원
                  </span>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={editForm.maxMembers}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, maxMembers: e.target.value }))
                    }
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-slate-500">
                  설명
                </span>
                <textarea
                  rows="4"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    테마
                  </span>
                  <select
                    value={editForm.theme}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, theme: e.target.value }))
                    }
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  >
                    {Object.entries(THEME_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-500">
                    오픈일
                  </span>
                  <input
                    type="datetime-local"
                    value={editForm.openAt}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, openAt: e.target.value }))
                    }
                    className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${palette.input}`}
                  />
                </label>
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${palette.outlineBtn}`}
                >
                  취소
                </button>

                <button
                  type="submit"
                  disabled={editLoading}
                  className={`rounded-2xl px-4 py-3 text-sm font-bold shadow-md transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
                >
                  {editLoading ? "수정하는 중..." : "설정 저장하기"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
  );
}