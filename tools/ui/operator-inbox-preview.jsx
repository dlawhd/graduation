import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import MemoryJarLogoIcon from "../../frontend/src/components/icons/MemoryJarLogoIcon";
import SupportLetterLayout from "../../frontend/src/features/support/SupportLetterLayout";
import SupportStatusBadge from "../../frontend/src/features/support/SupportStatusBadge";
import "../../frontend/src/index.css";
import "./operator-inbox-preview.css";

// 운영 API에 연결하지 않는 화면 비교용 데이터다. 목록 DTO에 있는 필드만 사용한다.
const tickets = [
  { inquiryId: 128, title: "사진을 추가하다가 업로드가 멈췄어요", description: "쪽지를 쓰면서 사진 두 장을 추가했는데 한 장이 계속 준비 중으로 보여요.", category: "사진·영상", status: "OPEN", createdAt: "2026. 11. 20. 오후 02:10" },
  { inquiryId: 127, title: "저금통 초대 링크를 확인해 주세요", description: "친구에게 보낸 초대 링크가 만료됐다고 나와요. 새로 만들어야 할까요?", category: "초대·참여", status: "IN_PROGRESS", createdAt: "2026. 11. 20. 오후 01:42" },
  { inquiryId: 126, title: "구글 로그인 후 다른 계정으로 들어가요", description: "이전에 네이버로 사용하던 저금통을 찾고 싶어요.", category: "로그인·계정", status: "WAITING_USER", createdAt: "2026. 11. 19. 오후 05:30" },
  { inquiryId: 125, title: "쪽지의 추억 날짜를 확인하고 싶어요", description: "날짜별로 정렬되는 것을 확인했어요. 안내해 주셔서 감사합니다.", category: "쪽지", status: "RESOLVED", createdAt: "2026. 11. 19. 오전 10:05" },
];
const variants = { cards: "01 · 카드형 문의함", table: "02 · 표형 문의함", split: "03 · 목록과 대화 함께 보기" };
const filters = [["", "전체"], ["OPEN", "접수"], ["IN_PROGRESS", "확인 중"], ["WAITING_USER", "추가 정보 대기"], ["ANSWERED", "답변 완료"], ["RESOLVED", "해결 완료"]];

