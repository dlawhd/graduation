import { Link } from "react-router-dom";
import SupportStatusBadge from "./SupportStatusBadge";
import { supportTime } from "./supportView.mjs";
import { SUPPORT_CATEGORIES, supportTitle } from "./supportContext.mjs";

/** 본인 문의와 브라우저 문의의 표시만 재사용한다. 목록 데이터의 접근 권한은 각 API에서 검사한다. */
export default function SupportInquiryList({ items, pathFor, history = false }) {
  return <div className={`sc-ticket-list${history ? " sc-history-list" : ""}`}>{items.map(ticket => <Link key={ticket.inquiryId} to={pathFor(ticket.inquiryId)} className="sc-ticket-row">
    <div><span className="sc-meta">#{ticket.inquiryId} ({SUPPORT_CATEGORIES[ticket.category] || "AI 생성 및 결과 품질"})</span><h3>{supportTitle(ticket)}</h3>
      <p>{ticket.contentExpired ? "문의 보관 기간이 지났습니다." : ticket.description}</p><time>{supportTime(ticket.createdAt)}</time></div>
    <div><SupportStatusBadge status={ticket.status}/><span className="sc-row-open">문의 확인 →</span></div>
  </Link>)}</div>;
}

/** 한 페이지뿐일 때는 의미 없는 이전·다음 버튼을 숨긴다. 커서가 있는 목록에서만 이동한다. */
export function SupportListPagination({ page, nextBefore, busy, onPrevious, onNext }) {
  if (page === 0 && !nextBefore) return null;
  return <nav className="sc-pages" aria-label="문의 목록 페이지"><button type="button" disabled={busy || page === 0} className="support-letter-action" onClick={onPrevious}>이전</button><span>{page + 1} 페이지</span><button type="button" disabled={busy || !nextBefore} className="support-letter-action" onClick={onNext}>다음</button></nav>;
}
