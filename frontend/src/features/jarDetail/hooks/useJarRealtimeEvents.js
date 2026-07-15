import { useEffect, useRef } from "react";
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
   * jarOpenEventLatestRef 역할
   *
   * 저금통 오픈 WebSocket을 다시 연결하지 않고도
   * 가장 최신 함수와 모달 상태를 사용할 수 있게 보관하는 상자야.
   *
   * 쉽게 말하면:
   * - WebSocket 연결은 그대로 유지하고
   * - 화면 상태만 최신 값으로 갈아 끼운다.
   */
  const jarOpenEventLatestRef = useRef(null);

  /*
   * 화면 상태나 함수가 바뀔 때마다
   * Ref 안의 값만 최신 상태로 바꾼다.
   *
   * 이 Effect는 WebSocket을 끊거나 다시 연결하지 않는다.
   */
  useEffect(() => {
    jarOpenEventLatestRef.current = {
      setJar,
      jarOpenCelebrationTimerRef,
      showJarOpenCelebration,
      setNoteSectionRefreshKey,
      loadJarDetail,
      loadJarZoomNotes,
      jarZoomDetailOpen,
      jarZoomDetailNoteId,
      handleOpenJarZoomNoteDetail,
    };
  }, [
    setJar,
    jarOpenCelebrationTimerRef,
    showJarOpenCelebration,
    setNoteSectionRefreshKey,
    loadJarDetail,
    loadJarZoomNotes,
    jarZoomDetailOpen,
    jarZoomDetailNoteId,
    handleOpenJarZoomNoteDetail,
  ]);

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
   *
   * 이 연결은 jarId가 바뀔 때만 새로 만든다.
   *
   * 쪽지 모달이나 축하 모달이 열리고 닫히더라도
   * 기존 WebSocket 연결은 그대로 유지한다.
   */
  useEffect(() => {
    if (!jarId) {
      return;
    }

    /*
     * cleanup이 실행됐는지 기억한다.
     *
     * 페이지 이동이나 저금통 변경으로 종료한 WebSocket에서
     * 뒤늦게 error 이벤트가 발생해도 불필요한 오류 로그를 남기지 않는다.
     */
    let disconnectedByCleanup = false;

    const client = createJarOpenSocketClient({
      jarId,

      onJarOpened: async (event) => {
        /*
         * 이미 페이지를 떠나면서 정리된 연결이라면
         * 뒤늦게 도착한 이벤트를 처리하지 않는다.
         */
        if (disconnectedByCleanup) {
          return;
        }

        const latest = jarOpenEventLatestRef.current;

        if (!latest) {
          return;
        }

        /*
         * 이전 축하 모달 자동 종료 타이머가 있다면 제거한다.
         */
        if (latest.jarOpenCelebrationTimerRef.current) {
          window.clearTimeout(
            latest.jarOpenCelebrationTimerRef.current
          );

          latest.jarOpenCelebrationTimerRef.current = null;
        }

        /*
         * 화면의 저금통 상태를 즉시 열린 상태로 바꾼다.
         */
        latest.setJar((prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            isOpen: true,
          };
        });

        /*
         * 잠겨 있던 쪽지 목록을 다시 조회하게 만든다.
         */
        latest.setNoteSectionRefreshKey((prev) => prev + 1);

        /*
         * WebSocket과 REST가 함께 사용하는 공통 함수로
         * 축하 모달을 연다.
         */
        latest.showJarOpenCelebration(event);

        /*
         * 서버의 최신 저금통 정보와 쪽지 목록을 다시 불러온다.
         */
        await Promise.allSettled([
          latest.loadJarDetail({ silent: true }),
          latest.loadJarZoomNotes(),
        ]);

        /*
         * 비동기 조회 중에 페이지를 떠났다면
         * 아래 화면 갱신은 실행하지 않는다.
         */
        if (disconnectedByCleanup) {
          return;
        }

        /*
         * 조회가 끝나는 동안 모달 상태가 바뀔 수 있으므로
         * Ref에서 가장 최신 값을 다시 가져온다.
         */
        const newest = jarOpenEventLatestRef.current;

        /*
         * 쪽지 상세 모달을 보고 있었다면
         * 해당 쪽지도 오픈된 내용으로 다시 조회한다.
         */
        if (
          newest?.jarZoomDetailOpen &&
          newest?.jarZoomDetailNoteId
        ) {
          await newest.handleOpenJarZoomNoteDetail(
            newest.jarZoomDetailNoteId
          );
        }
      },

      onError: (error) => {
        /*
         * React cleanup 때문에 우리가 직접 종료한 연결에서는
         * 오류 로그를 출력하지 않는다.
         */
        if (disconnectedByCleanup) {
          return;
        }

        console.error("저금통 오픈 WebSocket 오류", error);
      },
    });

    client.activate();

    return () => {
      /*
       * 먼저 우리가 의도해서 종료한다는 것을 표시한다.
       *
       * deactivate 과정에서 error 이벤트가 발생해도
       * 위의 onError에서 무시할 수 있다.
       */
      disconnectedByCleanup = true;

      disconnectJarOpenSocket(client);

      const latest = jarOpenEventLatestRef.current;

      if (latest?.jarOpenCelebrationTimerRef.current) {
        window.clearTimeout(
          latest.jarOpenCelebrationTimerRef.current
        );

        latest.jarOpenCelebrationTimerRef.current = null;
      }
    };
  }, [jarId]);

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