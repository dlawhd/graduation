import { SUPPORT_STATUS, supportStatusPresentation } from "./supportView.mjs";

/** 문의 목록과 상세가 동일한 상태 이름·아이콘·색을 사용하게 하는 표시 전용 컴포넌트다. */
export default function SupportStatusBadge({ status }) {
  const presentation = supportStatusPresentation(status);
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${presentation.className}`}>
    <span aria-hidden="true">{presentation.icon}</span>{SUPPORT_STATUS[status] || status || "상태 확인 중"}
  </span>;
}
