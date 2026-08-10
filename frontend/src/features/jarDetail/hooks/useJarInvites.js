import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient, { fetchCsrf } from "../../../api/apiClient";

// 초대코드는 한 번에 2개씩만 보여준다.
const INVITES_PER_PAGE = 2;

/*
 * useJarInvites 역할
 *
 * 저금통 상세 페이지의 초대코드 관련 상태와 기능을 관리하는 Hook이야.
 *
 * 쉽게 말하면:
 * - 초대코드 목록 불러오기
 * - 초대코드 만들기
 * - 초대코드 복사하기
 * - 초대코드 폐기/숨김 처리하기
 * - 초대코드 페이지 계산하기
 * 를 JarDetailPage 대신 맡아주는 "초대 관리 담당자"다.
 */
export function useJarInvites({ jarId, jar }) {
  // 초대코드 목록 상태
  const [invites, setInvites] = useState([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [invitesError, setInvitesError] = useState("");

  // 초대 생성 폼 상태
  const [inviteForm, setInviteForm] = useState({
    expiresInHours: "24",
    maxUses: "1",
  });

  // 초대코드 생성/폐기 버튼 로딩 상태
  const [createInviteLoading, setCreateInviteLoading] = useState(false);
  const [revokeLoadingId, setRevokeLoadingId] = useState(null);

  // 초대코드 목록은 2개씩 페이지처럼 보여준다.
  const [invitePage, setInvitePage] = useState(1);

  // 사용자가 화면에서 숨긴 폐기 코드 id 목록
  const [hiddenInviteIds, setHiddenInviteIds] = useState([]);

  // localStorage에서 숨김 목록을 다 읽었는지 표시하는 값
  const [hiddenInvitesReady, setHiddenInvitesReady] = useState(false);

  // 저금통마다 숨김 목록을 따로 저장하려고 key를 jarId 기준으로 만든다.
  const hiddenInviteStorageKey = `jar-detail-hidden-revoked-invites:${jarId}`;

  // 초대 관리는 OWNER 또는 ADMIN만 가능하다.
  const canManageInvites = jar?.myRole === "OWNER" || jar?.myRole === "ADMIN";

  /*
   * 초대 목록을 서버에서 불러오는 함수야.
   */
  const loadInvites = useCallback(async () => {
    if (!jarId) return;

    setInvitesLoading(true);
    setInvitesError("");

    try {
      const res = await apiClient.get(`/api/v1/jars/${jarId}/invites`);
      const items = res.data?.data?.items || [];

      setInvites(items);

      // 이미 서버에 없어진 코드나, 폐기 상태가 아닌 코드는 숨김 목록에서 정리한다.
      setHiddenInviteIds((prev) =>
        prev.filter((hiddenId) =>
          items.some(
            (invite) =>
              Number(invite.inviteId) === Number(hiddenId) && invite.revokedAt
          )
        )
      );
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
  }, [jarId]);

  /*
   * OWNER/ADMIN이면 초대 목록을 불러오고,
   * 일반 멤버라면 초대 목록 상태를 비운다.
   */
  useEffect(() => {
    if (!jar) return;

    if (canManageInvites) {
      loadInvites();
      return;
    }

    setInvites([]);
    setInvitesError("");
    setInvitesLoading(false);
  }, [jar, canManageInvites, loadInvites]);

  /*
   * 페이지를 다시 열어도 내가 숨긴 폐기 코드는 그대로 안 보이게 저장값을 꺼낸다.
   */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(hiddenInviteStorageKey);
      const parsed = saved ? JSON.parse(saved) : [];

      // 혹시 문자열로 저장돼 있어도 숫자로 통일한다.
      const normalized = Array.isArray(parsed)
        ? parsed.map((id) => Number(id)).filter((id) => !Number.isNaN(id))
        : [];

      setHiddenInviteIds(normalized);
    } catch {
      setHiddenInviteIds([]);
    } finally {
      // 이제 숨김 목록을 다 읽었으니 준비 완료
      setHiddenInvitesReady(true);
    }
  }, [hiddenInviteStorageKey]);

  /*
   * 숨긴 코드 목록이 바뀔 때마다 브라우저에 저장한다.
   */
  useEffect(() => {
    if (!hiddenInvitesReady) return;

    try {
      localStorage.setItem(
        hiddenInviteStorageKey,
        JSON.stringify(hiddenInviteIds)
      );
    } catch {
      // 저장 실패는 화면을 멈출 정도의 문제는 아니라서 조용히 넘어간다.
    }
  }, [hiddenInviteStorageKey, hiddenInviteIds, hiddenInvitesReady]);

  // 활성 초대코드 개수
  const activeInviteCount = useMemo(() => {
    return invites.filter((invite) => invite.isActive).length;
  }, [invites]);

  // X로 숨긴 초대코드는 목록에서 제외한다.
  const visibleInvites = useMemo(() => {
    if (!hiddenInvitesReady) return [];

    return invites.filter(
      (invite) => !hiddenInviteIds.includes(Number(invite.inviteId))
    );
  }, [invites, hiddenInviteIds, hiddenInvitesReady]);

  // 새로 만든 초대코드가 먼저 보이도록 최신순 정렬한다.
  const orderedInvites = useMemo(() => {
    return [...visibleInvites].sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();

      return bTime - aTime;
    });
  }, [visibleInvites]);

  // 총 페이지 수 계산
  const invitePageCount = useMemo(() => {
    return Math.max(1, Math.ceil(orderedInvites.length / INVITES_PER_PAGE));
  }, [orderedInvites]);

  // 현재 페이지에 보여줄 2개만 잘라서 꺼낸다.
  const pagedInvites = useMemo(() => {
    const startIndex = (invitePage - 1) * INVITES_PER_PAGE;

    return orderedInvites.slice(startIndex, startIndex + INVITES_PER_PAGE);
  }, [orderedInvites, invitePage]);

  // 숨긴 폐기 코드가 몇 개인지 센다.
  const hiddenRevokedCount = useMemo(() => {
    return invites.filter((invite) => hiddenInviteIds.includes(invite.inviteId))
      .length;
  }, [invites, hiddenInviteIds]);

  // 현재 페이지가 범위를 벗어나면 마지막 페이지로 자동 보정한다.
  useEffect(() => {
    if (invitePage > invitePageCount) {
      setInvitePage(invitePageCount);
    }
  }, [invitePage, invitePageCount]);

  /*
   * 초대코드로 실제 공유용 링크를 만드는 함수야.
   */
  const getInviteUrl = useCallback((code) => {
    if (!code) return "";

    // 지금 접속한 주소를 기준으로 자동으로 맞춘다.
    return `${window.location.origin}/invite/${code}`;
  }, []);

  /*
   * 초대코드를 새로 만드는 함수야.
   */
  const handleCreateInvite = useCallback(
    async (e) => {
      e.preventDefault();

      const expiresInHours = Math.min(
        168,
        Math.max(1, Number(inviteForm.expiresInHours || 24))
      );

      const maxUses = Math.min(50, Math.max(1, Number(inviteForm.maxUses || 1)));

      setCreateInviteLoading(true);

      try {
        await fetchCsrf();

        const res = await apiClient.post(`/api/v1/jars/${jarId}/invites`, {
          expiresInHours,
          maxUses,
        });

        const created = res.data?.data;

        await loadInvites();

        // 새 코드를 만들면 첫 페이지로 보내서 바로 보이게 한다.
        setInvitePage(1);

        const createdInviteUrl = created?.code ? getInviteUrl(created.code) : "";

        window.alert(
          created?.code
            ? `초대코드가 만들어졌어요.\n코드: ${created.code}\n링크: ${createdInviteUrl}`
            : "초대코드가 만들어졌어요."
        );
        /*
         * JarDetailPage의 튜토리얼도
         * 방금 만들어진 초대코드 번호를 알아야 하므로
         * 생성 결과를 부모에게 돌려준다.
         */
        return created;
      } catch (e) {
        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message |
          e?.message ||
          "초대코드 생성에 실패했어요.";

        window.alert(serverMessage);
        return null;
      } finally {
        setCreateInviteLoading(false);
      }
    },
    [getInviteUrl, inviteForm.expiresInHours, inviteForm.maxUses, jarId, loadInvites]
  );

  /*
   * 초대 링크를 복사하는 함수야.
   */
  const handleCopyInviteUrl = useCallback(
    async (code) => {
      try {
        const inviteUrl = getInviteUrl(code);

        await navigator.clipboard.writeText(inviteUrl);
        window.alert("초대 링크를 복사했어요.");
      } catch {
        window.alert("링크 복사에 실패했어요. 다시 한 번 시도해 주세요.");
      }
    },
    [getInviteUrl]
  );

  /*
   * 초대코드 자체를 복사하는 함수야.
   */
  const handleCopyInviteCode = useCallback(async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      window.alert("초대코드를 복사했어요.");
    } catch {
      window.alert("복사에 실패했어요. 다시 한 번 시도해 주세요.");
    }
  }, []);

  /*
   * 초대코드를 폐기하는 함수야.
   */
  const handleRevokeInvite = useCallback(
    async (inviteId) => {
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
    },
    [jarId, loadInvites]
  );

  /*
   * 폐기된 초대코드를 화면에서 숨기는 함수야.
   */
  const handleHideRevokedInvite = useCallback(
    (inviteId) => {
      const targetInvite = invites.find((invite) => invite.inviteId === inviteId);

      if (!targetInvite?.revokedAt) {
        window.alert("폐기된 초대코드만 화면에서 숨길 수 있어요.");
        return;
      }

      setHiddenInviteIds((prev) => {
        const normalizedId = Number(inviteId);

        if (prev.includes(normalizedId)) return prev;

        return [...prev, normalizedId];
      });
    },
    [invites]
  );

  /*
   * 숨겼던 폐기 코드들을 다시 보이게 하는 함수야.
   */
  const handleRestoreHiddenInvites = useCallback(() => {
    setHiddenInviteIds([]);
  }, []);

  return {
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
    loadInvites,
    getInviteUrl,
    handleCreateInvite,
    handleCopyInviteUrl,
    handleCopyInviteCode,
    handleRevokeInvite,
    handleHideRevokedInvite,
    handleRestoreHiddenInvites,
  };
}