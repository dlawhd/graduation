import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import SupportInquiryDetail from "../features/support/SupportInquiryDetail";
import SupportStatusBadge from "../features/support/SupportStatusBadge";
import StatusNotice from "../components/feedback/StatusNotice";
import SupportCenterLayout from "../features/support/SupportCenterLayout";
import { SupportLetterIcon } from "../features/support/SupportLetterLayout";
import OperatorSupportInbox from "../features/support/OperatorSupportInbox";
import SupportInquiryList, { SupportListPagination } from "../features/support/SupportInquiryList";
import { useSupportInquiryList } from "../features/support/useSupportInquiryList";
import { supportCenterPaths, supportInquiryId } from "../features/support/supportCenter.mjs";

/** 내 문의와 운영 문의함의 권한·화면을 분리한다. 계정 전환 시 이전 문의 상태를 재사용하지 않는다. */
export default function SupportInquiriesPage({ me, checkingAuth, operator = false }) {
  const key = me?.userId ?? me?.id ?? "anonymous";
  return operator ? <OperatorSupportInbox key={key} me={me} checkingAuth={checkingAuth}/> : <UserSupportInquiries key={key} me={me} checkingAuth={checkingAuth}/>;
}

/** 본인 문의의 목록·상세를 표시하고 실시간 갱신은 로그인한 목록에서만 연결한다. */
function UserSupportInquiries({ me, checkingAuth }) {
  const { inquiryId: rawId } = useParams(), location = useLocation();
  const userId = me?.userId ?? me?.id, inquiryId = supportInquiryId(rawId);
  const paths = supportCenterPaths(location.search);
  const list = useSupportInquiryList({ userId, enabled: Boolean(userId && !checkingAuth && !rawId) });
  const [summary, setSummary] = useState(null);
  const ticket = summary?.inquiryId === inquiryId ? summary : null;
  const loginUrl = `/?${new URLSearchParams({ returnTo: location.pathname + location.search })}`;
  return <SupportCenterLayout active="inquiries" title={rawId ? "문의와 답변" : "내 문의"} description={rawId ? "필요한 설명을 이어서 남기고, 해결됐다면 알려주세요." : "남긴 문의와 답변을 한곳에서 확인하세요."} backTo={me ? "/jars" : "/"} backLabel={me ? "내 저금통으로" : "홈으로"}>
    {checkingAuth ? <StatusNotice type="loading" title="로그인을 확인하고 있어요."/> : !me ? <section className="sc-empty-card"><h2>로그인 후 내 문의를 확인할 수 있어요.</h2><p>로그인 없이 남긴 문의는 로그인 문제 문의에서 확인해 주세요.</p><Link to={loginUrl} className="support-letter-action is-primary">로그인하기</Link><Link to={paths.login} className="sc-text-link">로그인 문제 문의 →</Link></section> : rawId ? !inquiryId ? <StatusNotice type="error">문의 번호가 올바르지 않아요. <Link to={paths.inquiries} className="underline">내 문의 목록으로</Link></StatusNotice> : <div className="sc-detail-grid">
      <aside className="sc-detail-nav"><Link to={paths.inquiries}>← 내 문의 목록</Link>{ticket && <section><h2>문의 진행 상태</h2><SupportStatusBadge status={ticket.status}/><p>{ticket.contentExpired ? "문의 보관 기간이 지났습니다." : ticket.status === "WAITING_USER" ? "운영자가 확인에 필요한 내용을 추가로 요청했어요. 아래에 설명을 이어서 남겨주세요." : ticket.status === "RESOLVED" ? "해결된 문의예요. 문제가 계속되면 다시 문의할 수 있어요." : "문의와 답변을 확인하고, 필요한 설명을 이어서 남길 수 있어요."}</p></section>}<section><h3>내 문의에 대해</h3><p>다른 사용자에게 공개되지 않아요.<br/>문제가 해결됐다면 ‘해결됐어요’를 눌러주세요.</p></section></aside>
      <div className="sc-detail-card"><SupportInquiryDetail key={`${userId}:${inquiryId}`} inquiryId={inquiryId} userId={userId} onLoaded={setSummary}/></div>
    </div> : <section className="sc-my-inquiries">
      <div className="sc-list-toolbar"><div><h2>내가 남긴 문의</h2><p>{list.result ? list.result.items.length ? `현재 페이지 ${list.result.items.length}건 · 최근 접수 순` : "문의가 생기면 이곳에 모아드려요." : "문의 목록을 확인하고 있어요."}</p></div><div className="sc-refresh"><button type="button" disabled={list.loading} className="support-letter-action" onClick={list.refresh}>새로고침</button><Link to={paths.new} className="support-letter-action is-primary">+ 문의하기</Link></div></div>
      {list.error && <StatusNotice type="error" onRetry={list.refresh} busy={list.loading}>{list.error}</StatusNotice>}
      {!list.result && !list.error && <StatusNotice type="loading" title="문의 목록을 불러오고 있어요."/>}
      {list.result?.items.length === 0 && <div className="sc-empty-card"><div className="sc-empty-icon"><SupportLetterIcon name="info"/></div><h3>아직 남긴 문의가 없어요</h3><p>도움이 필요한 순간이 생기면 편하게 남겨주세요.<br/>사진 없이도 문의할 수 있어요.</p><Link to={paths.new} className="support-letter-action is-primary">첫 문의 남기기</Link><Link to={paths.help} className="sc-text-link">자주 묻는 질문 먼저 보기 →</Link></div>}
      {list.result?.items.length > 0 && <div aria-busy={list.loading}><SupportInquiryList items={list.result.items} pathFor={id => `/support/inquiries/${id}`}/></div>}
      <SupportListPagination page={list.page} nextBefore={list.result?.nextBefore} busy={list.loading} onPrevious={list.previous} onNext={list.next}/>
      <aside className="sc-list-note"><SupportLetterIcon name="info"/><p>로그인 문제로 로그인 없이 남긴 문의는 <Link to={paths.login}>로그인 문제 문의</Link>에서 확인해 주세요.</p></aside>
    </section>}
  </SupportCenterLayout>;
}
