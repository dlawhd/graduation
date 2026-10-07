import apiClient, { ensureCsrf } from "./apiClient";

/** 문의 요청은 기존 인증/CSRF 계층을 재사용하며 원본 파일이나 내부 오류 원문을 브라우저가 다시 전송하지 않는다. */
const USER_BASE = "/api/v1/support/inquiries";
const ADMIN_BASE = "/api/v1/admin/support/inquiries";
const unwrap = (response) => response.data?.data;

export async function getSupportPermissions(options = {}) {
  return unwrap(await apiClient.get("/api/v1/support/permissions", options));
}
export async function getDraftInquiries(draftId, options = {}) {
  return unwrap(await apiClient.get(`${USER_BASE}/for-draft/${draftId}`, options));
}
export async function createSupportInquiry(request) {
  await ensureCsrf();
  return unwrap(await apiClient.post(USER_BASE, request, { timeout: 150_000 }));
}
export async function getSupportInquiries({ before, status, operator = false, signal } = {}) {
  return unwrap(await apiClient.get(operator ? ADMIN_BASE : USER_BASE, { params: { before, status }, signal }));
}
export async function getSupportInquiry(id, operator = false, options = {}) {
  return unwrap(await apiClient.get(`${operator ? ADMIN_BASE : USER_BASE}/${id}`, options));
}
export async function getSupportImage(id, operator = false) {
  return unwrap(await apiClient.get(`${operator ? ADMIN_BASE : USER_BASE}/${id}/image`));
}
export async function startSupportReview(id) {
  await ensureCsrf();
  return unwrap(await apiClient.post(`${ADMIN_BASE}/${id}/review`));
}
export async function replySupportInquiry(id, reply) {
  await ensureCsrf();
  return unwrap(await apiClient.post(`${ADMIN_BASE}/${id}/reply`, { reply }));
}
export function supportError(error) {
  return error?.response?.data?.error?.message || "문의 정보를 처리하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.";
}
