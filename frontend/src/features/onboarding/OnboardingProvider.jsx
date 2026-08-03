// src/features/onboarding/OnboardingProvider.jsx

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  finishOnboarding,
  getMyOnboardingProgress,
  ONBOARDING_STATUS,
  ONBOARDING_TUTORIAL_KEY,
} from "../../api/onboardingApi";

/*
 * OnboardingProvider 역할
 *
 * 로그인 사용자의 온보딩 진행 상태를 백엔드에서 한 번 조회하고,
 * 앱 안의 여러 화면에서 같은 상태를 함께 사용할 수 있게 해준다.
 *
 * 쉽게 말하면:
 *
 * - WELCOME을 이미 봤는지
 * - JAR_LIST 안내를 이미 봤는지
 * - 현재 어떤 튜토리얼을 실행 중인지
 * - 완료 또는 건너뛰기를 저장하고 있는지
 *
 * 를 한곳에서 관리하는 온보딩 중앙 관리소다.
 */
export const OnboardingContext = createContext(null);

/*
 * 아직 서버 응답을 받기 전 사용할 기본 온보딩 상태를 만든다.
 *
 * 각 Provider가 독립된 객체를 사용하도록
 * 함수가 호출될 때마다 새로운 객체를 반환한다.
 */
function createEmptyProgressMap() {
  return Object.values(
    ONBOARDING_TUTORIAL_KEY
  ).reduce((progressMap, tutorialKey) => {
    progressMap[tutorialKey] = {
      tutorialKey,
      handled: false,
      status: null,
      finishedAt: null,
    };

    return progressMap;
  }, {});
}

/*
 * 백엔드가 반환한 온보딩 배열을
 * tutorialKey로 바로 찾을 수 있는 객체 형태로 바꾼다.
 *
 * 변환 전:
 * [
 *   { tutorialKey: "WELCOME", ... },
 *   { tutorialKey: "JAR_LIST", ... }
 * ]
 *
 * 변환 후:
 * {
 *   WELCOME: { tutorialKey: "WELCOME", ... },
 *   JAR_LIST: { tutorialKey: "JAR_LIST", ... }
 * }
 */
function createProgressMap(items = []) {
  const progressMap = createEmptyProgressMap();

  items.forEach((item) => {
    if (!item?.tutorialKey) {
      return;
    }

    progressMap[item.tutorialKey] = item;
  });

  return progressMap;
}

/*
 * API 오류에서 사용자에게 보여줄 수 있는 문구를 꺼낸다.
 */
function getOnboardingErrorMessage(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "이용 방법 정보를 불러오지 못했어요."
  );
}

