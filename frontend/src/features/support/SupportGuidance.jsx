import { Link, useLocation } from "react-router-dom";
import { SupportLetterIcon } from "./SupportLetterLayout";
import { supportCenterPaths } from "./supportCenter.mjs";

/** 작성 폼 옆에 필요한 안내만 표시한다. 로그인 문의의 브라우저 한정 조회 규칙도 설명한다. */
export default function SupportGuidance({ guest = false }) {
  const location = useLocation(), paths = supportCenterPaths(location.search);
  return <aside className="sc-aside">
    <section className="sc-guide"><span className="sc-kicker">문의 안내</span><h2>{guest ? "답변은 여기에서 확인해요" : "이렇게 알려주시면 좋아요"}</h2>
      {guest ? <><p>문의와 답변은 접수한 브라우저에 연결돼요.</p><div className="sc-cookie-note"><SupportLetterIcon name="info"/><p>쿠키를 지우거나 다른 기기·브라우저로 접속하면 기존 문의를 확인할 수 없어요.</p></div><p>접수 후 ‘이 브라우저의 문의’에서 답변을 확인해 주세요.</p></> : <ol>
        <li><span>01</span><div><strong>어느 화면에서 문제가 생겼나요?</strong><p>쪽지 작성, 사진 추가처럼 화면을 알려주세요.</p></div></li>
        <li><span>02</span><div><strong>어떤 순서로 진행했나요?</strong><p>기대했던 모습과 실제 상황을 함께 적어주세요.</p></div></li>
        <li><span>03</span><div><strong>화면 캡처가 있나요?</strong><p>사진 없이도 문의를 남길 수 있어요.</p></div></li>
      </ol>}
    </section>
    <section className="sc-aside-links"><h3>먼저 확인해 보세요</h3>{guest ? <><Link to="/find-id">아이디 찾기 <span>↗</span></Link><Link to="/find-password">비밀번호 재설정 <span>↗</span></Link></> : <><Link to={paths.help}>자주 묻는 질문 <span>→</span></Link><Link to={paths.inquiries}>내 문의와 답변 <span>→</span></Link></>}</section>
  </aside>;
}
