import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, useSearchParams } from "react-router-dom";
import MemoryJarLogoIcon from "../../frontend/src/components/icons/MemoryJarLogoIcon";
import SupportComposer from "../../frontend/src/features/support/SupportComposer";
import SupportInquiryDetail from "../../frontend/src/features/support/SupportInquiryDetail";
import SupportStatusBadge from "../../frontend/src/features/support/SupportStatusBadge";
import { SupportLetterIcon } from "../../frontend/src/features/support/SupportLetterLayout";
import { SUPPORT_CATEGORIES } from "../../frontend/src/features/support/supportContext.mjs";
import "../../frontend/src/index.css";
import "../../frontend/src/features/support/supportLetter.css";
import "./support-center-preview.css";

// 목록은 가짜 데이터다. FAQ는 캡처 도구가 현재 서버 코드의 문구를 읽어 전달한다.
const tickets = [
  { inquiryId: 128, title: "사진을 추가하다가 업로드가 멈췄어요", description: "쪽지를 쓰면서 사진 두 장을 추가했는데 한 장이 계속 준비 중으로 보여요.", category: "PHOTO_UPLOAD", status: "WAITING_USER", date: "2026. 11. 20. 오후 02:10" },
  { inquiryId: 127, title: "저금통 초대 링크를 확인하고 싶어요", description: "초대 링크의 사용 기간과 새 링크 만드는 방법을 확인했어요.", category: "INVITE_ACCESS", status: "ANSWERED", date: "2026. 11. 19. 오후 01:42" },
  { inquiryId: 126, title: "AI 꾸미기 결과에 대해 문의드려요", description: "직접 만든 저금통의 사진 배치와 생성 결과에 대해 질문이 있어요.", category: "AI_GENERATION", status: "OPEN", date: "2026. 11. 18. 오후 05:30" },
];
const pages = {
  help: ["도움말·문의", "어떤 도움이 필요하세요?", "궁금한 내용을 찾아보고, 해결되지 않으면 문의를 남겨 주세요."],
  inquiries: ["내 문의", "내 문의", "남긴 문의와 답변을 한곳에서 확인하세요."],
  empty: ["내 문의", "내 문의", "남긴 문의와 답변을 한곳에서 확인하세요."],
  new: ["문의하기", "어떤 어려움이 있었나요?", "상황을 알려주시면 확인한 내용을 답변으로 남겨드릴게요."],
  login: ["로그인 문제 문의", "로그인이 어려우신가요?", "로그인하지 않아도 문의를 남기고, 이 브라우저에서 답변을 확인할 수 있어요."],
  detail: ["내 문의", "문의와 답변", "필요한 설명을 이어서 남기고, 해결됐다면 알려주세요."],
};
const href = screen => `?screen=${screen}`;
const faq = window.supportPreviewFaq;

