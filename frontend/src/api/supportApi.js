import apiClient, { ensureCsrf } from "./apiClient";

/** 문의 요청은 기존 인증/CSRF 계층을 재사용하며 원본 파일이나 내부 오류 원문을 브라우저가 다시 전송하지 않는다. */
const USER_BASE = "/api/v1/support/inquiries";
const ADMIN_BASE = "/api/v1/admin/support/inquiries";
const PUBLIC_BASE = "/api/v1/public/support";
const baseFor = ({operator=false,guest=false}={}) => guest ? `${PUBLIC_BASE}/inquiries` : operator ? ADMIN_BASE : USER_BASE;
const guestOptions = guest => guest ? {_skipAuthRefresh:true} : {};
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
export async function getSupportInquiries({ before, status, operator = false, guest=false, signal } = {}) {
  return unwrap(await apiClient.get(baseFor({operator,guest}), { params: { before, status }, signal, ...guestOptions(guest) }));
}
export async function getSupportInquiry(id, operator = false, options = {}) {
  const {guest=false,...config}=options;
  return unwrap(await apiClient.get(`${baseFor({operator,guest})}/${id}`, {...config,...guestOptions(guest)}));
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
  // 프록시가 거절한 요청은 JSON이 아니라 HTML일 수 있다. 연결 오류로 오해하지 않게 구분한다.
  if (error?.response?.status === 413) return "서버의 업로드 크기 제한으로 첨부를 보내지 못했어요. 문의 본문이 접수됐다면 첨부만 다시 시도해 주세요.";
  return error?.response?.data?.error?.message || "문의 정보를 처리하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.";
}

export async function getSupportFaq(options={}) { return unwrap(await apiClient.get(`${PUBLIC_BASE}/faq`,{...options,_skipAuthRefresh:true})); }
export async function getGuestSupportSession(options={}) { return unwrap(await apiClient.get(`${PUBLIC_BASE}/session`,{...options,_skipAuthRefresh:true})); }
let guestInitialization=null;
/** 같은 브라우저의 탭에서도 첫 쿠키 발급을 순서대로 처리해 문의 조회 세션이 엇갈리지 않게 한다. */
export function ensureGuestSupportSession() {
  if (guestInitialization) return guestInitialization;
  const initialize=async()=>{
    const state=await getGuestSupportSession();if(state.active) return state;
    await ensureCsrf();return unwrap(await apiClient.post(`${PUBLIC_BASE}/session`,null,{_skipAuthRefresh:true}));
  };
  const pending=(typeof navigator!=="undefined" && navigator.locks?.request
    ? navigator.locks.request("memoryjar-support-session",initialize) : initialize());
  guestInitialization=Promise.resolve(pending).finally(()=>{guestInitialization=null;});
  return guestInitialization;
}
export async function createGeneralSupportInquiry(request,{guest=false}={}) {
  if(guest) await ensureGuestSupportSession();
  await ensureCsrf();
  return unwrap(await apiClient.post(guest?`${PUBLIC_BASE}/inquiries`:`${USER_BASE}/general`,request,guestOptions(guest)));
}
export async function getSupportMessages(id,{operator=false,guest=false,before,signal}={}) {
  return unwrap(await apiClient.get(`${baseFor({operator,guest})}/${id}/messages`,{params:{before},signal,...guestOptions(guest)}));
}
export async function getSupportView(id,{operator=false,guest=false,signal}={}) {
  return unwrap(await apiClient.get(`${baseFor({operator,guest})}/${id}/view`,{signal,...guestOptions(guest)}));
}
export async function sendSupportMessage(id,request,{operator=false,guest=false}={}) {
  await ensureCsrf();return unwrap(await apiClient.post(`${baseFor({operator,guest})}/${id}/messages`,request,guestOptions(guest)));
}
export async function resolveSupportInquiry(id,resolved,{operator=false,guest=false}={}) {
  await ensureCsrf();return unwrap(await apiClient.post(`${baseFor({operator,guest})}/${id}/${resolved?"resolve":"reopen"}`,null,guestOptions(guest)));
}
export async function getSupportAttachments(id,{operator=false,guest=false,signal}={}) {
  return unwrap(await apiClient.get(`${baseFor({operator,guest})}/${id}/attachments`,{signal,...guestOptions(guest)}));
}
export async function uploadSupportScreenshot(id,file,requestId,{operator=false,guest=false}={}) {
  await ensureCsrf();const data=new FormData();data.append("image",file,file.name||"screenshot.png");
  data.append("requestId",requestId);data.append("shareScreenshot","true");
  return unwrap(await apiClient.post(`${baseFor({operator,guest})}/${id}/attachments`,data,{timeout:150000,...guestOptions(guest)}));
}
export async function getSupportAttachmentImage(id,attachmentId,{operator=false,guest=false}={}) {
  return unwrap(await apiClient.get(`${baseFor({operator,guest})}/${id}/attachments/${attachmentId}/image`,guestOptions(guest)));
}