export function OnboardingProvider({
  userId,
  checkingAuth,
  children,
}) {
  // 현재 백엔드가 사용하는 온보딩 버전
  const [version, setVersion] = useState(null);

  // tutorialKey별 진행 상태
  const [progressByKey, setProgressByKey] =
    useState(createEmptyProgressMap);

  // 최초 온보딩 상태를 조회하고 있는지
  const [loading, setLoading] = useState(false);

  // 온보딩 API에서 발생한 최근 오류 문구
  const [error, setError] = useState("");

  // 현재 화면에 띄울 온보딩 종류
  const [
    activeTutorialKey,
    setActiveTutorialKey,
  ] = useState(null);

  // 현재 완료 또는 건너뛰기를 저장 중인 온보딩
  const [
    savingTutorialKey,
    setSavingTutorialKey,
  ] = useState(null);

  /*
   * 로그아웃하거나 로그인 사용자가 없어졌을 때
   * 이전 사용자의 온보딩 상태가 남지 않도록 초기화한다.
   */
  const resetOnboardingState = useCallback(() => {
    setVersion(null);
    setProgressByKey(createEmptyProgressMap());
    setLoading(false);
    setError("");
    setActiveTutorialKey(null);
    setSavingTutorialKey(null);
  }, []);

  /*
   * 백엔드 조회 결과를 Provider 상태에 반영한다.
   */
  const applyProgressResponse = useCallback(
    (data) => {
      setVersion(data?.version ?? null);
      setProgressByKey(
        createProgressMap(data?.items)
      );
    },
    []
  );

  /*
   * 로그인 사용자 또는 로그인 확인 상태가 바뀌면
   * 현재 사용자의 온보딩 정보를 조회한다.
   */
  useEffect(() => {
    /*
     * /api/v1/me 확인이 끝나기 전에는
     * 로그인 사용자를 확정할 수 없으므로 기다린다.
     */
    if (checkingAuth) {
      return undefined;
    }

    /*
     * 로그아웃 상태라면 이전 사용자의 상태를 지운다.
     */
    if (!userId) {
      resetOnboardingState();
      return undefined;
    }

    const abortController =
      new AbortController();

    async function loadProgress() {
      try {
        setLoading(true);
        setError("");

        const data =
          await getMyOnboardingProgress({
            signal: abortController.signal,
          });

        /*
         * 요청이 취소된 뒤에는
         * 이전 사용자 응답을 상태에 반영하지 않는다.
         */
        if (abortController.signal.aborted) {
          return;
        }

        applyProgressResponse(data);
      } catch (requestError) {
        /*
         * 화면 이동이나 StrictMode 검사로 취소된 요청은
         * 실제 오류가 아니므로 오류 문구를 저장하지 않는다.
         */
        if (
          abortController.signal.aborted ||
          requestError?.code === "ERR_CANCELED"
        ) {
          return;
        }

        setError(
          getOnboardingErrorMessage(
            requestError
          )
        );
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadProgress();

    /*
     * 사용자가 바뀌거나 Provider가 사라지면
     * 이전 사용자에 대한 진행 중 요청을 취소한다.
     */
    return () => {
      abortController.abort();
    };
  }, [
    userId,
    checkingAuth,
    applyProgressResponse,
    resetOnboardingState,
  ]);

  /*
   * 온보딩 상태를 서버에서 다시 조회한다.
   *
   * 화면 복귀, 네트워크 재연결처럼
   * 서버 상태를 다시 맞춰야 할 때 사용할 수 있다.
   */
  const refreshProgress = useCallback(
    async () => {
      if (!userId) {
        resetOnboardingState();
        return null;
      }

      try {
        setLoading(true);
        setError("");

        const data =
          await getMyOnboardingProgress();

        applyProgressResponse(data);
        return data;
      } catch (requestError) {
        setError(
          getOnboardingErrorMessage(
            requestError
          )
        );

        throw requestError;
      } finally {
        setLoading(false);
      }
    },
    [
      userId,
      applyProgressResponse,
      resetOnboardingState,
    ]
  );

  /*
   * 특정 온보딩의 현재 상태를 반환한다.
   */
  const getTutorialProgress = useCallback(
    (tutorialKey) => {
      return progressByKey[tutorialKey] ?? null;
    },
    [progressByKey]
  );

  /*
   * 특정 온보딩을 이미 완료하거나 건너뛰었는지 확인한다.
   */
  const isTutorialHandled = useCallback(
    (tutorialKey) => {
      return Boolean(
        progressByKey[tutorialKey]?.handled
      );
    },
    [progressByKey]
  );

  /*
   * 특정 온보딩을 자동으로 보여줘야 하는지 확인한다.
   *
   * 서버 조회가 정상적으로 끝난 뒤,
   * 해당 온보딩을 아직 처리하지 않은 경우에만 true가 된다.
   */
  const shouldShowTutorial = useCallback(
    (tutorialKey) => {
      const isReady =
        !checkingAuth &&
        Boolean(userId) &&
        !loading &&
        version !== null &&
        !error;

      if (!isReady) {
        return false;
      }

      return (
        progressByKey[tutorialKey]
          ?.handled === false
      );
    },
    [
      checkingAuth,
      userId,
      loading,
      version,
      error,
      progressByKey,
    ]
  );

  /*
   * 특정 온보딩을 화면에 열어준다.
   *
   * force=false:
   * 이미 완료하거나 건너뛴 안내는 다시 열지 않는다.
   *
   * force=true:
   * 내정보의 "이용 방법 다시 보기"처럼
   * 완료 여부와 관계없이 강제로 다시 연다.
   */
  const openTutorial = useCallback(
    (
      tutorialKey,
      { force = false } = {}
    ) => {
      const validTutorialKeys =
        Object.values(
          ONBOARDING_TUTORIAL_KEY
        );

      if (
        !validTutorialKeys.includes(
          tutorialKey
        )
      ) {
        throw new Error(
          `지원하지 않는 온보딩 종류예요: ${tutorialKey}`
        );
      }

      if (
        !force &&
        isTutorialHandled(tutorialKey)
      ) {
        return false;
      }

      setActiveTutorialKey(tutorialKey);
      return true;
    },
    [isTutorialHandled]
  );

  /*
   * 현재 열려 있는 온보딩 화면만 닫는다.
   *
   * 이 함수 자체는 DB 상태를 저장하지 않는다.
   * 완료와 건너뛰기는 finishTutorial을 사용한다.
   */
  const closeTutorial = useCallback(() => {
    setActiveTutorialKey(null);
  }, []);

  /*
   * 특정 온보딩을 완료 또는 건너뛰기로 저장한다.
   */
  const finishTutorial = useCallback(
    async (tutorialKey, status) => {
      try {
        setSavingTutorialKey(tutorialKey);
        setError("");

        const savedProgress =
          await finishOnboarding(
            tutorialKey,
            status
          );

        /*
         * 저장 성공 후 전체 목록을 다시 조회하지 않고
         * 응답으로 받은 항목 하나만 현재 상태에 반영한다.
         */
        setProgressByKey(
          (previousProgress) => ({
            ...previousProgress,
            [tutorialKey]: savedProgress,
          })
        );

        /*
         * 저장한 온보딩이 현재 열려 있었다면
         * 완료 후 화면을 닫는다.
         */
        setActiveTutorialKey(
          (currentTutorialKey) =>
            currentTutorialKey === tutorialKey
              ? null
              : currentTutorialKey
        );

        return savedProgress;
      } catch (requestError) {
        setError(
          getOnboardingErrorMessage(
            requestError
          )
        );

        throw requestError;
      } finally {
        setSavingTutorialKey(null);
      }
    },
    []
  );

  /*
   * 현재 열려 있는 온보딩을 완료 처리한다.
   */
  const completeActiveTutorial =
    useCallback(async () => {
      if (!activeTutorialKey) {
        return null;
      }

      return finishTutorial(
        activeTutorialKey,
        ONBOARDING_STATUS.COMPLETED
      );
    }, [
      activeTutorialKey,
      finishTutorial,
    ]);

  /*
   * 현재 열려 있는 온보딩을 건너뛰기 처리한다.
   */
  const skipActiveTutorial =
    useCallback(async () => {
      if (!activeTutorialKey) {
        return null;
      }

      return finishTutorial(
        activeTutorialKey,
        ONBOARDING_STATUS.SKIPPED
      );
    }, [
      activeTutorialKey,
      finishTutorial,
    ]);

  /*
   * 배열이 필요한 화면을 위해
   * 항상 WELCOME → JAR_LIST → JAR_DETAIL → DAILY_DRAW
   * 순서로 정리한다.
   */
  const progressItems = useMemo(
    () =>
      Object.values(
        ONBOARDING_TUTORIAL_KEY
      ).map(
        (tutorialKey) =>
          progressByKey[tutorialKey]
      ),
    [progressByKey]
  );

  const isReady =
    !checkingAuth &&
    Boolean(userId) &&
    !loading &&
    version !== null &&
    !error;

  /*
   * Provider 아래에 있는 모든 화면이 사용할 공통 값
   */
  const contextValue = useMemo(
    () => ({
      version,
      progressItems,
      progressByKey,
      loading,
      error,
      isReady,
      activeTutorialKey,
      savingTutorialKey,

      refreshProgress,
      getTutorialProgress,
      isTutorialHandled,
      shouldShowTutorial,
      openTutorial,
      closeTutorial,
      finishTutorial,
      completeActiveTutorial,
      skipActiveTutorial,
    }),
    [
      version,
      progressItems,
      progressByKey,
      loading,
      error,
      isReady,
      activeTutorialKey,
      savingTutorialKey,
      refreshProgress,
      getTutorialProgress,
      isTutorialHandled,
      shouldShowTutorial,
      openTutorial,
      closeTutorial,
      finishTutorial,
      completeActiveTutorial,
      skipActiveTutorial,
    ]
  );

  return (
    <OnboardingContext.Provider
      value={contextValue}
    >
      {children}
    </OnboardingContext.Provider>
  );
}