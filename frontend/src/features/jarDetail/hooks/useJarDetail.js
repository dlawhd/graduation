import { useRequestGate } from "../../../api/useRequestGate";
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
 * - 로딩/에러 상태 관리하기
 * 를 JarDetailPage 대신 맡아주는 "상세 정보 담당자"다.
 */
export function useJarDetail(jarId) {
  const requests = useRequestGate(jarId);
  // 서버에서 받아온 저금통 상세 정보
  const [jar, setJar] = useState(null);

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
    async ({
      silent = false,
      keepCurrentOnError = false,
      suppressError = false,
    } = {}) => {
      if (!jarId) return;
      const isCurrent = requests.begin("detail");

      if (!silent) {
        setLoading(true);
        setSessionExpired(false);
      }

      setError("");

      try {
        const res = await apiClient.get(`/api/v1/jars/${jarId}`);
        const data = res.data?.data;
        if (!isCurrent()) return false;

        setJar(data || null);
        return true;
      } catch (e) {
        if (!isCurrent()) return false;
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

          return false;
        }

        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "저금통 정보를 불러오지 못했어요.";

        /*
         * Presigned URL을 다시 받는 요청은 기존 상세 화면을 유지해야 한다.
         * 이미지 재시도 자체가 실패했다고 전체 Jar 정보를 지우면 사용자가
         * 원래 보던 화면까지 잃어버리기 때문이다.
         */
        if (!suppressError) {
          setError(serverMessage);
        }

        if (!keepCurrentOnError) {
          setJar(null);
        }

        return false;
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [jarId, requests]
  );

  /*
   * jarId가 바뀌면 상세 정보를 새로 불러온다. 계정 정보는 App에서 확인한다.
   *
   * 예:
   * - /jars/10 에서 /jars/20 으로 이동하면
   * - 20번 저금통 기준으로 다시 조회한다.
   */
  useEffect(() => {
    setJar(null);
    loadJarDetail();
  }, [loadJarDetail]);

  return {
    jar,
    setJar,
    loading,
    error,
    sessionExpired,
    loadJarDetail,
  };
}
