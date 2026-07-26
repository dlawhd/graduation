import { useEffect, useRef } from "react";
import apiClient from "../../../api/apiClient";
import {
  subscribeDailyDrawSocket,
} from "../../../api/dailyDrawSocketApi";
import {
  subscribeJarMemberSocket,
} from "../../../api/jarMemberSocketApi";
import {
  subscribeJarOpenSocket,
} from "../../../api/jarOpenSocketApi";
import {
  subscribeJarNoteSocket,
} from "../../../api/noteSocketApi";
import {
  useStompClient,
} from "../../../realtime/StompClientProvider";
import {
  getCurrentUserIdFromMe,
} from "../utils/jarDetailUtils";
import {
  subscribeChatSocket,
} from "../../../api/chatSocketApi";
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
  // 채팅 unread 뱃지 실시간 갱신에 필요한 값
  jarChatOpen,
  setChatUnreadCount,
  loadChatUnreadCount,
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
   * subscribe:
   * - 필요한 topic을 구독할 때 사용한다.
   *
   * connected:
   * - WebSocket이 끊겼다가 다시 연결됐는지 확인할 때 사용한다.
   */
  const {
    connected,
    subscribe,
  } = useStompClient();

  // 로그인 사용자 ID를 한 번 계산해서 모든 실시간 구독이 같이 사용한다.
  const currentUserId = getCurrentUserIdFromMe(me);

  /*
   * chatConnectionStateRef 역할
   *
   * WebSocket의 첫 연결과 재연결을 구분한다.
   *
   * 첫 연결:
   * - JarDetailPage가 이미 REST로 unread를 조회하므로 추가 조회하지 않는다.
   *
   * 재연결:
   * - 연결이 끊긴 동안 놓친 메시지가 있을 수 있으므로
   *   REST로 unread를 한 번 다시 맞춘다.
   */
  const chatConnectionStateRef = useRef({
    connectionKey: null,
    wasConnected: false,
    hasConnectedOnce: false,
  });

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
   * dailyDrawEventLatestRef 역할
   *
   * Daily Draw WebSocket을 다시 구독하지 않고도
   * 가장 최신 함수와 타이머를 사용할 수 있게 보관하는 상자다.
   *
   * 쉽게 말하면:
   * - WebSocket 구독은 그대로 유지하고
   * - 화면에서 사용하는 함수만 최신 값으로 바꿔준다.
   */
  const dailyDrawEventLatestRef = useRef(null);

  /*
   * noteEventLatestRef 역할
   *
   * 쪽지 WebSocket을 다시 연결하지 않고도
   * 최신 함수와 최신 상세 모달 상태를 사용할 수 있게 해주는 상자다.
   *
   * 쉽게 말하면:
   * - WebSocket 연결은 jarId가 바뀔 때만 다시 만들고
   * - 이벤트 처리 함수들은 항상 최신 것으로 꺼내 쓴다.
   */
  const noteEventLatestRef = useRef(null);

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
   * 쪽지 관련 함수나 상세 모달 상태가 바뀔 때마다
   * Ref 안의 값만 최신 상태로 바꾼다.
   *
   * 이 Effect는 WebSocket을 끊거나 다시 연결하지 않는다.
   */
  useEffect(() => {
    noteEventLatestRef.current = {
      jarId,
      jarZoomDetailOpen,
      jarZoomDetailNoteId,
      loadJarZoomComments,
      patchCommentCountEverywhere,
      patchJarZoomDetailNote,
      patchJarZoomNoteInList,
    };
  }, [
    jarId,
    jarZoomDetailOpen,
    jarZoomDetailNoteId,
    loadJarZoomComments,
    patchCommentCountEverywhere,
    patchJarZoomDetailNote,
    patchJarZoomNoteInList,
  ]);

  /*
   * 저금통 멤버 변화 topic 구독
   *
   * 공용 WebSocket 연결은 그대로 유지하고,
   * 현재 저금통의 멤버 변화 topic만 구독한다.
   */
  useEffect(() => {
    if (!jarId) return;
    if (!currentUserId) return;

    const unsubscribe =
      subscribeJarMemberSocket({
        // Provider가 내려준 공용 구독 함수를 전달한다.
        subscribe,
        jarId,

        onMemberEventReceived: async (event) => {
          const eventType = event?.type;
          const targetUserId = Number(
            event?.targetUserId
          );

          /*
           * 내가 강퇴되거나 나간 이벤트라면
           * 더 이상 현재 저금통을 볼 수 없으므로 목록으로 이동한다.
           */
          if (
            (
              eventType === "MEMBER_KICKED" ||
              eventType === "MEMBER_LEFT"
            ) &&
            targetUserId === Number(currentUserId)
          ) {
            if (eventType === "MEMBER_KICKED") {
              window.alert(
                "이 저금통에서 내보내졌어요."
              );
            }

            navigate("/jars", {
              replace: true,
            });

            return;
          }

          /*
           * 다른 멤버의 가입, 탈퇴, 권한 변경이라면
           * 멤버 목록과 저금통 정보를 최신으로 맞춘다.
           */
          await Promise.allSettled([
            loadMembers(),
            loadJarDetail({
              silent: true,
            }),
          ]);
        },

        onError: (error) => {
          console.error(
            "저금통 멤버 WebSocket 오류",
            error
          );
        },
      });

    /*
     * 상세 페이지를 벗어날 때
     * 전체 WebSocket 연결이 아니라 멤버 topic만 해제한다.
     */
    return unsubscribe;
  }, [
    jarId,
    currentUserId,
    navigate,
    loadMembers,
    loadJarDetail,
    subscribe,
  ]);

  /*
   * 채팅 모달이 닫혀 있을 때 사용하는 unread 전용 채팅 구독
   *
   * 중요한 점:
   * - 채팅 모달이 열려 있으면 JarChatPanel이 채팅 topic을 구독한다.
   * - 채팅 모달이 닫혀 있을 때만 이 Hook이 같은 topic을 구독한다.
   *
   * 따라서 같은 화면에서 채팅 topic을 중복 구독하지 않는다.
   */
  useEffect(() => {
    if (!jarId) {
      return;
    }

    if (currentUserId == null) {
      return;
    }

    /*
     * 채팅 모달이 열려 있으면 JarChatPanel이:
     * - 새 메시지를 화면에 추가하고
     * - 해당 메시지를 읽음 처리한다.
     *
     * 이때 바깥 unread 구독은 필요하지 않다.
     */
    if (jarChatOpen) {
      return;
    }

    let disconnectedByCleanup = false;

    const unsubscribe = subscribeChatSocket({
      subscribe,
      jarId,

      onMessageReceived: (message) => {
        if (disconnectedByCleanup) {
          return;
        }

        /*
         * 혹시 다른 저금통의 이벤트가 들어오더라도
         * 현재 저금통의 뱃지를 변경하지 않는다.
         */
        if (
          Number(message?.jarId) !==
          Number(jarId)
        ) {
          return;
        }

        const senderId = message?.senderId;

        /*
         * 내가 직접 보낸 메시지는 unread로 세지 않는다.
         *
         * SYSTEM 메시지는 senderId가 null이므로
         * 다른 사람의 메시지처럼 unread에 포함된다.
         *
         * 이는 백엔드의 unread COUNT 규칙과 같다.
         */
        const isMyMessage =
          senderId !== null &&
          senderId !== undefined &&
          Number(senderId) ===
            Number(currentUserId);

        if (isMyMessage) {
          return;
        }

        /*
         * 새 메시지가 실제로 왔을 때만 뱃지를 1 증가시킨다.
         *
         * 이제 3초마다 서버에 물어볼 필요가 없다.
         */
        setChatUnreadCount((previousCount) => {
          const safePreviousCount =
            Number(previousCount) || 0;

          return safePreviousCount + 1;
        });
      },
    });

    return () => {
      disconnectedByCleanup = true;

      /*
       * 전체 공용 WebSocket 연결은 유지하고
       * unread용 채팅 topic 구독만 해제한다.
       */
      unsubscribe();
    };
  }, [
    jarId,
    currentUserId,
    jarChatOpen,
    setChatUnreadCount,
    subscribe,
  ]);

  /*
   * WebSocket 재연결 후 unread 개수를 서버 기준으로 다시 맞춘다.
   *
   * 재연결이 필요한 이유:
   * - 인터넷이 잠시 끊긴 동안 WebSocket 메시지를 놓칠 수 있다.
   * - 화면의 숫자를 단순히 +1 하는 방식만으로는
   *   놓친 메시지 개수를 알 수 없다.
   *
   * 따라서 연결이 다시 살아난 순간 REST를 한 번 호출한다.
   */
  useEffect(() => {
    const connectionKey =
      jarId && currentUserId != null
        ? `${Number(jarId)}:${Number(currentUserId)}`
        : null;

    /*
     * 저금통 또는 로그인 사용자가 아직 준비되지 않았다면
     * 연결 기억도 초기화한다.
     */
    if (!connectionKey) {
      chatConnectionStateRef.current = {
        connectionKey: null,
        wasConnected: false,
        hasConnectedOnce: false,
      };

      return;
    }

    const connectionState =
      chatConnectionStateRef.current;

    /*
     * 다른 저금통이나 다른 사용자로 바뀌었다면
     * 이전 연결 기록을 새 기준으로 초기화한다.
     */
    if (
      connectionState.connectionKey !==
      connectionKey
    ) {
      connectionState.connectionKey =
        connectionKey;

      connectionState.wasConnected = false;
      connectionState.hasConnectedOnce = false;
    }

    /*
     * false → true로 바뀐 순간만 연결 성공으로 판단한다.
     */
    const justConnected =
      connected &&
      !connectionState.wasConnected;

    if (justConnected) {
      /*
       * 첫 연결 때는 JarDetailPage의 최초 REST 조회가 있으므로
       * 중복 요청을 보내지 않는다.
       *
       * 한 번 연결된 적이 있는 상태에서 다시 연결된 경우만
       * 재연결로 판단한다.
       */
      if (
        connectionState.hasConnectedOnce &&
        !jarChatOpen
      ) {
        void loadChatUnreadCount();
      }

      connectionState.hasConnectedOnce = true;
    }

    connectionState.wasConnected = connected;
  }, [
    connected,
    jarId,
    currentUserId,
    jarChatOpen,
    loadChatUnreadCount,
  ]);

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

    if (!currentUserId) {
      return;
    }

    let disconnectedByCleanup = false;

    const unsubscribe =
      subscribeJarOpenSocket({
        // 공용 STOMP 구독 함수를 전달한다.
        subscribe,
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

    return () => {
      disconnectedByCleanup = true;

      /*
       * 전체 WebSocket 연결은 유지하고
       * 오픈 topic만 해제한다.
       */
      unsubscribe();

      const latest =
        jarOpenEventLatestRef.current;

      if (
        latest
          ?.jarOpenCelebrationTimerRef
          .current
      ) {
        window.clearTimeout(
          latest
            .jarOpenCelebrationTimerRef
            .current
        );

        latest
          .jarOpenCelebrationTimerRef
          .current = null;
      }
    };
  }, [
    jarId,
    currentUserId,
    subscribe,
  ]);

  /*
   * 저금통 전체 쪽지 WebSocket 연결
   *
   * 예전에는 쪽지 상세 모달을 열었을 때만
   * /topic/jars/{jarId}/notes/{noteId} 주소를 구독했다.
   *
   * 이제는 저금통 상세 페이지에 있는 동안
   * /topic/jars/{jarId}/notes 주소를 한 번만 구독한다.
   *
   * 따라서 쪽지 상세를 열지 않아도
   * 쪽지 목록의 댓글 개수와 리액션을 실시간으로 변경할 수 있다.
   */
  useEffect(() => {
    if (!jarId) {
      return;
    }

    if (!currentUserId) {
      return;
    }

    /*
     * 페이지 이동으로 연결을 정리한 뒤
     * 늦게 도착한 이벤트를 처리하지 않기 위한 표시다.
     */
    let disconnectedByCleanup = false;

    const unsubscribe = subscribeJarNoteSocket({
        // 공용 STOMP 구독 함수를 전달한다.
        subscribe,
        jarId,

      onNoteEventReceived: async (event) => {
        if (disconnectedByCleanup) {
          return;
        }

        /*
         * Ref에 저장된 가장 최신 함수와 상태를 가져온다.
         */
        const latest = noteEventLatestRef.current;

        if (!latest) {
          return;
        }

        const eventJarId = Number(event?.jarId);
        const eventNoteId = Number(event?.noteId);
        const eventType = event?.type;

        /*
         * 현재 보고 있는 저금통에서 발생한 이벤트인지 검사한다.
         *
         * 다른 저금통 이벤트가 들어오거나
         * noteId가 없는 잘못된 이벤트는 처리하지 않는다.
         */
        if (
          !eventJarId ||
          eventJarId !== Number(latest.jarId) ||
          !eventNoteId
        ) {
          return;
        }

        const isCommentEvent =
          eventType === "COMMENT_CREATED" ||
          eventType === "COMMENT_REPLIED" ||
          eventType === "COMMENT_UPDATED" ||
          eventType === "COMMENT_DELETED";

        /*
         * 댓글·답글 관련 이벤트 처리
         */
        if (isCommentEvent) {
          const rawCommentCount = event?.commentCount;
          const eventCommentCount = Number(rawCommentCount);

          /*
           * 댓글 작성·답글·삭제 이벤트에는
           * 서버가 최신 댓글 개수를 함께 보낸다.
           *
           * COMMENT_UPDATED는 개수가 달라지지 않으므로
           * commentCount가 null이다.
           *
           * 주의:
           * Number(null)은 0이 되기 때문에
           * null 여부를 먼저 확인해야 한다.
           */
          if (
            rawCommentCount !== null &&
            rawCommentCount !== undefined &&
            Number.isFinite(eventCommentCount)
          ) {
            latest.patchCommentCountEverywhere(
              eventNoteId,
              eventCommentCount
            );
          }

          /*
           * 현재 상세 화면으로 보고 있는 쪽지와
           * 이벤트가 발생한 쪽지가 같은지 확인한다.
           *
           * 예:
           * - 현재 2번 쪽지 상세를 보고 있음
           * - 1번 쪽지에 댓글 이벤트 발생
           *
           * 이 경우 2번 쪽지의 댓글 목록은 건드리지 않는다.
           */
          const isCurrentDetailNote =
            latest.jarZoomDetailOpen &&
            Number(latest.jarZoomDetailNoteId) ===
              eventNoteId;

          /*
           * 현재 상세로 보고 있는 쪽지에서 발생한 이벤트일 때만
           * 댓글 내용 목록을 다시 불러온다.
           */
          if (isCurrentDetailNote) {
            await latest.loadJarZoomComments(
              eventNoteId
            );
          }

          return;
        }

        /*
         * 리액션 변경 이벤트 처리
         */
        if (eventType === "REACTION_CHANGED") {
          /*
           * myReaction은 사용자마다 다르므로
           * 현재 로그인한 사용자 기준으로 최신 상태를 다시 조회한다.
           */
          const response = await apiClient.get(
            `/api/v1/jars/${latest.jarId}/notes/${eventNoteId}/reactions`
          );

          /*
           * API 요청 중 페이지를 나갔다면
           * 더 이상 화면 상태를 수정하지 않는다.
           */
          if (disconnectedByCleanup) {
            return;
          }

          const summary = response.data?.data;

          /*
           * 두 함수 내부에서 noteId를 비교하기 때문에
           * 이벤트가 발생한 쪽지 한 개만 변경된다.
           */
          latest.patchJarZoomDetailNote(
            eventNoteId,
            summary
          );

          latest.patchJarZoomNoteInList(
            eventNoteId,
            summary
          );
        }
      },

      onError: (error) => {
        /*
         * React cleanup으로 직접 종료한 연결의 오류는 무시한다.
         */
        if (disconnectedByCleanup) {
          return;
        }

        console.error(
          "저금통 쪽지 WebSocket 오류",
          error
        );
      },
    });

    return () => {
      disconnectedByCleanup = true;

      /*
       * 공용 연결은 유지하고
       * 쪽지 topic만 해제한다.
       */
      unsubscribe();
    };
  }, [
    jarId,
    currentUserId,
    subscribe,
  ]);

  /*
   * Daily Draw에서 사용하는 함수와 상태를
   * 항상 최신 값으로 Ref에 저장한다.
   *
   * 이 Effect는 WebSocket을 해제하거나 다시 구독하지 않는다.
   */
  useEffect(() => {
    dailyDrawEventLatestRef.current = {
      setDailyDrawRealtimeMessage,
      dailyDrawRealtimeMessageTimerRef,
      loadDailyDrawToday,
      loadDailyDrawHistory,
      loadJarZoomNotes,
    };
  }, [
    setDailyDrawRealtimeMessage,
    dailyDrawRealtimeMessageTimerRef,
    loadDailyDrawToday,
    loadDailyDrawHistory,
    loadJarZoomNotes,
  ]);

  /*
   * Daily Draw topic 구독
   *
   * 공용 WebSocket 연결은 그대로 유지하고,
   * 현재 저금통의 Daily Draw topic만 구독한다.
   *
   * 중요한 점:
   * - jarId가 바뀔 때
   * - 로그인 사용자가 바뀔 때
   * - 저금통이 열리거나 잠길 때
   *
   * 위 상황에서만 구독 상태를 변경한다.
   *
   * 화면 함수가 새로 만들어졌다는 이유로
   * WebSocket을 다시 구독하지 않는다.
   */
  useEffect(() => {
    if (!jarId) return;
    if (!currentUserId) return;
    if (!jar?.isOpen) return;

    const unsubscribe =
      subscribeDailyDrawSocket({
        // 공용 STOMP Client의 구독 함수를 전달한다.
        subscribe,
        jarId,

        onDailyDrawRevealed: async (event) => {
          /*
           * 이벤트가 도착한 순간의
           * 가장 최신 함수와 Ref를 꺼낸다.
           */
          const latest =
            dailyDrawEventLatestRef.current;

          if (!latest) {
            return;
          }

          /*
           * 사용자에게 실시간 갱신 안내 문구를 보여준다.
           */
          latest.setDailyDrawRealtimeMessage(
            event?.message ||
              "오늘의 추억 한 장이 공개되어 화면을 최신으로 맞췄어요."
          );

          /*
           * 이전 안내 문구 제거 타이머가 남아 있다면
           * 새로운 타이머를 만들기 전에 먼저 제거한다.
           */
          if (
            latest.dailyDrawRealtimeMessageTimerRef
              .current
          ) {
            window.clearTimeout(
              latest
                .dailyDrawRealtimeMessageTimerRef
                .current
            );
          }

          /*
           * 안내 문구를 4초 뒤 자동으로 지운다.
           */
          latest.dailyDrawRealtimeMessageTimerRef.current =
            window.setTimeout(() => {
              latest.setDailyDrawRealtimeMessage("");
            }, 4000);

          /*
           * WebSocket 이벤트를 신호로 사용하고,
           * 실제 최신 데이터는 REST API로 다시 조회한다.
           */
          await Promise.allSettled([
            latest.loadDailyDrawToday({
              silent: true,
            }),
            latest.loadDailyDrawHistory({
              silent: true,
            }),
          ]);

          await latest.loadJarZoomNotes();
        },

        onError: (error) => {
          console.error(
            "Daily Draw WebSocket 오류",
            error
          );
        },
      });

    /*
     * 상세 페이지를 나가거나,
     * jarId 또는 로그인 사용자가 바뀌거나,
     * 저금통이 잠금 상태가 되면
     * Daily Draw topic만 구독 해제한다.
     */
    return () => {
      unsubscribe();

      const latest =
        dailyDrawEventLatestRef.current;

      if (
        latest
          ?.dailyDrawRealtimeMessageTimerRef
          ?.current
      ) {
        window.clearTimeout(
          latest
            .dailyDrawRealtimeMessageTimerRef
            .current
        );

        latest.dailyDrawRealtimeMessageTimerRef.current =
          null;
      }
    };
  }, [
    jarId,
    currentUserId,
    jar?.isOpen,
    subscribe,
  ]);
}