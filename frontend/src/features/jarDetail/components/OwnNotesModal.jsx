import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { getOwnNotes, getOwnNoteDetail } from "../../../api/ownNoteApi";
import { useRequestGate } from "../../../api/useRequestGate";
import NoteAttachmentCarousel from "../../note/components/NoteAttachmentCarousel";

/** 오픈 전 작성자 본인의 쪽지만 확인하는 읽기 전용 창이다. 다른 멤버의 장수·본문과 댓글/리액션은 조회하지 않는다. */
export default function OwnNotesModal({ jarId, userId, onClose }) {
  const titleId = useId();
  const dialog = useRef(null);
  const closeButton = useRef(null);
  const imageDialog = useRef(null);
  const imageCloseButton = useRef(null);
  const imageReturnFocus = useRef(null);
  const currentImage = useRef(null);
  const detailRequest = useRef(null);
  const gate = useRequestGate(`${jarId}:${userId}`);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [note, setNote] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState(null);
  currentImage.current = image;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 키보드 포커스를 창 안에 유지하고, 닫으면 원래 버튼으로 돌려준다.
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const key = event => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (currentImage.current) setImage(null);
        else onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const activeDialog = currentImage.current ? imageDialog.current : dialog.current;
      const controls = Array.from(activeDialog?.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),video[controls],[tabindex="0"]'
      ) || []).filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      detailRequest.current?.abort();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  // 확대를 닫으면 누른 사진 버튼으로 돌아간다. 쪽지 창의 포커스·스크롤 잠금은 유지한다.
  useEffect(() => {
    if (image?.url) imageCloseButton.current?.focus();
    else if (imageReturnFocus.current) {
      if (imageReturnFocus.current.isConnected) imageReturnFocus.current.focus();
      imageReturnFocus.current = null;
    }
  }, [image?.url]);

  /** 캐러셀의 잘린 미리보기 대신, 서버가 본인 권한으로 반환한 원본 주소를 그대로 사용한다. */
  function openImage(attachment) {
    if (!attachment?.url) { setError("원본 사진 주소를 확인할 수 없어요. 쪽지를 다시 열어 주세요."); return; }
    imageReturnFocus.current = document.activeElement;
    document.activeElement?.blur?.();
    setImage({ url: attachment.url, caption: attachment.caption || "", status: "loading" });
  }

  useEffect(() => {
    const controller = new AbortController();
    const current = gate.begin("list");
    setLoading(true); setError(""); setResult(null);
    getOwnNotes(jarId, { page, q: query, signal: controller.signal }).then(data => {
      if (!current()) return;
      if (page > 0 && page >= Math.max(1, data.totalPages)) { setPage(Math.max(0, data.totalPages - 1)); return; }
      setResult(data);
    }).catch(e => {
      if (current() && e.code !== "ERR_CANCELED") setError(e.response?.data?.error?.message || "내 쪽지를 불러오지 못했어요.");
    }).finally(() => { if (current()) setLoading(false); });
    return () => controller.abort();
  }, [gate, jarId, page, query, retry]);

  /** 목록으로 돌아가거나 창을 닫은 뒤에는 늦은 상세 응답을 반영하지 않는다. */
  async function openNote(id) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    const current = gate.begin("detail");
    setImage(null); setSelected(id); setNote(null); setDetailLoading(true); setError("");
    try {
      const value = await getOwnNoteDetail(jarId, id, { signal: controller.signal });
      if (current()) setNote(value);
    } catch (e) {
      if (current() && e.code !== "ERR_CANCELED") setError(e.response?.data?.error?.message || "내 쪽지를 불러오지 못했어요.");
    } finally { if (current()) setDetailLoading(false); }
  }

  function backToList() {
    gate.begin("detail");
    detailRequest.current?.abort();
    setImage(null); setSelected(null); setNote(null); setDetailLoading(false); setError("");
  }
  return createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-3 sm:p-6" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} inert={image ? true : undefined} aria-hidden={image ? true : undefined} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[#fffdf8] shadow-xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><h2 id={titleId} className="text-lg font-black text-slate-800">내가 넣은 쪽지</h2><button ref={closeButton} type="button" onClick={onClose} className="min-h-11 rounded-xl border px-4 text-sm font-bold">닫기</button></header>
      <div className="space-y-4 overflow-y-auto overscroll-contain p-5">
        <p className="rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">내가 넣은 쪽지만 확인할 수 있어요. 다른 멤버의 쪽지와 작성 여부는 저금통이 열린 뒤에 공개돼요.</p>
        {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}<button type="button" onClick={()=>selected?void openNote(selected):setRetry(n=>n+1)} className="ml-2 min-h-11 underline">다시 확인</button></p>}
        {selected?<>
          <button type="button" onClick={backToList} className="min-h-11 text-sm font-bold text-emerald-800">← 내 쪽지 목록</button>
          {detailLoading&&<p role="status">쪽지를 불러오고 있어요.</p>}
          {note&&<article className="space-y-4"><h3 className="break-words text-xl font-bold">{note.title}</h3><p className="whitespace-pre-wrap break-words text-sm leading-7">{note.content}</p>
            <dl className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2"><div><dt className="font-bold">추억 날짜</dt><dd>{note.noteDate||"기록 없음"}</dd></div><div><dt className="font-bold">장소</dt><dd className="break-words">{note.location||"기록 없음"}</dd></div></dl>
            {!!note.tags?.length&&<p className="break-words text-sm text-emerald-800">{note.tags.map(tag=>`#${tag}`).join(" ")}</p>}
            <NoteAttachmentCarousel attachments={note.attachments||[]} onImageClick={openImage}/>
          </article>}
        </>:<>
          <form onSubmit={e=>{e.preventDefault();setPage(0);setQuery(search.trim());}} className="flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">내 쪽지 검색</span><input aria-label="내 쪽지 검색" value={search} maxLength={200} onChange={e=>setSearch(e.target.value)} placeholder="제목·내용·장소로 검색" className="min-h-12 w-full rounded-xl border bg-white px-3 text-base"/></label><button type="submit" className="min-h-12 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white">검색</button></form>
          {loading&&<p role="status">내 쪽지를 불러오고 있어요.</p>}
          {!loading&&result&&<><p className="text-sm text-slate-500">내 쪽지 {result.totalElements}개</p>
            {!result.items?.length&&<p className="rounded-xl bg-slate-50 p-4 text-sm">{query?"검색 결과가 없어요.":"아직 내가 넣은 쪽지가 없어요."}</p>}
            <ul className="space-y-3">{result.items?.map(item=><li key={item.noteId}><button type="button" onClick={()=>void openNote(item.noteId)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-400"><strong className="block break-words">{item.title}</strong><span className="mt-2 block break-words text-sm leading-6 text-slate-500">{item.previewContent}</span><span className="mt-2 block text-xs text-slate-500">{item.noteDate||"날짜 기록 없음"}</span></button></li>)}</ul>
            <nav aria-label="내 쪽지 페이지" className="flex items-center justify-center gap-3"><button type="button" disabled={page===0} onClick={()=>setPage(n=>n-1)} className="min-h-11 rounded-xl border px-3 text-sm disabled:opacity-40">이전</button><span className="text-sm">{page+1} / {Math.max(1,result.totalPages)}</span><button type="button" disabled={page+1>=result.totalPages} onClick={()=>setPage(n=>n+1)} className="min-h-11 rounded-xl border px-3 text-sm disabled:opacity-40">다음</button></nav>
          </>}
        </>}
      </div>
    </section>
    {image && <div ref={imageDialog} role="dialog" aria-modal="true" aria-label="원본 사진 보기"
      className="fixed inset-0 z-[10001] flex flex-col gap-4 bg-black/90 p-4 sm:p-6"
      onClick={event => { if (event.target === event.currentTarget) setImage(null); }}>
      <header className="flex shrink-0 items-center justify-between gap-4 text-white">
        <h3 className="font-bold">원본 사진</h3>
        <button ref={imageCloseButton} type="button" onClick={() => setImage(null)}
          className="min-h-11 rounded-xl border border-white/40 bg-white/10 px-4 font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">원본 사진 닫기</button>
      </header>
      <div className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center">
        {image.status === "loading" && <p role="status" className="absolute text-sm text-white">원본 사진을 불러오고 있어요.</p>}
        {image.status === "error" && <p role="alert" className="max-w-md rounded-xl bg-white p-4 text-sm leading-6 text-rose-800">원본 사진을 불러오지 못했어요. 사진을 닫은 뒤 쪽지를 다시 열어 주세요.</p>}
        <img key={image.url} src={image.url} alt="원본 사진" draggable={false} referrerPolicy="no-referrer"
          className={`pointer-events-auto max-h-full max-w-full object-contain ${image.status === "ready" ? "" : "hidden"}`}
          onLoad={() => setImage(current => current?.url === image.url ? { ...current, status: "ready" } : current)}
          onError={() => setImage(current => current?.url === image.url ? { ...current, status: "error" } : current)}/>
      </div>
      {image.caption && <p className="mx-auto max-h-28 w-full max-w-3xl shrink-0 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white/10 p-3 text-center text-sm leading-6 text-white">{image.caption}</p>}
    </div>}
  </div>,document.body);
}
