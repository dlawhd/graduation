import { useRequestGate } from "../../../api/useRequestGate";
import { useCallback, useEffect, useMemo, useState, useRef, useLayoutEffect } from "react";
import apiClient, { fetchCsrf } from "../../../api/apiClient";
import { ROLE_LABEL } from "../constants/jarDetailLabels";

/*
 * useJarMembers 역할
 *
 * 저금통 상세 페이지의 멤버 관련 상태와 기능을 관리하는 Hook이야.
 *
 * 쉽게 말하면:
 * - 멤버 목록 불러오기
 * - 멤버 역할 변경하기
 * - 멤버 강퇴하기
 * - 내가 저금통에서 나가기
 * 를 JarDetailPage 대신 맡아주는 "멤버 관리 담당자"다.
 */
export function useJarMembers({ jarId, jar, navigate, loadJarDetail }) {
  const requests = useRequestGate(`${jarId}:${jar?.myRole || ""}`);
  const mutationPending = useRef(false);
  // 저금통에 참여 중인 멤버 목록
  const [members, setMembers] = useState([]);

  // 멤버 목록 로딩/에러 상태
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");

  // 역할 변경/강퇴/나가기 버튼별 로딩 상태
  const [roleUpdateLoadingId, setRoleUpdateLoadingId] = useState(null);
  const [kickLoadingId, setKickLoadingId] = useState(null);
  const [leaveLoading, setLeaveLoading] = useState(false);

  // 화면·권한 변경 뒤 이전 요청의 알림·이동·로딩 종료를 새 화면에 적용하지 않는다.
  useLayoutEffect(() => { mutationPending.current = false; setLeaveLoading(false); setRoleUpdateLoadingId(null); setKickLoadingId(null); }, [requests]);

  // 방장이 아니고, 현재 어떤 역할이든 있으면 나가기 가능하다.
  const canLeaveJar = !!jar?.myRole && jar.myRole !== "OWNER";

  // 역할 변경은 현재 백엔드 규칙상 OWNER만 가능하다.
  const canChangeMemberRole = jar?.myRole === "OWNER";

  // 강퇴는 OWNER 또는 ADMIN이 할 수 있다.
  const canKickMembers = jar?.myRole === "OWNER" || jar?.myRole === "ADMIN";

  /*
   * 멤버 목록을 서버에서 불러오는 함수야.
   */
  const loadMembers = useCallback(async () => {
    if (!jarId) return;
    const isCurrent = requests.begin("members");

    setMembersLoading(true);
    setMembersError("");

    try {
      const res = await apiClient.get(`/api/v1/jars/${jarId}/members`);
      const items = res.data?.data?.items || [];
      if (!isCurrent()) return false;

      setMembers(items);
    } catch (e) {
      if (!isCurrent()) return false;
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "멤버 목록을 불러오지 못했어요.";

      setMembersError(serverMessage);
      setMembers([]);
    } finally {
      if (isCurrent()) setMembersLoading(false);
    }
  }, [jarId, requests]);

  /*
   * 저금통 상세 페이지에 들어오거나 jarId가 바뀌면 멤버 목록을 다시 불러온다.
   */
  useEffect(() => {
    setMembers([]);
    loadMembers();
  }, [loadMembers]);

  /*
   * 멤버 목록을 역할 순서대로 정렬한다.
   *
   * OWNER → ADMIN → MEMBER 순서로 보여주면 관리자가 보기 쉽다.
   */
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

  /*
   * 현재 사용자가 저금통에서 나가는 함수야.
   */
  const handleLeaveJar = useCallback(async () => {
    if (mutationPending.current) return;
    if (!canLeaveJar) {
      window.alert("방장은 저금통을 바로 나갈 수 없어요.");
      return;
    }

    const ok = window.confirm(
      "정말 이 저금통에서 나갈까요?\n나가면 다시 초대를 받아야 들어올 수 있어요."
    );

    if (!ok) return;

    if (mutationPending.current) return;
    const current = requests.begin("mutation"); if (!current()) return;
    mutationPending.current = true;
    setLeaveLoading(true);

    try {
      await fetchCsrf();
      if (!current()) return;
      await apiClient.post(`/api/v1/jars/${jarId}/leave`);
      if (!current()) return;

      window.alert("저금통에서 나갔어요.");
      navigate("/jars", { replace: true });
    } catch (e) {
      if (!current()) return;
      const serverMessage =
        e?.response?.data?.error?.message ||
        e?.response?.data?.message ||
        e?.message ||
        "저금통 나가기에 실패했어요.";

      window.alert(serverMessage);
    } finally {
      if (current()) { mutationPending.current = false; setLeaveLoading(false); }
    }
  }, [canLeaveJar, jarId, navigate, requests]);

  /*
   * 멤버 역할을 OWNER가 변경하는 함수야.
   */
  const handleChangeMemberRole = useCallback(
    async (targetUserId, nextRole) => {
      if (mutationPending.current) return;
      if (!canChangeMemberRole) {
        window.alert("멤버 역할 변경은 방장만 할 수 있어요.");
        return;
      }

      const ok = window.confirm(
        `이 멤버의 역할을 ${ROLE_LABEL[nextRole] || nextRole}(으)로 바꿀까요?`
      );

      if (!ok) return;

      if (mutationPending.current) return;
      const current = requests.begin("mutation"); if (!current()) return;
      mutationPending.current = true;
      setRoleUpdateLoadingId(targetUserId);

      try {
        await fetchCsrf();
        if (!current()) return;

        await apiClient.patch(
          `/api/v1/jars/${jarId}/members/${targetUserId}/role`,
          { role: nextRole }
        );

        if (!current()) return;
        await loadMembers();
        if (!current()) return;
        await loadJarDetail();
        if (!current()) return;

        window.alert("멤버 역할을 변경했어요.");
      } catch (e) {
        if (!current()) return;
        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "멤버 역할 변경에 실패했어요.";

        window.alert(serverMessage);
      } finally {
        if (current()) { mutationPending.current = false; setRoleUpdateLoadingId(null); }
      }
    },
    [canChangeMemberRole, jarId, loadJarDetail, loadMembers, requests]
  );

  /*
   * 멤버를 저금통에서 내보내는 함수야.
   */
  const handleKickMember = useCallback(
    async (targetUserId, targetName, targetRole) => {
      if (mutationPending.current) return;
      if (!canKickMembers) {
        window.alert("멤버 강퇴는 방장 또는 관리자만 할 수 있어요.");
        return;
      }

      if (targetRole === "OWNER") {
        window.alert("방장은 강퇴할 수 없어요.");
        return;
      }

      const ok = window.confirm(
        `${targetName || "이 멤버"}님을 저금통에서 내보낼까요?`
      );

      if (!ok) return;

      if (mutationPending.current) return;
      const current = requests.begin("mutation"); if (!current()) return;
      mutationPending.current = true;
      setKickLoadingId(targetUserId);

      try {
        await fetchCsrf();
        if (!current()) return;
        await apiClient.post(`/api/v1/jars/${jarId}/members/${targetUserId}/kick`);

        if (!current()) return;
        await loadMembers();
        if (!current()) return;
        await loadJarDetail();
        if (!current()) return;

        window.alert("멤버를 강퇴했어요.");
      } catch (e) {
        if (!current()) return;
        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "멤버 강퇴에 실패했어요.";

        window.alert(serverMessage);
      } finally {
        if (current()) { mutationPending.current = false; setKickLoadingId(null); }
      }
    },
    [canKickMembers, jarId, loadJarDetail, loadMembers, requests]
  );

  return {
    members,
    setMembers,
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
  };
}
