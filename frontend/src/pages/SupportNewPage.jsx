import { Link, useLocation, useNavigate } from "react-router-dom";
import SupportComposer from "../features/support/SupportComposer";
import { supportContextFromSearch } from "../features/support/supportContext.mjs";
import SupportCenterLayout from "../features/support/SupportCenterLayout";
import SupportGuidance from "../features/support/SupportGuidance";
import StatusNotice from "../components/feedback/StatusNotice";

/** 로그인 사용자의 일반 문의 화면이다. 사진/저금통 번호는 필수가 아니며 문제 화면 정보도 제거할 수 있다. */
export default function SupportNewPage({ me, checkingAuth }) {
  const navigate = useNavigate(), location = useLocation(), id = me?.userId ?? me?.id;
  const returnTo = location.pathname + location.search + location.hash;
  const loginUrl = `/?${new URLSearchParams({ returnTo })}`;
  return <SupportCenterLayout active="new" title="어떤 어려움이 있었나요?" description="상황을 알려주시면 확인한 내용을 답변으로 남겨드릴게요." backTo={id ? "/jars" : "/"} backLabel={id ? "내 저금통으로" : "홈으로"}>
    {checkingAuth ? <StatusNotice type="loading" title="로그인 상태를 확인하고 있어요."/> : !id ? <section className="sc-empty-card"><h2>일반 문의는 로그인 후 접수할 수 있어요.</h2><p>로그인 후 이 작성 화면으로 돌아와요.<br/>로그인 자체가 어렵다면 로그인 문제 문의를 이용해 주세요.</p><Link to={loginUrl} className="support-letter-action is-primary">로그인하기</Link><Link to="/support/login-help" className="sc-text-link">로그인 문제 문의 →</Link></section>
      : <div className="sc-compose-grid"><div className="sc-composer"><SupportComposer key={`${id}:${location.key}`} userId={id} context={supportContextFromSearch(location.search)} onCreated={ticket => navigate(`/support/inquiries/${ticket.inquiryId}`)}/></div><SupportGuidance/></div>}
  </SupportCenterLayout>;
}
