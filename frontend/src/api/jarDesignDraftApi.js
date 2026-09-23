import apiClient, { fetchCsrf } from "./apiClient";

/**
 * Jar 생성 전 디자인 Draft API만 담당한다.
 * 화면 컴포넌트가 URL·FormData·응답 봉투 구조를 직접 알지 않도록 한 곳에 모은다.
 */
const DRAFT_BASE_URL = "/api/v1/design-drafts";

function unwrap(response) {
  return response.data?.data;
}

/** Canvas PNG 또는 사용자가 선택한 PNG/JPEG/WebP 원본으로 새 Draft를 만든다. */
export async function createJarDesignDraft(imageFile) {
  if (!(imageFile instanceof Blob)) {
    throw new Error("디자인 원본 이미지를 먼저 준비해 주세요.");
  }

  const formData = new FormData();
  formData.append(
    "image",
    imageFile,
    imageFile.name || "jar-design-original.png"
  );

  await fetchCsrf();
  const response = await apiClient.post(DRAFT_BASE_URL, formData);
  return unwrap(response);
}

/** 비공개 S3 Key 없이 Draft의 선택·후보 상태만 조회한다. */
export async function getJarDesignDraft(draftId) {
  const response = await apiClient.get(`${DRAFT_BASE_URL}/${draftId}`);
  return unwrap(response);
}

/** 서버 Catalog에 등록된 스타일로 AI 후보 생성을 요청한다. */
export async function createJarDesignGeneration(draftId, style, seed) {
  await fetchCsrf();
  const response = await apiClient.post(`${DRAFT_BASE_URL}/${draftId}/generations`, {
    style,
    ...(seed === undefined || seed === null ? {} : { seed }),
  });
  return unwrap(response);
}

/** 성공 후보를 표시할 때만 서버가 OWNER 전용 Presigned GET URL을 발급한다. */
export async function getJarDesignGenerationPreview(draftId, generationId) {
  const response = await apiClient.get(
    `${DRAFT_BASE_URL}/${draftId}/generations/${generationId}/preview`
  );
  return unwrap(response);
}

/** 정규화한 ORIGINAL을 표시할 때만 서버가 OWNER 전용 Presigned GET URL을 발급한다. */
export async function getJarDesignOriginalPreview(draftId) {
  const response = await apiClient.get(`${DRAFT_BASE_URL}/${draftId}/original/preview`);
  return unwrap(response);
}

/** ORIGINAL·AI·DEFAULT 중 Draft의 최종 디자인 선택을 저장한다. */
export async function selectJarDesign(draftId, designType, generationId) {
  await fetchCsrf();
  await apiClient.patch(`${DRAFT_BASE_URL}/${draftId}/selection`, {
    designType,
    ...(generationId === undefined || generationId === null
      ? {}
      : { generationId }),
  });
}

/** 커스텀 이미지 위 동전 투입구 Slot의 정규화된 위치와 크기를 저장한다. */
export async function updateJarDesignSlot(draftId, { centerX, centerY, sizeRatio, expectedDesignType, expectedGenerationId }) {
  await fetchCsrf();
  await apiClient.patch(`${DRAFT_BASE_URL}/${draftId}/slot`, {
    centerX,
    centerY,
    sizeRatio,
    expectedDesignType,
    expectedGenerationId,
  });
}

/** Draft의 선택을 실제 Jar로 확정하고 생성된 Jar 식별자를 반환한다. */
export async function finalizeJarDesignDraft(draftId, jarPayload) {
  await fetchCsrf();
  const response = await apiClient.post(`${DRAFT_BASE_URL}/${draftId}/finalize`, jarPayload);
  return unwrap(response);
}

/** 서버의 기능별 error.code를 우선 사용해 화면이 안정적으로 분기할 수 있게 한다. */
export function getJarDesignDraftError(error) {
  const apiError = error?.response?.data?.error;
  return {
    code: apiError?.code || "DRAFT_REQUEST_FAILED",
    message: apiError?.message || error?.message || "디자인 요청을 처리하지 못했어요.",
  };
}
