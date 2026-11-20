import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getSupportFaq, supportError } from "../api/supportApi";
import { SUPPORT_CATEGORIES } from "../features/support/supportContext.mjs";
import SupportCenterLayout from "../features/support/SupportCenterLayout";
import { SupportLetterIcon } from "../features/support/SupportLetterLayout";
import { filterSupportFaq, supportCenterPaths } from "../features/support/supportCenter.mjs";
import StatusNotice from "../components/feedback/StatusNotice";

const topics = [["", "전체"], ["PHOTO_UPLOAD", "사진"], ["AI_GENERATION", "AI 꾸미기"], ["THREE_D", "3D"], ["NOTES_CHAT", "쪽지·채팅"], ["INVITE_ACCESS", "초대"], ["LOGIN_ACCOUNT", "로그인"], ["USAGE", "사용 방법"], ["OTHER", "기타"]];

/** 로그인 없이 기본 도움말을 검색하고, 해결되지 않은 문제는 일반/로그인 도움 문의로 연결한다. */
export default function SupportHelpPage({ me }) {
  const [params, setParams] = useSearchParams(), paths = supportCenterPaths(params.toString());
  const [items, setItems] = useState([]), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const search = (params.get("q") || "").slice(0, 200), rawCategory = params.get("category") || "";
  const category = Object.hasOwn(SUPPORT_CATEGORIES, rawCategory) ? rawCategory : "";
  const visible = filterSupportFaq(items, search, category);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    getSupportFaq({ signal: controller.signal }).then(data => { if (!controller.signal.aborted) setItems(Array.isArray(data) ? data : []); })
      .catch(e => { if (!controller.signal.aborted) setError(supportError(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  function updateFilters(query, topic) {
    const next = new URLSearchParams(params);
    if (query) next.set("q", query); else next.delete("q");
    if (topic) next.set("category", topic); else next.delete("category");
    setParams(next, { replace: true });
  }
  return <SupportCenterLayout active="help" title="어떤 도움이 필요하세요?" description="궁금한 내용을 찾아보고, 해결되지 않으면 문의를 남겨 주세요." backTo={me ? "/jars" : "/"} backLabel={me ? "내 저금통으로" : "홈으로"} action={<Link to={paths.inquiries} className="support-letter-action">내 문의 확인 →</Link>}>
    <section className="sc-search"><label htmlFor="support-faq-search">궁금한 내용을 검색해 보세요</label><div><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="support-faq-search" aria-label="도움말 검색" type="search" maxLength={200} value={search} onChange={e => updateFilters(e.target.value, category)} placeholder="사진, 초대, 로그인 등을 검색해 주세요"/>{search && <button type="button" onClick={() => updateFilters("", category)}>지우기</button>}</div>
      <p>바로 찾기 {[["사진", "사진 업로드"], ["초대", "초대 링크"], ["로그인", "로그인"]].map(([value, label]) => <button key={value} type="button" onClick={() => updateFilters(value, "")}>{label}</button>)}</p>
    </section>
    <div className="sc-help-grid"><section className="sc-faq-card" aria-busy={loading}><header><div><span className="sc-kicker">자주 묻는 질문</span><h2>필요한 답을 먼저 찾아보세요</h2></div>{!loading && !error && <span role="status">{visible.length}개</span>}</header>
      <nav className="sc-topic-filters" aria-label="도움말 주제">{topics.map(([key, label]) => <button key={key} type="button" aria-pressed={category === key} onClick={() => updateFilters(search, key)}>{label}</button>)}</nav>
      <div className="sc-faq-list">
        {loading ? <p role="status" className="sc-no-results">도움말을 불러오고 있어요.</p> : error ? <StatusNotice type="error" onRetry={() => setReload(n => n + 1)}>{error}</StatusNotice> : <>
          {visible.map((item, index) => <details key={`${category}:${search}:${item.id}`} open={index === 0 || undefined}><summary><span>{item.question}</span><span aria-hidden="true">⌄</span></summary><p>{item.answer}</p></details>)}
          {!visible.length && <div className="sc-no-results" role="status"><p>검색 결과가 없어요. 다른 검색어를 입력하거나 문의를 남겨 주세요.</p>{(search || category) && <button type="button" className="sc-text-link" onClick={() => updateFilters("", "")}>검색 조건 초기화</button>}</div>}
        </>}
      </div>
    </section><aside className="sc-aside"><section className="sc-contact-card"><span className="sc-contact-icon"><SupportLetterIcon name="info"/></span><h2>아직 해결되지 않았나요?</h2><p>겪고 있는 상황을 알려주세요.<br/>다른 사용자에게 공개되지 않아요.</p><Link to={me ? paths.new : paths.login} className="support-letter-action is-primary">{me ? "문의 남기기 →" : "로그인 문제 문의 →"}</Link>{me ? <Link to={paths.login} className="sc-text-link">로그인이 안 되나요?</Link> : <Link to={paths.new} className="sc-text-link">다른 문의 남기기</Link>}</section><section className="sc-aside-links"><h3>이미 문의를 남겼다면</h3><p>내 문의에서 답변을 확인하고<br/>설명을 이어서 남길 수 있어요.</p><Link to={paths.inquiries}>내 문의 확인 <span>→</span></Link></section></aside></div>
  </SupportCenterLayout>;
}
