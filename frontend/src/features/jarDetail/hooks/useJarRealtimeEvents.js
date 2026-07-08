import { useEffect } from "react";
import apiClient from "../../../api/apiClient";
import {
  createDailyDrawSocketClient,
  disconnectDailyDrawSocket,
} from "../../../api/dailyDrawSocketApi";
import {
  createJarMemberSocketClient,
  disconnectJarMemberSocket,
} from "../../../api/jarMemberSocketApi";
import {
  createJarOpenSocketClient,
  disconnectJarOpenSocket,
} from "../../../api/jarOpenSocketApi";
import {
  createNoteSocketClient,
  disconnectNoteSocket,
} from "../../../api/noteSocketApi";
import { getCurrentUserIdFromMe, getTotalCommentCount } from "../utils/jarDetailUtils";

/*
 * useJarRealtimeEvents 역할
 *
 * 저금통 상세 페이지에서 사용하는 WebSocket 구독을 한곳에 모아 관리하는 Hook이야.
 *
 * 쉽게 말하면:
 * - 멤버 변화 이벤트
 * - 저금통 오픈 이벤트
 * - 쪽지 상세 댓글/리액션 이벤트
 * - 오늘의 추억 한 장 이벤트
 * 를 JarDetailPage 대신 연결하고 정리해주는 "실시간 이벤트 담당자"다.
 */
export function useJarRealtimeEvents({
  jarId,
  jar,
  me,
  navigate,
  loadMembers,
  loadJarDetail,
  setJar,
  jarOpenCelebrationTimerRef,
  showJarOpenCelebration,
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
}) {
  /*
   * 저금통 멤버 변화 WebSocket 연결
   */
  useEffect(() => {
    if (!jarId) return;

    const currentUserId = getCurrentUserIdFromMe(me);

    if (!currentUserId) return;

    const client = createJarMemberSocketClient({
      jarId,

      onMemberEventReceived: async (event) => {
        const eventType = event?.type;
        const targetUserId = Number(event?.targetUserId);

        if (
          (eventType === "MEMBER_KICKED" || eventType === "MEMBER_LEFT") &&
          targetUserId === currentUserId
        ) {
          if (eventType === "MEMBER_KICKED") {
            window.alert("이 저금통에서 내보내졌어요.");
          }

          navigate("/jars", { replace: true });
          return;
        }

        await Promise.allSettled([
          loadMembers(),
          loadJarDetail({ silent: true }),
        ]);
      },

      onError: (error) => {
        console.error("저금통 멤버 WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      disconnectJarMemberSocket(client);
    };
  }, [jarId, me?.userId, me?.id, navigate]);

  /*
   * 저금통 오픈 WebSocket 연결
   */
  useEffect(() => {
    if (!jarId) return;

    const client = createJarOpenSocketClient({
      jarId,

      onJarOpened: async (event) => {
        if (jarOpenCelebrationTimerRef.current) {
          window.clearTimeout(jarOpenCelebrationTimerRef.current);
        }

        setJar((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            isOpen: true,
          };
        });

        /*
         * WebSocket 이벤트를 받았을 때도
         * JarDetailPage의 공통 모달 열기 함수를 사용한다.
         *
         * REST와 WebSocket이 거의 동시에 오픈을 발견해도
         * 공통 함수가 모달 중복 표시를 막아준다.
         */
        setNoteSectionRefreshKey((prev) => prev + 1);
        showJarOpenCelebration(event);

        await Promise.allSettled([
          loadJarDetail({ silent: true }),
          loadJarZoomNotes(),
        ]);

        if (jarZoomDetailOpen && jarZoomDetailNoteId) {
          await handleOpenJarZoomNoteDetail(jarZoomDetailNoteId);
        }
      },

      onError: (error) => {
        console.error("저금통 오픈 WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      disconnectJarOpenSocket(client);

      if (jarOpenCelebrationTimerRef.current) {
        window.clearTimeout(jarOpenCelebrationTimerRef.current);
      }
    };
  }, [
    jarId,
    jarZoomDetailOpen,
    jarZoomDetailNoteId,
    showJarOpenCelebration,
  ]);

  /*
   * 쪽지 상세 모달 WebSocket 연결
   */
  useEffect(() => {
    if (!jarZoomDetailOpen) return;
    if (!jarId || !jarZoomDetailNoteId) return;

    const client = createNoteSocketClient({
      jarId,
      noteId: jarZoomDetailNoteId,

      onNoteEventReceived: async (event) => {
        const eventType = event?.type;
        const eventNoteId = Number(event?.noteId);

        if (!eventNoteId || eventNoteId !== Number(jarZoomDetailNoteId)) {
          return;
        }

        if (
          eventType === "COMMENT_CREATED" ||
          eventType === "COMMENT_REPLIED" ||
          eventType === "COMMENT_UPDATED" ||
          eventType === "COMMENT_DELETED"
        ) {
          const refreshedComments = await loadJarZoomComments(eventNoteId);
          patchCommentCountEverywhere(
            eventNoteId,
            getTotalCommentCount(refreshedComments)
          );
          return;
        }

        if (eventType === "REACTION_CHANGED") {
          const res = await apiClient.get(
            `/api/v1/jars/${jarId}/notes/${eventNoteId}/reactions`
          );

          const summary = res.data?.data;

          patchJarZoomDetailNote(eventNoteId, summary);
          patchJarZoomNoteInList(eventNoteId, summary);
        }
      },

      onError: (error) => {
        console.error("쪽지 상세 WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      disconnectNoteSocket(client);
    };
  }, [jarId, jarZoomDetailOpen, jarZoomDetailNoteId]);

  /*
   * Daily Draw WebSocket 연결
   */
  useEffect(() => {
    if (!jarId) return;
    if (!jar) return;
    if (!jar.isOpen) return;

    const client = createDailyDrawSocketClient({
      jarId,

      onDailyDrawRevealed: async (event) => {
        setDailyDrawRealtimeMessage(
          event?.message || "오늘의 추억 한 장이 공개되어 화면을 최신으로 맞췄어요."
        );

        if (dailyDrawRealtimeMessageTimerRef.current) {
          window.clearTimeout(dailyDrawRealtimeMessageTimerRef.current);
        }

        dailyDrawRealtimeMessageTimerRef.current = window.setTimeout(() => {
          setDailyDrawRealtimeMessage("");
        }, 4000);

        await Promise.allSettled([
          loadDailyDrawToday({ silent: true }),
          loadDailyDrawHistory({ silent: true }),
        ]);

        await loadJarZoomNotes();
      },

      onError: (error) => {
        console.error("Daily Draw WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      disconnectDailyDrawSocket(client);

      if (dailyDrawRealtimeMessageTimerRef.current) {
        window.clearTimeout(dailyDrawRealtimeMessageTimerRef.current);
      }
    };
  }, [jarId, jar?.isOpen]);
}