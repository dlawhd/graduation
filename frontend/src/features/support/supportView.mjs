/** 서버의 문의 상태와 스타일 식별자를 사용자에게 익숙한 표현으로 바꾼다. */
export const SUPPORT_STATUS = {
  COPYING: "사진 보관 중", COPY_FAILED: "접수 미완료", OPEN: "접수", IN_PROGRESS: "확인 중", ANSWERED: "답변 완료",
};
export const SUPPORT_STYLE = {
  CUTE_2D: "귀여운 2D", SOFT_25D: "부드러운 3D", WATERCOLOR: "수채화", HAND_DRAWN: "손그림", WEIRDO: "기괴", PIXEL: "픽셀",
};
/** 로그인 전이나 계정 전환 중에는 이전 계정의 운영 권한을 재사용하지 않는다. 서버 권한 검사도 별도로 유지한다. */
export function canViewSupportInquiries(operator, userId, permission) {
  if (!operator) return true;
  return Boolean(userId != null && permission?.userId === userId && permission?.operator === true);
}
export function canSubmitInquiry(description, agreed, imageReady, busy) {
  return Boolean(!busy && agreed && imageReady && description.trim().length > 0 && description.length <= 1000);
}
export function inquiryButtonLabel(ticket) {
  return ticket && ["OPEN", "IN_PROGRESS", "ANSWERED"].includes(ticket.status)
    ? "접수한 문의 보기" : ticket?.status === "COPYING" ? "접수 상태 확인" : "운영자에게 문의하기";
}
export function supportTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ko-KR");
}
export function supportNotificationPath(item) {
  if (!Number.isSafeInteger(item?.inquiryId) || item.inquiryId <= 0) return null;
  if (item.type === "SUPPORT_REPLIED") return `/support/inquiries/${item.inquiryId}`;
  // 운영자 알림은 별도 운영 화면으로 연결한다. 실제 접근 권한은 서버에서 다시 검사한다.
  if (item.type === "SUPPORT_INQUIRY_RECEIVED") return `/admin/support/inquiries/${item.inquiryId}`;
  return null;
}
