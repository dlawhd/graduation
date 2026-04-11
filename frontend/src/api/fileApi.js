// src/api/fileApi.js
import apiClient, { fetchCsrf } from "./apiClient";

/*
  이 파일은 "파일 업로드 관련 API"만 모아두는 곳이야.
  쪽지 API와 파일 API를 나눠두면 나중에 채팅 첨부를 붙일 때도 재사용하기 쉬워져.
*/

// 서버 응답이 { data: ... } 구조라서 진짜 값만 꺼내는 작은 함수
function extractData(response) {
  return response?.data?.data;
}

/*
  presign 요청
  서버에게:
  "이 파일을 S3에 올릴 수 있는 임시 업로드 주소(uploadUrl) 좀 주세요!"
  라고 부탁하는 단계야.
*/
export async function presignNoteFile({
  fileName,
  contentType,
  size,
}) {
  await fetchCsrf();

  const response = await apiClient.post("/api/v1/files/presign", {
    purpose: "NOTE",
    fileName,
    contentType,
    size,
  });

  return extractData(response);
}

/*
  실제 S3 업로드
  여기서는 우리 백엔드가 아니라,
  presign에서 받은 uploadUrl로 파일을 직접 PUT 업로드해.
*/
export async function uploadFileToS3(uploadUrl, file, contentType) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || file.type || "application/octet-stream",
    },
    body: file,
  });

  // 업로드가 실패했는데도 그냥 지나가면
  // 나중에 complete나 note 저장에서 더 헷갈리는 에러가 나니까
  // 여기서 바로 잡아주는 게 좋아.
  if (!response.ok) {
    throw new Error("S3 파일 업로드에 실패했어요.");
  }

  return true;
}

/*
  complete 요청
  서버에게:
  "방금 S3 업로드 끝났어요. 이 파일을 완료 처리해 주세요!"
  라고 알려주는 단계야.
*/
export async function completeNoteFile({ s3Key }) {
  await fetchCsrf();

  const response = await apiClient.post("/api/v1/files/complete", {
    purpose: "NOTE",
    s3Key,
  });

  return extractData(response);
}

/*
  프론트 화면에서 미리보기 카드에 보여주기 좋게
  첨부 객체를 정리하는 함수
  주의:
  이 값은 "화면 표시용"으로 쓰는 거고,
  note 생성 요청에는 나중에 s3Key만 보내야 해.
*/
export function toNoteAttachmentPayload(presignData, file) {
  return {
    s3Key: presignData.s3Key,
    url: presignData.publicUrl ?? presignData.url,
    thumbnailUrl: presignData.thumbnailUrl ?? null,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  };
}

const fileApi = {
  presignNoteFile,
  uploadFileToS3,
  completeNoteFile,
  toNoteAttachmentPayload,
};

export default fileApi;