/** 기존 폰트·로고·폼·문의 상세를 재사용하는 비교용 화면이다. 운영 API에는 연결하지 않는다. */
function SupportCenterPreview() {
  const [params] = useSearchParams();
  const screen = pages[params.get("screen")] ? params.get("screen") : "help";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [notice, setNotice] = useState("");
  const [guestTab, setGuestTab] = useState("new");
  const [guestInquiry, setGuestInquiry] = useState(null);
  const [detailUpdates, setDetailUpdates] = useState({});
  const detailId = Number(params.get("inquiry")) || 128;
  const detailStatus = detailUpdates[detailId] || tickets.find(ticket => ticket.inquiryId === detailId)?.status || "WAITING_USER";
  const currentNav = ["inquiries", "empty", "detail"].includes(screen) ? "inquiries" : screen;
  const visible = faq.filter(item => (!category || item.category === category) && `${item.question} ${item.answer} ${SUPPORT_CATEGORIES[item.category]}`.toLowerCase().includes(search.trim().toLowerCase()));

  const guidance = <aside className="sc-aside">
    <section className="sc-guide"><span className="sc-kicker">문의 안내</span><h2>{screen === "login" ? "답변은 여기에서 확인해요" : "이렇게 알려주시면 좋아요"}</h2>
      {screen === "login" ? <><p>문의와 답변은 접수한 브라우저에 연결돼요.</p><div className="sc-cookie-note"><SupportLetterIcon name="info"/><p>쿠키를 지우거나 다른 기기·브라우저로 접속하면 기존 문의를 확인할 수 없어요.</p></div><p>접수 후 ‘이 브라우저의 문의’에서 답변을 확인해 주세요.</p></> : <ol><li><span>01</span><div><strong>어느 화면에서 문제가 생겼나요?</strong><p>쪽지 작성, 사진 추가처럼 화면을 알려주세요.</p></div></li><li><span>02</span><div><strong>어떤 순서로 진행했나요?</strong><p>기대했던 모습과 실제 상황을 함께 적어주세요.</p></div></li><li><span>03</span><div><strong>화면 캡처가 있나요?</strong><p>사진 없이도 문의를 남길 수 있어요.</p></div></li></ol>}
    </section>
    <section className="sc-aside-links"><h3>먼저 확인해 보세요</h3>{screen === "login" ? <><a href="/find-id">아이디 찾기 <span>↗</span></a><a href="/find-password">비밀번호 재설정 <span>↗</span></a></> : <><Link to={href("help")}>자주 묻는 질문 <span>→</span></Link><Link to={href("inquiries")}>내 문의와 답변 <span>→</span></Link></>}</section>
  </aside>;

  return <div className="support-center-preview" data-screen={screen}>
    <header className="sc-site-header"><div><Link to={href("help")} className="sc-brand"><span><MemoryJarLogoIcon className="h-10 w-10"/></span>MEMORY JAR</Link><nav aria-label="서비스 메뉴"><Link to={href("help")}>도움말·문의</Link>{screen !== "login" && <><a href="/jars">내 저금통</a><button type="button" aria-label="알림"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><a href="/me">내정보</a></>}</nav></div></header>
    <main className="sc-main"><div className="sc-inner">
      <div className="sc-breadcrumb"><a href={screen === "login" ? "/" : "/jars"}>← {screen === "login" ? "홈으로" : "내 저금통으로"}</a><span>{screen === "help" ? "도움말·문의" : `도움말·문의 / ${pages[screen][0]}`}</span></div>
      <header className="sc-heading"><div><span className="sc-kicker">Memory Jar 도움말</span><h1>{pages[screen][1]}</h1><p>{pages[screen][2]}</p></div>{screen === "help" && <Link to={href("inquiries")} className="support-letter-action">내 문의 확인 <span aria-hidden="true">→</span></Link>}</header>
      <nav className="sc-section-nav" aria-label="도움말 메뉴">{[["help", "도움말"], ["new", "문의하기"], ["inquiries", "내 문의"], ["login", "로그인 문제 문의"]].map(([key, label]) => <Link key={key} to={href(key)} aria-current={currentNav === key ? "page" : undefined}>{label}</Link>)}</nav>

      {screen === "help" && <>
        <section className="sc-search"><label htmlFor="sc-faq-search">궁금한 내용을 검색해 보세요</label><div><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="sc-faq-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="사진, 초대, 로그인 등을 검색해 주세요"/>{search && <button type="button" onClick={() => setSearch("")}>지우기</button>}</div><p>바로 찾기 {[["사진", "사진 업로드"], ["초대", "초대 링크"], ["로그인", "로그인"]].map(([value, label]) => <button key={value} onClick={() => { setCategory(""); setSearch(value); }}>{label}</button>)}</p></section>
        <div className="sc-help-grid"><section className="sc-faq-card"><header><div><span className="sc-kicker">자주 묻는 질문</span><h2>필요한 답을 먼저 찾아보세요</h2></div><span>{visible.length}개</span></header>
          <nav className="sc-topic-filters" aria-label="도움말 주제">{[["", "전체"], ["PHOTO_UPLOAD", "사진"], ["AI_GENERATION", "AI 꾸미기"], ["THREE_D", "3D"], ["NOTES_CHAT", "쪽지·채팅"], ["INVITE_ACCESS", "초대"], ["LOGIN_ACCOUNT", "로그인"], ["USAGE", "사용 방법"], ["OTHER", "기타"]].map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}</nav>
          <div className="sc-faq-list">{visible.map((item, index) => <details key={item.id} open={index === 0 || undefined}><summary><span>{item.question}</span><span aria-hidden="true">⌄</span></summary><p>{item.answer}</p></details>)}{!visible.length && <p className="sc-no-results" role="status">검색 결과가 없어요. 다른 검색어를 입력하거나 문의를 남겨 주세요.</p>}</div>
        </section><aside className="sc-aside"><section className="sc-contact-card"><span className="sc-contact-icon"><SupportLetterIcon name="info"/></span><h2>아직 해결되지 않았나요?</h2><p>겪고 있는 상황을 알려주세요.<br/>다른 사용자에게 공개되지 않아요.</p><Link to={href("new")} className="support-letter-action is-primary">문의 남기기 →</Link><Link to={href("login")} className="sc-text-link">로그인이 안 되나요?</Link></section><section className="sc-aside-links"><h3>이미 문의를 남겼다면</h3><p>내 문의에서 답변을 확인하고<br/>설명을 이어서 남길 수 있어요.</p><Link to={href("inquiries")}>내 문의 확인 <span>→</span></Link></section></aside></div>
      </>}

      {["inquiries", "empty"].includes(screen) && <section className="sc-my-inquiries"><div className="sc-list-toolbar"><div><h2>내가 남긴 문의</h2><p>{screen === "empty" ? "문의가 생기면 이곳에 모아드려요." : `현재 페이지 ${tickets.length}건 · 최근 접수 순`}</p></div><Link to={href("new")} className="support-letter-action is-primary">+ 문의하기</Link></div>
        {screen === "empty" ? <div className="sc-empty-card"><div className="sc-empty-icon"><SupportLetterIcon name="info"/></div><h3>아직 남긴 문의가 없어요</h3><p>도움이 필요한 순간이 생기면 편하게 남겨주세요.<br/>사진 없이도 문의할 수 있어요.</p><Link to={href("new")} className="support-letter-action is-primary">첫 문의 남기기</Link><Link to={href("help")} className="sc-text-link">자주 묻는 질문 먼저 보기 →</Link></div> : <div className="sc-ticket-list">{tickets.map(ticket => <Link key={ticket.inquiryId} to={`${href("detail")}&inquiry=${ticket.inquiryId}`} className="sc-ticket-row"><div><span className="sc-meta">#{ticket.inquiryId} · {SUPPORT_CATEGORIES[ticket.category]}</span><h3>{ticket.title}</h3><p>{ticket.description}</p><time>{ticket.date}</time></div><div><SupportStatusBadge status={ticket.status}/><span className="sc-row-open">문의 확인 →</span></div></Link>)}</div>}
        <aside className="sc-list-note"><SupportLetterIcon name="info"/><p>로그인 문제로 로그인 없이 남긴 문의는 <Link to={href("login")}>로그인 문제 문의</Link>에서 확인해 주세요.</p></aside>
      </section>}

      {screen === "new" && <div className="sc-compose-grid"><div className="sc-composer"><SupportComposer userId={1} onCreated={() => setNotice("예시 화면에서 접수 동작을 확인했어요. 실제 문의는 보내지 않았어요.")}/>{notice && <p className="sc-preview-feedback" role="status">{notice}</p>}</div>{guidance}</div>}

      {screen === "login" && <><div className="sc-guest-tabs" role="group" aria-label="로그인 도움 메뉴"><button aria-pressed={guestTab === "new"} onClick={() => { setGuestTab("new"); setGuestInquiry(null); }}>문의 남기기</button><button aria-pressed={guestTab === "history"} onClick={() => { setGuestTab("history"); setGuestInquiry(null); }}>이 브라우저의 문의</button></div>
        <div className="sc-compose-grid sc-guest-grid"><div className="sc-composer sc-guest-composer">{guestTab === "new" ? <><SupportComposer guest onCreated={() => setNotice("예시 화면에서 로그인 도움 접수를 확인했어요. 실제 문의는 보내지 않았어요.")}/>{notice && <p className="sc-preview-feedback" role="status">{notice}</p>}</> : guestInquiry ? <div className="sc-detail-card"><button className="sc-text-link" onClick={() => setGuestInquiry(null)}>← 이 브라우저의 문의</button><SupportInquiryDetail inquiryId={guestInquiry} guest/></div> : <section className="sc-guest-history"><div><h2>이 브라우저에서 남긴 문의</h2><p>접수한 브라우저에서만 답변을 확인할 수 있어요.</p></div>{[{id:128,title:"네이버 로그인 후 처음 화면으로 돌아와요",status:"WAITING_USER"},{id:127,title:"기존 계정의 로그인 방법을 확인하고 싶어요",status:"RESOLVED"}].map(item => <button key={item.id} className="sc-guest-ticket" onClick={() => setGuestInquiry(item.id)}><div><span className="sc-meta">#{item.id} · 로그인·계정</span><h3>{item.title}</h3><span className="sc-meta">2026. 11. 20.</span></div><SupportStatusBadge status={item.status}/></button>)}</section>}</div>{guidance}</div>
      </>}

      {screen === "detail" && <div className="sc-detail-grid"><aside className="sc-detail-nav"><Link to={href("inquiries")}>← 내 문의 목록</Link><section><h2>문의 진행 상태</h2><SupportStatusBadge status={detailStatus}/><p>{detailStatus === "WAITING_USER" ? "운영자가 확인에 필요한 내용을 추가로 요청했어요. 아래에 설명을 이어서 남겨주세요." : detailStatus === "RESOLVED" ? "해결된 문의예요. 문제가 계속되면 다시 문의할 수 있어요." : "내용을 확인하고 있어요. 필요한 설명을 이어서 남길 수 있어요."}</p></section><section><h3>내 문의에 대해</h3><p>다른 사용자에게 공개되지 않아요.<br/>문제가 해결됐다면 ‘해결됐어요’를 눌러주세요.</p></section></aside><div className="sc-detail-card"><SupportInquiryDetail userId={1} key={detailId} inquiryId={detailId} onUpdated={ticket => setDetailUpdates(previous => ({...previous, [detailId]:ticket.status}))}/></div></div>}
      <footer className="sc-preview-footer">화면 비교용 예시 · 실제 문의 데이터가 아닙니다.</footer>
    </div></main>
  </div>;
}
createRoot(document.getElementById("root")).render(<BrowserRouter><SupportCenterPreview/></BrowserRouter>);
