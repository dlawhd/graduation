import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { getGuestSupportSession, supportError } from "../api/supportApi";
import { useRequestGate } from "../api/useRequestGate";
import SupportComposer from "../features/support/SupportComposer";
import SupportInquiryDetail from "../features/support/SupportInquiryDetail";
import SupportCenterLayout from "../features/support/SupportCenterLayout";
import SupportGuidance from "../features/support/SupportGuidance";
import SupportInquiryList, { SupportListPagination } from "../features/support/SupportInquiryList";
import { useSupportInquiryList } from "../features/support/useSupportInquiryList";
import { supportInquiryId } from "../features/support/supportCenter.mjs";
import StatusNotice from "../components/feedback/StatusNotice";

/** 계정 로그인 없이 문의 전용 쿠키로 접수와 답변을 확인한다. 다른 브라우저/다른 세션의 문의는 조회하지 않는다. */
export default function SupportLoginHelpPage() {
  const location = useLocation(), [params, setParams] = useSearchParams();
  const rawId = params.get("inquiry"), inquiryId = supportInquiryId(rawId);
  const tab = rawId || params.get("tab") === "history" ? "history" : "new";
  const [reload, setReload] = useState(0), [snapshot, setSnapshot] = useState(null);
  const [sessionError, setSessionError] = useState(""), [sessionPending, setSessionPending] = useState(true);
  const [composerVersion, setComposerVersion] = useState(0), [composerBusy, setComposerBusy] = useState(false);
  const scope = `${location.key}:${reload}`, gate = useRequestGate(scope);
  const session = snapshot?.scope === scope ? snapshot.data : null;
  const list = useSupportInquiryList({ guest: true, enabled: Boolean(tab === "history" && !rawId && session?.active && !sessionPending),
    sessionVersion: reload, onDenied: () => { setSnapshot(null); setSessionError("이 브라우저의 문의 조회 시간이 지났어요. 새로고침으로 다시 확인하거나 새 문의를 남겨 주세요."); } });

  useEffect(() => {
    const controller = new AbortController(), current = gate.begin("session");
    setSessionPending(true); setSessionError("");
    getGuestSupportSession({ signal: controller.signal }).then(data => {
      if (current() && !controller.signal.aborted) setSnapshot({ scope, data });
    }).catch(error => { if (current() && !controller.signal.aborted) setSessionError(supportError(error)); })
      .finally(() => { if (current() && !controller.signal.aborted) setSessionPending(false); });
    return () => controller.abort();
  }, [gate, scope]);

  function refresh() { setReload(value => value + 1); }
  function showTab(value) { setParams(value === "history" ? { tab: "history" } : {}); }
  function created(ticket) {
    // 완료 후에만 폼을 비운다. 탭만 바꾸거나 첨부가 실패한 경우에는 입력·요청 번호를 유지한다.
    setComposerVersion(value => value + 1);
    list.reset();
    setParams({ tab: "history", inquiry: String(ticket.inquiryId) });
  }

  return <SupportCenterLayout active="login" title={rawId ? "로그인 문의와 답변" : "로그인이 어려우신가요?"} description={rawId ? "이 브라우저에서 접수한 문의를 확인해 주세요." : "로그인하지 않아도 문의를 남기고, 이 브라우저에서 답변을 확인할 수 있어요."} backTo="/" backLabel="홈으로">
    <div className="sc-guest-tabs" role="group" aria-label="로그인 도움 메뉴"><button type="button" disabled={composerBusy} aria-pressed={tab === "new"} onClick={() => showTab("new")}>문의 남기기</button><button type="button" disabled={composerBusy} aria-pressed={tab === "history"} onClick={() => showTab("history")}>이 브라우저의 문의</button></div>
    <div className="sc-compose-grid sc-guest-grid">
      {/* 탭 전환만으로 작성 폼을 언마운트하지 않는다. 글·파일·멱등성 번호는 이 페이지 메모리에만 남는다. */}
      <div className="sc-composer sc-guest-composer" hidden={tab !== "new"}><SupportComposer key={composerVersion} scopeKey="guest-composer" guest onBusyChange={setComposerBusy} onCreated={created}/></div>
      {tab === "history" && <div className="sc-composer sc-guest-composer">
        {sessionError ? <StatusNotice type="error" onRetry={refresh} busy={sessionPending}>{sessionError}</StatusNotice> : sessionPending || snapshot?.scope !== scope ? <StatusNotice type="loading" title="이 브라우저의 문의를 확인하고 있어요."/> : rawId && !inquiryId ? <StatusNotice type="error">문의 번호가 올바르지 않아요. <button type="button" className="sc-text-link" onClick={() => showTab("history")}>문의 목록으로</button></StatusNotice> : !session?.active ? <section className="sc-empty-card"><h2>{rawId ? "이 브라우저에서 해당 문의를 확인할 수 없어요." : "이 브라우저에서 남긴 문의가 없어요."}</h2><p>조회 시간이 지났거나 문의 쿠키가 없는 상태일 수 있어요.</p><button type="button" className="support-letter-action is-primary" onClick={() => showTab("new")}>새 로그인 문제 문의</button></section> : inquiryId ? <div className="sc-detail-card"><button type="button" className="sc-text-link" onClick={() => showTab("history")}>← 이 브라우저의 문의</button><SupportInquiryDetail key={`guest:${inquiryId}:${scope}`} inquiryId={inquiryId} guest onAccessDenied={() => { setSnapshot(null); setSessionError("이 브라우저에서 문의를 확인할 수 없어요. 새로고침으로 조회 권한을 다시 확인해 주세요."); }}/></div> : <section className="sc-guest-history">
          <div className="sc-list-toolbar"><div><h2>이 브라우저에서 남긴 문의</h2><p>접수한 브라우저에서만 답변을 확인할 수 있어요.</p></div><button type="button" className="support-letter-action" disabled={list.loading} onClick={refresh}>새로고침</button></div>
          {list.error && <StatusNotice type="error" onRetry={list.refresh} busy={list.loading}>{list.error}</StatusNotice>}
          {!list.result && !list.error && <StatusNotice type="loading" title="문의 목록을 불러오고 있어요."/>}
          {list.result?.items.length === 0 && <p className="sc-no-results" role="status">아직 접수한 로그인 문제 문의가 없어요.</p>}
          {list.result?.items.length > 0 && <SupportInquiryList history items={list.result.items} pathFor={id => `?tab=history&inquiry=${id}`}/>}
          <SupportListPagination page={list.page} nextBefore={list.result?.nextBefore} busy={list.loading} onPrevious={list.previous} onNext={list.next}/>
        </section>}
      </div>}
      <SupportGuidance guest/>
    </div>
  </SupportCenterLayout>;
}
