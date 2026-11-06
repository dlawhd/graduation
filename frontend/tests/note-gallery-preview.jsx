import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import apiClient from "../src/api/apiClient";
import OwnNotesModal from "../src/features/jarDetail/components/OwnNotesModal";
import JarZoomNoteDetailModal from "../src/features/jarDetail/components/JarZoomNoteDetailModal";

/** 실제 쪽지 컴포넌트를 합성 사진과 로컬 API 대역으로 검증한다. 운영 데이터는 사용하지 않는다. */
if (!import.meta.env.DEV) throw new Error("로컬 시험 전용");
const params = new URLSearchParams(location.search), kind = params.get("kind") || "own", mode = params.get("mode") || "multi";
const photo = (id, url = `/tests/gallery-${id}.svg`) => ({ attachmentId: id, url, thumbnailUrl: "/tests/gallery-thumb.svg", contentType: "image/svg+xml", caption: `사진 설명 ${id}` });
const video = { attachmentId: 99, url: "/tests/video.mp4", contentType: "video/mp4" };
const attachments = mode === "single" ? [photo(1)] : mode === "none" ? [video] : mode === "duplicate" ? [photo(1), photo(2, "/tests/gallery-1.svg")]
  : [photo(1), video, photo(2), photo(3, "/tests/gallery-missing.svg"), photo(4)];
const note = { noteId: 1, title: "시험 쪽지", content: "사진을 넘겨보는 시험 본문", attachments, tags: [], commentCount: 0 };
window.galleryFixture = { reads: 0, note };
apiClient.defaults.adapter = async config => {
  window.galleryFixture.reads++;
  const data = config.url.endsWith("/mine") ? { items: [note], totalElements: 1, totalPages: 1 } : note;
  return { data: { data }, status: 200, statusText: "OK", headers: {}, config };
};
function Fixture() {
  const [open, setOpen] = useState(false), [selectedNote, setNote] = useState(note);
  window.galleryFixture.replaceNote = () => setNote({ ...note, noteId: 2, attachments: [photo(4)] });
  return <><button type="button" onClick={() => setOpen(true)}>쪽지 열기</button>
    {open && (kind === "own" ? <OwnNotesModal jarId={7} userId={1} onClose={() => setOpen(false)}/> :
      <JarZoomNoteDetailModal open={open} note={selectedNote} jar={{ isOpen: true }} palette={{}} comments={[]}
        commentDraft="" replyDraftMap={{}} replyExpandedMap={{}} onClose={() => setOpen(false)}/>)}</>;
}
createRoot(document.getElementById("root")).render(<Fixture/>);
