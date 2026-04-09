// src/api/fileApi.js
import apiClient, { fetchCsrf } from "./apiClient";

/*
  이 파일은 "파일 업로드 관련 API"만 모아두는 곳이야.
  쪽지 API와 파일 API를 나눠두면 나중에 채팅 첨부를 붙일 때도 재사용하기 쉬워져.
*/

// 서버 응답이 { data: .수.. } 구조라서 진짜 값만 꺼내는 작은 함
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
  jarId,
  fileName,
  contentType,
  size,
}) {
  await fetchCsrf();

  const response = await apiClient.post("/api/v1/files/presign", {
    purpose: "NOTE",
    jarId,
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
  await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || file.type || "application/octet-stream",
    },
    body: file,
  });
}

/*
  프론트에서 note 생성 payload에 넣기 좋게
  첨부 객체를 정리하는 함수
*/
export function toNoteAttachmentPayload(presignData, file) {
  return {
    s3Key: presignData.s3Key,
    url: presignData.url ?? presignData.publicUrl,
    thumbnailUrl: presignData.thumbnailUrl ?? null,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  };
}

const fileApi = {
  presignNoteFile,
  uploadFileToS3,
  toNoteAttachmentPayload,
};

export default fileApi;