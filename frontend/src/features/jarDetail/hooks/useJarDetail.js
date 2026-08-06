import { useCallback, useEffect, useState } from "react";
import apiClient from "../../../api/apiClient";
import {
  isSessionExpiredError,
} from "../../../api/authSessionUtils";

/*
 * useJarDetail 역할
 *
 * 저금통 상세 페이지에서 가장 기본이 되는 데이터를 관리하는 Hook이야.
 *
 * 쉽게 말하면:
 * - 저금통 상세 정보 가져오기
 * - 현재 로그인한 내 정보 가져오기
 * - 로딩/에러 상태 관리하기
 * 를 JarDetailPage 대신 맡아주는 "상세 정보 담당자"다.
 */
export function useJarDetail(jarId) {
  // 서버에서 받아온 저금통 상세 정보
  const [jar, setJar] = useState(null);

  // 현재 로그인한 사용자 정보
  const [me, setMe] = useState(null);

  // 상세 화면 전체 로딩 상태
  const [loading, setLoading] = useState(true);

  // 상세 정보를 불러오다 실패했을 때 보여줄 메시지
  const [error, setError] = useState("");

  /*
   * Refresh Token까지 만료되어
   * 다시 로그인해야 하는 상태인지 저장한다.
   */
  const [
    sessionExpired,
    setSessionExpired,
  ] = useState(false);

  /*
   * 저금통 상세 정보를 불러오는 함수야.
   *
   * silent가 true면 화면 전체 로딩을 켜지 않는다.
   * WebSocket 이벤트처럼 조용히 최신 상태만 맞출 때 사용한다.
   */
  const loadJarDetail = useCallback(
    async ({ silent = false } = {}) => {
      if (!jarId) return;

      if (!silent) {
        setLoading(true);
        setSessionExpired(false);
      }

      setError("");

      setError("");

      try {
        const res = await apiClient.get(`/api/v1/jars/${jarId}`);
        const data = res.data?.data;

        setJar(data || null);
      } catch (e) {
        /*
         * Refresh Token까지 만료된 오류라면
         * 일반 상세 오류와 구분한다.
         */
        if (
          isSessionExpiredError(e)
        ) {
          setSessionExpired(true);
          setError("");
          setJar(null);

          return;
        }

        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "저금통 정보를 불러오지 못했어요.";

        setError(serverMessage);
        setJar(null);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [jarId]
  );

  /*
   * 현재 로그인한 사용자 정보를 불러오는 함수야.
   *
   * 이 값은 WebSocket 이벤트에서 "내가 강퇴 대상인지" 판단할 때 사용한다.
   */
  const loadMe = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/me");
      setMe(res.data?.data || null);
    } catch (e) {
      /*
       * 단순한 내 정보 조회 실패는 null로 두지만,
       * Refresh Token까지 만료된 경우에는
       * 상세 화면 전체를 재로그인 상태로 전환한다.
       */
      if (
        isSessionExpiredError(e)
      ) {
        setSessionExpired(true);
      }

      setMe(null);
    }
  }, []);

  /*
   * jarId가 바뀌면 상세 정보와 내 정보를 새로 불러온다.
   *
   * 예:
   * - /jars/10 에서 /jars/20 으로 이동하면
   * - 20번 저금통 기준으로 다시 조회한다.
   */
  useEffect(() => {
    loadJarDetail();
    loadMe();
  }, [loadJarDetail, loadMe]);

  return {
    jar,
    setJar,
    me,
    loading,
    error,
    sessionExpired,
    loadJarDetail,
    loadMe,
  };
}