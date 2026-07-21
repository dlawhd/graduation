import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Client } from "@stomp/stompjs";
import { getWebSocketUrl } from "../api/socketUrl";

/*
 * StompClientProvider 역할
 *
 * 애플리케이션 전체에서 STOMP Client 한 개만 만들고 공유하는 Provider다.
 *
 * 쉽게 말하면:
 * - 서버까지 연결되는 WebSocket 전화선은 한 개만 만든다.
 * - 알림, 멤버, 오픈, 쪽지, Daily Draw, 채팅은
 *   그 전화선에서 각자 필요한 topic만 구독한다.
 * - 연결이 끊겼다가 다시 연결되면 기존 topic을 자동으로 다시 구독한다.
 */
const StompClientContext = createContext(null);

export function StompClientProvider({ children }) {
  // 실제 STOMP Client 한 개를 보관한다.
  const clientRef = useRef(null);

  // 화면들이 요청한 topic 구독 정보를 보관한다.
  const subscriptionRegistryRef = useRef(new Map());

  // 현재 WebSocket 세션에서 실제로 만들어진 구독 객체를 보관한다.
  const activeSubscriptionsRef = useRef(new Map());

  // 각 구독을 구분하기 위한 번호표다.
  const nextSubscriptionIdRef = useRef(1);

  // 현재 공용 WebSocket 연결 상태다.
  const [connected, setConnected] = useState(false);

  // 가장 최근 연결 오류를 보관한다.
  const [lastError, setLastError] = useState(null);

  /*
   * 공용 연결 오류를 현재 등록된 구독 담당자들에게 알려준다.
   */
  const notifyConnectionError = useCallback((error) => {
    setLastError(error);

    subscriptionRegistryRef.current.forEach((registration) => {
      registration.onError?.(error);
    });
  }, []);

  /*
   * 등록된 구독 하나를 현재 STOMP 연결에 실제로 붙인다.
   */
  const attachSubscription = useCallback(
    (subscriptionId, registration) => {
      const client = clientRef.current;

      if (!client?.connected) {
        return;
      }

      // 같은 번호의 이전 구독이 남아 있으면 먼저 정리한다.
      activeSubscriptionsRef.current
        .get(subscriptionId)
        ?.unsubscribe();

      const stompSubscription = client.subscribe(
        registration.destination,
        (message) => {
          registration.onMessage?.(message);
        }
      );

      activeSubscriptionsRef.current.set(
        subscriptionId,
        stompSubscription
      );
    },
    []
  );

  /*
   * STOMP Client가 아직 없을 때 한 번만 만든다.
   */
  const getOrCreateClient = useCallback(() => {
    if (clientRef.current) {
      return clientRef.current;
    }

    const client = new Client({
      brokerURL: getWebSocketUrl(),

      // 연결이 끊기면 3초 뒤 공용 연결 한 번만 다시 시도한다.
      reconnectDelay: 3000,

      onConnect: () => {
        setConnected(true);
        setLastError(null);

        // 이전 WebSocket 세션의 구독 객체는 사용할 수 없다.
        activeSubscriptionsRef.current.clear();

        /*
         * 재연결이 끝나면 화면들이 등록해 둔 topic을
         * 모두 다시 구독한다.
         */
        subscriptionRegistryRef.current.forEach(
          (registration, subscriptionId) => {
            attachSubscription(
              subscriptionId,
              registration
            );
          }
        );
      },

      onDisconnect: () => {
        setConnected(false);
        activeSubscriptionsRef.current.clear();
      },

      onWebSocketClose: () => {
        setConnected(false);
        activeSubscriptionsRef.current.clear();
      },

      onStompError: (frame) => {
        setConnected(false);
        notifyConnectionError(frame);
      },

      onWebSocketError: (event) => {
        setConnected(false);
        notifyConnectionError(event);
      },
    });

    clientRef.current = client;
    return client;
  }, [attachSubscription, notifyConnectionError]);

  /*
   * 로그인 완료 후 공용 WebSocket 연결을 시작한다.
   */
  const start = useCallback(() => {
    const client = getOrCreateClient();

    if (!client.active) {
      client.activate();
    }
  }, [getOrCreateClient]);

  /*
   * 로그아웃할 때 공용 WebSocket 연결과 구독을 정리한다.
   */
  const stop = useCallback(
    ({ clearSubscriptions = false } = {}) => {
      activeSubscriptionsRef.current.forEach(
        (subscription) => {
          subscription.unsubscribe();
        }
      );

      activeSubscriptionsRef.current.clear();

      if (clearSubscriptions) {
        subscriptionRegistryRef.current.clear();
      }

      setConnected(false);

      const client = clientRef.current;

      if (client?.active) {
        void client.deactivate();
      }
    },
    []
  );

  /*
   * 화면에서 필요한 topic을 등록하는 함수다.
   *
   * 아직 WebSocket이 연결되지 않은 상태에서도 등록할 수 있다.
   * 연결이 완료되면 Provider가 실제 구독을 붙인다.
   */
  const subscribe = useCallback(
    ({ destination, onMessage, onError }) => {
      if (!destination) {
        throw new Error(
          "WebSocket 구독 주소가 필요해요."
        );
      }

      const subscriptionId =
        nextSubscriptionIdRef.current;

      nextSubscriptionIdRef.current += 1;

      const registration = {
        destination,
        onMessage,
        onError,
      };

      subscriptionRegistryRef.current.set(
        subscriptionId,
        registration
      );

      attachSubscription(
        subscriptionId,
        registration
      );

      /*
       * 화면이 사라질 때 실행되는 함수다.
       *
       * 전체 Client를 끊지 않고
       * 이 화면에서 사용한 topic만 해제한다.
       */
      return () => {
        subscriptionRegistryRef.current.delete(
          subscriptionId
        );

        const activeSubscription =
          activeSubscriptionsRef.current.get(
            subscriptionId
          );

        activeSubscription?.unsubscribe();

        activeSubscriptionsRef.current.delete(
          subscriptionId
        );
      };
    },
    [attachSubscription]
  );

  /*
   * 공용 STOMP Client를 사용해 서버로 메시지를 보낸다.
   */
  const publish = useCallback(
    ({ destination, body }) => {
      const client = clientRef.current;

      if (!client?.connected) {
        throw new Error(
          "WebSocket이 아직 연결되지 않았어요."
        );
      }

      client.publish({
        destination,
        body:
          typeof body === "string"
            ? body
            : JSON.stringify(body ?? {}),
      });
    },
    []
  );

  /*
   * Provider 자체가 사라질 때 마지막 연결을 정리한다.
   */
  useEffect(() => {
    return () => {
      subscriptionRegistryRef.current.clear();
      activeSubscriptionsRef.current.clear();

      if (clientRef.current?.active) {
        void clientRef.current.deactivate();
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      connected,
      lastError,
      start,
      stop,
      subscribe,
      publish,
    }),
    [
      connected,
      lastError,
      start,
      stop,
      subscribe,
      publish,
    ]
  );

  return (
    <StompClientContext.Provider value={value}>
      {children}
    </StompClientContext.Provider>
  );
}

/*
 * 공용 STOMP 기능을 꺼내 쓰는 Hook이다.
 */
export function useStompClient() {
  const context = useContext(StompClientContext);

  if (!context) {
    throw new Error(
      "useStompClient는 StompClientProvider 안에서 사용해야 해요."
    );
  }

  return context;
}