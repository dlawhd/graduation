import { SUPPORT_CATEGORIES, supportContextFromSearch } from "./supportContext.mjs";

/** 도움말 탭 사이에는 검증된 문제 화면 정보만 전달한다. 검색·조회·외부 URL은 문의에 섞지 않는다. */
export function supportCenterPaths(search = "") {
  const context = supportContextFromSearch(search), query = new URLSearchParams();
  if (context.contextPath) query.set("from", context.contextPath);
  for (const key of ["jarId", "draftId", "errorCode", "occurredAt"]) if (context[key] != null) query.set(key, String(context[key]));
  const suffix = query.size ? `?${query}` : "";
  return { help: `/help${suffix}`, new: `/support/new${suffix}`, inquiries: "/support/inquiries", login: "/support/login-help" };
}

/** URL로 받은 문의 번호는 화면과 API 모두에서 안전하게 표현할 수 있는 양수만 허용한다. */
export function supportInquiryId(value) {
  return /^[1-9]\d*$/.test(value || "") && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

/** FAQ 검색은 이미 받은 공개 항목만 사용한다. 검색어 변경으로 서버를 반복 호출하지 않는다. */
export function filterSupportFaq(items, search, category) {
  const query = search.trim().toLocaleLowerCase();
  return items.filter(item => (!category || item.category === category)
    && `${item.question} ${item.answer} ${SUPPORT_CATEGORIES[item.category] || ""}`.toLocaleLowerCase().includes(query));
}
