// src/api/noteApi.js

import apiClient, { fetchCsrf } from "./apiClient";

/*
  이 파일은 "쪽지(note) 관련 API 요청"만 모아두는 곳이야.

  쉽게 생각하면:
  - 화면 컴포넌트는 "버튼 누르기, 글 보여주기"
  - 이 파일은 "서버한테 부탁하기"
  역할을 나눠서 정리하는 거야.
*/

/**
 * 서버 응답이 { data: ... } 형태라서
 * 진짜 우리가 쓰는 값만 꺼내주는 작은 도우미 함수
 */
function extractData(response) {
  return response?.data?.data;
}

/**
 * 값이 비어있는 쿼리 파라미터는 제거해주는 함수
 *
 * 예를 들어
 * { q: "", page: 0, tag: null }
 * 이 들어오면
 * { page: 0 } 만 남겨줘.
 *
 * 이유:
 * 불필요한 빈값을 서버에 보내지 않으려고!
 */
function cleanParams(params = {}) {
  const result = {};

  Object.entries(params).forEach(([key, value]) => {
    const isEmptyString = typeof value === "string" && value.trim() === "";
    const isNullOrUndefined = value === null || value === undefined;

    if (!isEmptyString && !isNullOrUndefined) {
      result[key] = value;
    }
  });

  return result;
}

/**
 * 쪽지 목록 조회
 *
 * 사용 예시:
 * getNotes(jarId)
 * getNotes(jarId, { page: 0, size: 10 })
 * getNotes(jarId, { tag: "여행", from: "2026-03-01", to: "2026-03-31" })
 */
export async function getNotes(jarId, params = {}) {
  const response = await apiClient.get(`/api/v1/jars/${jarId}/notes`, {
    params: cleanParams(params),
  });

  return extractData(response);
}

/**
 * 쪽지 상세 조회
 *
 * 특정 note 하나를 눌렀을 때
 * 그 note의 자세한 내용을 가져오는 함수
 */
export async function getNoteDetail(jarId, noteId) {
  const response = await apiClient.get(
    `/api/v1/jars/${jarId}/notes/${noteId}`
  );

  return extractData(response);
}

/**
 * 쪽지 작성
 *
 * POST 요청은 CSRF 토큰이 필요하니까
 * 먼저 fetchCsrf()를 한 번 호출해줘.
 *
 * payload 예시:
 * {
 *   title: "우리 첫 여행",
 *   content: "정말 즐거웠어!",
 *   noteDate: "2026-03-20",
 *   location: "부산",
 *   tags: ["여행", "추억"]
 * }
 */
export async function createNote(jarId, payload) {
  await fetchCsrf();

  const response = await apiClient.post(
    `/api/v1/jars/${jarId}/notes`,
    payload
  );

  return extractData(response);
}

/**
 * 한 곳에서 가져다 쓰기 쉽게 묶어서도 export
 *
 * 사용 예시:
 * import noteApi from "../api/noteApi";
 * noteApi.getNotes(...)
 */
const noteApi = {
  getNotes,
  getNoteDetail,
  createNote,
};

export default noteApi;