/** 서비스의 공통 UI로 실행 가능한 예시를 렌더링한다. 변경은 이 화면의 메모리에만 남는다. */
function Preview() {
  const variant = new URLSearchParams(location.search).get("variant") || "cards";
  const [status, setStatus] = useState("");
  const [items, setItems] = useState(tickets);
  const [selectedId, setSelectedId] = useState(variant === "split" ? 128 : null);
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState("");
  const selected = items.find(item => item.inquiryId === selectedId);
  const visible = items.filter(item => !status || item.status === status);
  useEffect(() => {
    document.fonts.ready.then(() => {
      document.documentElement.dataset.previewReady = "true";
      document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > innerWidth);
    });
  }, []);
  function filter(value) {
    setStatus(value); setNotice("");
    if (variant === "split") setSelectedId(items.find(item => !value || item.status === value)?.inquiryId ?? null);
  }
  function choose(item) { setSelectedId(item.inquiryId); setReply(""); setNotice(""); }
  function updateStatus(next) {
    setItems(previous => previous.map(item => item.inquiryId === selectedId ? { ...item, status: next } : item));
    setNotice("예시 화면에 반영했어요. 실제 문의는 변경되지 않아요.");
  }
  const detail = selected && <section className="preview-detail" aria-label="문의 대화">
    <div className="preview-detail-head"><span className="preview-meta">문의 #{selected.inquiryId} · {selected.category}</span><SupportStatusBadge status={selected.status}/></div>
    <h2>{selected.title}</h2><p className="preview-meta">{selected.createdAt}</p>
    <div className="preview-thread"><div className="preview-message"><span>사용자 문의</span><p>{selected.description}</p></div>
      <div className="preview-thread-note">문의 내용과 첨부는 작성자와 운영자만 확인할 수 있어요.</div></div>
    <div className="preview-reply"><label htmlFor="operator-reply">답변 작성</label><textarea id="operator-reply" value={reply} onChange={event => setReply(event.target.value)} placeholder="확인한 내용과 다음 방법을 안내해 주세요."/>
      <p className="preview-meta">답변은 문의를 남긴 사용자에게만 전달돼요.</p>
      <div className="preview-reply-actions"><button className="support-letter-action" onClick={() => updateStatus(selected.status === "RESOLVED" ? "IN_PROGRESS" : "RESOLVED")}>{selected.status === "RESOLVED" ? "다시 확인" : "해결 완료"}</button><button disabled={!reply.trim()} className="support-letter-action is-primary" onClick={() => { updateStatus("ANSWERED"); setReply(""); }}>답변 보내기</button></div>
    </div>
  </section>;
  return <MemoryRouter><div className={`inbox-preview variant-${variant}`}>
    <header className="preview-site-header"><div className="preview-site-header-inner"><a href="/" className="preview-brand"><span className="preview-logo"><MemoryJarLogoIcon className="h-10 w-10"/></span>MEMORY JAR</a><nav aria-label="상단 메뉴"><a href="/help">도움말·문의</a><a href="/jars">내 저금통</a><button aria-label="알림"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><a href="/me">내정보</a></nav></div></header>
    <SupportLetterLayout backTo="/help" backLabel="도움말" title="운영 문의함" description="남겨주신 어려움을 확인하고, 함께 해결해 주세요." illustration={false}>
      <div className="preview-toolbar"><div><span className="preview-eyebrow">문의 관리</span><h2>도움이 필요한 이야기</h2></div><button className="support-letter-action" onClick={() => setNotice("예시 데이터의 최신 상태를 표시하고 있어요.")}>↻ 새로고침</button></div>
      <nav className="preview-filters" aria-label="처리 상태">{filters.map(([value, label]) => <button key={value} type="button" aria-pressed={status === value} onClick={() => filter(value)}>{label}</button>)}</nav>
      <div className="preview-list-caption"><span>현재 페이지 <strong>{visible.length}건</strong></span><span>최근 접수 순</span></div>
      {notice && <p role="status" className="preview-notice">{notice}</p>}
      {variant !== "split" && selected ? <div className="preview-single"><button className="preview-back" onClick={() => setSelectedId(null)}>← 문의 목록으로</button>{detail}</div> : variant === "cards" ? <div className="preview-cards">{visible.map(item => <button className="support-letter-card preview-ticket" key={item.inquiryId} onClick={() => choose(item)}><div className="preview-ticket-top"><span className="preview-meta">#{item.inquiryId} · {item.category}</span><SupportStatusBadge status={item.status}/></div><h3>{item.title}</h3><p>{item.description}</p><div className="preview-ticket-bottom"><span>{item.createdAt}</span><span>문의 확인 →</span></div></button>)}</div> : variant === "table" ? <div className="preview-table-wrap"><table className="preview-table"><thead><tr><th>문의</th><th>처리 상태</th><th>접수 시각</th><th><span className="sr-only">열기</span></th></tr></thead><tbody>{visible.map(item => <tr key={item.inquiryId}><td><span className="preview-meta">#{item.inquiryId} · {item.category}</span><button className="preview-table-title" onClick={() => choose(item)}>{item.title}</button><p>{item.description}</p></td><td><SupportStatusBadge status={item.status}/></td><td className="preview-meta">{item.createdAt}</td><td><button className="preview-open" aria-label={`${item.title} 열기`} onClick={() => choose(item)}>→</button></td></tr>)}</tbody></table></div> : <div className="preview-split"><aside aria-label="문의 목록">{visible.map(item => <button key={item.inquiryId} className={`preview-list-item ${selectedId === item.inquiryId ? "is-selected" : ""}`} onClick={() => choose(item)}><div><span className="preview-meta">#{item.inquiryId} · {item.category}</span><SupportStatusBadge status={item.status}/></div><h3>{item.title}</h3><p>{item.description}</p><span className="preview-meta">{item.createdAt}</span></button>)}</aside>{detail || <div className="preview-empty">확인할 문의를 선택해 주세요.</div>}</div>}
      {!visible.length && <div className="support-letter-card preview-empty">해당 상태의 문의가 없어요.</div>}
      <nav className="preview-pages" aria-label="목록 페이지"><button className="support-letter-action" disabled>이전</button><span>1 페이지</span><button className="support-letter-action" disabled>다음</button></nav>
      <footer className="preview-disclaimer">{variants[variant]} · 화면 비교용 예시 데이터 · 실제 문의와 연결되지 않아요.</footer>
    </SupportLetterLayout>
  </div></MemoryRouter>;
}
createRoot(document.getElementById("root")).render(<Preview/>);
