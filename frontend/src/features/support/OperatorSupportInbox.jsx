import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SupportLetterLayout from "./SupportLetterLayout";
import SupportInquiryDetail from "./SupportInquiryDetail";
import SupportStatusBadge from "./SupportStatusBadge";
import StatusNotice from "../../components/feedback/StatusNotice";
import { supportTime, SUPPORT_STATUS } from "./supportView.mjs";
import { SUPPORT_CATEGORIES, supportTitle } from "./supportContext.mjs";
import { useOperatorSupportInbox } from "./useOperatorSupportInbox";
import "./operatorInbox.css";

const base = "/admin/support/inquiries";
const statuses = ["OPEN", "IN_PROGRESS", "WAITING_USER", "ANSWERED", "RESOLVED"];

/** 실제 운영 목록과 기존 문의 상세를 함께 표시한다. 답변 초안은 이 화면의 메모리에만 보관한다. */
export default function OperatorSupportInbox({ me, checkingAuth }) {
  const userId = me?.userId ?? me?.id;
  const { inquiryId } = useParams();
  const navigate = useNavigate();
  const inbox = useOperatorSupportInbox({ userId, checkingAuth });
  const drafts = useRef(new Map());
  const [draftIds, setDraftIds] = useState([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const detailRef = useRef(null);
  const focusRequested = useRef(false);
  const items = inbox.result?.items || [];
  const selected = inquiryId ? String(inquiryId) : null;
  const validSelection = selected && /^[1-9]\d{0,18}$/.test(selected);

  // 첫 진입은 첫 문의를 선택하되 알림의 상세 링크는 그대로 연다. 선택만 바뀔 때 목록은 재조회하지 않는다.
  useEffect(() => {
    if (inbox.allowed && !selected && items.length) navigate(`${base}/${items[0].inquiryId}`, { replace: true });
  }, [inbox.allowed, selected, items, navigate]);
  useEffect(() => {
    if (!inbox.allowed) { drafts.current.clear(); setDraftIds([]); }
  }, [inbox.allowed]);
  useEffect(() => {
    if (!selected || !inbox.allowed || !focusRequested.current) return;
    focusRequested.current = false;
    // 모바일에서 문의를 골랐을 때 대화가 목록 아래에 있다는 사실을 키보드 사용자도 알 수 있게 한다.
    detailRef.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 767px)").matches) detailRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [selected, inbox.allowed]);
  useEffect(() => {
    if (!draftIds.length) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftIds.length]);

  function rememberDraft(id, draft) {
    if (!inbox.allowed) return;
    const dirty = Boolean(draft.content.trim() || draft.files.length || draft.waiting);
    if (dirty) drafts.current.set(id, draft); else drafts.current.delete(id);
    // 글자마다 목록을 다시 그리지 않고, 미전송 상태가 바뀔 때만 작성 중 표시를 갱신한다.
    setDraftIds(previous => {
      const present = previous.includes(id);
      return present === dirty ? previous : dirty ? [...previous, id] : previous.filter(value => value !== id);
    });
  }

  return <div className="operator-inbox"><SupportLetterLayout backTo="/help" backLabel="도움말" title="운영 문의함" description="남겨주신 어려움을 확인하고, 함께 해결해 주세요." illustration={false}>
    {checkingAuth ? <StatusNotice type="loading" title="로그인을 확인하고 있어요."/> : !me ? <div className="support-letter-card"><p>로그인 후 운영 문의함을 확인할 수 있어요.</p><Link to="/" className="support-letter-action mt-4">로그인 화면으로</Link></div> : !inbox.allowed ? <div className="support-letter-card"><p role={inbox.permission || inbox.permissionError ? "alert" : "status"}>{inbox.permissionError || (inbox.permission ? "서비스 운영자만 이용할 수 있습니다. 저금통 관리자 권한과는 다릅니다." : "운영자 권한을 확인하고 있어요.")}</p>{inbox.permissionError && <button className="support-letter-action mt-4" onClick={inbox.retryPermission}>다시 확인</button>}</div> : <>
      <div className="operator-inbox-toolbar"><div><span className="operator-inbox-eyebrow">문의 관리</span><h2>도움이 필요한 이야기</h2></div><button type="button" disabled={inbox.loading || detailBusy} className="support-letter-action" onClick={inbox.refresh}>↻ {inbox.loading ? "확인 중…" : "새로고침"}</button></div>
      <nav className="operator-inbox-filters" aria-label="문의 처리 상태">{["", ...statuses].map(value => <button key={value} type="button" aria-pressed={inbox.status === value} disabled={detailBusy} onClick={() => inbox.changeStatus(value)}>{value ? SUPPORT_STATUS[value] : "전체"}</button>)}</nav>
      <div className="operator-inbox-caption"><span>{inbox.result ? <>현재 페이지 <strong>{items.length}건</strong></> : "문의 목록 확인 중"}</span><span>최근 접수 순{inbox.updatedAt && <> (갱신 <time dateTime={inbox.updatedAt.toISOString()}>{inbox.updatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</time>)</>}</span></div>
      {inbox.error && <StatusNotice type="error" onRetry={inbox.refresh} busy={inbox.loading}>{inbox.error}</StatusNotice>}
      <div className="operator-inbox-workspace">
        <aside className="operator-inbox-list" aria-label="운영 문의 목록" aria-busy={inbox.loading}>
          {!inbox.result && !inbox.error && <p role="status" className="operator-inbox-empty">문의 목록을 불러오고 있어요.</p>}
          {inbox.result && !items.length && <p role="status" className="operator-inbox-empty">해당 상태의 문의가 없어요.</p>}
          {items.map(ticket => <button type="button" key={ticket.inquiryId} disabled={detailBusy} aria-current={selected === String(ticket.inquiryId) ? "true" : undefined} className="operator-inbox-item" onClick={() => { if (selected !== String(ticket.inquiryId)) { focusRequested.current = true; navigate(`${base}/${ticket.inquiryId}`); } }}>
            <div className="operator-inbox-item-meta"><span>#{ticket.inquiryId} ({SUPPORT_CATEGORIES[ticket.category] || "AI 생성 및 결과 품질"})</span><SupportStatusBadge status={ticket.status}/></div>
            <h3>{supportTitle(ticket)}</h3><p>{ticket.contentExpired ? "문의 보관 기간이 지났습니다." : ticket.description}</p>
            <div className="operator-inbox-item-bottom"><time>{supportTime(ticket.createdAt)}</time>{draftIds.includes(String(ticket.inquiryId)) && <span className="operator-inbox-draft-badge">작성 중</span>}</div>
          </button>)}
        </aside>
        <div ref={detailRef} tabIndex={-1} className="operator-inbox-conversation" aria-label="선택한 문의">
          {selected && inbox.result && !items.some(ticket => String(ticket.inquiryId) === selected) && <p className="operator-inbox-selection-note">선택한 문의는 현재 목록에 없어요. 다른 문의를 선택하거나 필터 또는 페이지를 바꿔 보세요.</p>}
          {validSelection ? <SupportInquiryDetail key={`${userId}:${selected}`} inquiryId={selected} operator userId={userId} embedded initialDraft={drafts.current.get(selected)} onDraftChange={draft => rememberDraft(selected, draft)} onBusyChange={setDetailBusy} onAccessDenied={inbox.revokeAccess} onUpdated={inbox.refresh}/> : <p role={selected ? "alert" : "status"} className="operator-inbox-empty">{selected ? "문의 번호가 올바르지 않아요. 목록에서 문의를 선택해 주세요." : "확인할 문의를 선택해 주세요."}</p>}
        </div>
      </div>
      <nav className="operator-inbox-pages" aria-label="운영 문의 목록 페이지"><button type="button" className="support-letter-action" disabled={inbox.loading || detailBusy || inbox.page === 0} onClick={inbox.previous}>이전</button><span>{inbox.page + 1} 페이지</span><button type="button" className="support-letter-action" disabled={inbox.loading || detailBusy || !inbox.result?.nextBefore} onClick={inbox.next}>다음</button></nav>
      {draftIds.length > 0 && <p role="status" className="operator-inbox-draft-note">작성 중인 답변 {draftIds.length}건은 이 문의함에서 다른 문의를 선택해도 유지돼요. 문의함을 벗어나거나 새로고침하면 사라져요.</p>}
    </>}
  </SupportLetterLayout></div>;
}
