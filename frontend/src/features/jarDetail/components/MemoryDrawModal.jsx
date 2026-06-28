import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import apiClient from "../../../api/apiClient";
import MemoryDrawNoteIcon from "../../../components/icons/MemoryDrawNoteIcon";
import { formatNoteDateOnly } from "../utils/jarDetailDateUtils";

/*
 * MemoryDrawModal 역할
 *
 * "추억 쪽지 뽑기"를 모달로 보여주는 컴포넌트야.
 *
 * 쉽게 말하면:
 * - 평소에는 화면에 보이지 않는다.
 * - 사용자가 "추억 쪽지 뽑기" 버튼을 누르면 열린다.
 * - 오늘 받을 수 있는 추억이 있으면 뽑기 버튼을 보여준다.
 * - 이미 뽑은 추억이 있으면 결과 카드와 뽑기 기록을 보여준다.
 * - 뽑기 기록을 누르면 해당 쪽지 상세 정보를 다시 불러와서 보여준다.
 */
 export default function MemoryDrawModal({
   open,
   jar,
   palette,
   today,
   history,
   loading,
   drawing,
   error,
   onClose,
   onDraw,
   onReload,
   onOpenNoteDetail,
   realtimeMessage,
   onOpenAllNotes,
   onOpenChat,
 }) {
   // 추억 쪽지 뽑기 애니메이션이 재생 중인지 저장한다.
   // true면 결과를 바로 보여주지 않고, 가운데에서 쪽지 뽑기 연출을 먼저 보여준다.
   const [drawAnimationPlaying, setDrawAnimationPlaying] = useState(false);

   // 사용자가 뽑기 기록에서 선택한 기록을 저장한다.
   // null이면 기본으로 "오늘 뽑힌 추억"을 보여준다.
   const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

   // 사용자가 뽑기 기록에서 선택한 쪽지의 "상세 정보"를 저장한다.
   // 히스토리 목록 item은 요약 정보라서 사진 attachments가 없을 수 있기 때문에,
   // 클릭할 때 상세 API로 다시 가져온 데이터를 여기에 넣는다.
   const [selectedHistoryNote, setSelectedHistoryNote] = useState(null);

   // 기록을 눌렀을 때 상세 정보를 불러오는 중인지 저장한다.
   const [selectedHistoryLoading, setSelectedHistoryLoading] = useState(false);

   // 기록 상세 조회에 실패했을 때 보여줄 안내 문구다.
   const [selectedHistoryError, setSelectedHistoryError] = useState("");

   // 완료 화면에서 "뽑기 기록 보기"를 눌렀을 때 오른쪽 기록 영역으로 이동하기 위한 ref다.
   const historyPanelRef = useRef(null);

   function handleScrollToDrawHistory() {
     historyPanelRef.current?.scrollIntoView({
       behavior: "smooth",
       block: "start",
     });
   }

   /*
    * 추억 쪽지 뽑기 버튼 클릭 함수
    *
    * 역할:
    * - 사용자가 버튼을 누르면 바로 결과를 보여주지 않는다.
    * - 먼저 쪽지 아이콘이 흔들리고, 작은 쪽지들이 날아다니는 애니메이션을 보여준다.
    * - 최소 1.6초 동안 연출을 보여준 뒤 결과 화면으로 전환한다.
    */
   async function handleMemoryDrawClick() {
     // 이미 뽑는 중이면 중복 클릭을 막는다.
     if (drawing || drawAnimationPlaying) {
       return;
     }

     setDrawAnimationPlaying(true);

     try {
       // API 요청과 애니메이션 시간을 같이 기다린다.
       // API가 빨리 끝나도 최소 1.6초는 연출이 보인다.
       await Promise.all([
         Promise.resolve(onDraw?.()),
         new Promise((resolve) => window.setTimeout(resolve, 1600)),
       ]);
     } finally {
       // 결과 카드가 너무 갑자기 보이지 않도록 아주 살짝 늦게 닫는다.
       window.setTimeout(() => {
         setDrawAnimationPlaying(false);
       }, 180);
     }
   }

   /*
    * 뽑기 기록 클릭 함수
    *
    * 역할:
    * - 뽑기 기록을 눌러도 상세 화면으로 바로 넘어가지 않는다.
    * - 대신 선택한 기록의 쪽지 상세 정보를 다시 불러와서 왼쪽 카드에 보여준다.
    *
    * 왜 상세 조회를 다시 하냐면?
    * - history item은 목록용 요약 데이터라서 attachments가 없을 수 있다.
    * - 사진은 note 상세 데이터에 들어있는 attachments를 써야 안정적으로 보인다.
    */
   async function handleSelectHistoryItem(item) {
     if (!item?.noteId) return;

     // 우선 어떤 기록을 선택했는지 저장한다.
     setSelectedHistoryItem(item);
     setSelectedHistoryNote(null);
     setSelectedHistoryError("");

     // 오늘 뽑힌 쪽지는 이미 today.dailyDraw.note 안에 상세 정보가 있다.
     // 그래서 같은 쪽지를 다시 누른 경우에는 API를 또 부르지 않고 기존 상세 데이터를 사용한다.
     const todayNote = today?.dailyDraw?.note;

     if (todayNote && Number(todayNote.noteId) === Number(item.noteId)) {
       setSelectedHistoryNote(todayNote);
       return;
     }

     const currentJarId = jar?.jarId ?? jar?.id;

     if (!currentJarId) {
       setSelectedHistoryNote({
         noteId: item.noteId,
         title: item.title,
         authorId: item.authorId,
         authorName: item.authorName,
         noteDate: item.noteDate,
         location: item.location,
         content: item.content,
         attachments: Array.isArray(item.attachments) ? item.attachments : [],
       });
       return;
     }

     setSelectedHistoryLoading(true);

     try {
       const res = await apiClient.get(
         `/api/v1/jars/${currentJarId}/notes/${item.noteId}`
       );

       setSelectedHistoryNote(res.data?.data || null);
     } catch (e) {
       // 상세 조회가 실패해도 화면이 깨지지 않게 요약 정보라도 보여준다.
       setSelectedHistoryNote({
         noteId: item.noteId,
         title: item.title,
         authorId: item.authorId,
         authorName: item.authorName,
         noteDate: item.noteDate,
         location: item.location,
         content: item.content,
         attachments: Array.isArray(item.attachments) ? item.attachments : [],
       });

       setSelectedHistoryError(
         "선택한 기록의 상세 정보를 불러오지 못해서 요약 정보만 보여줘요."
       );
     } finally {
       setSelectedHistoryLoading(false);
     }
   }

   // Hook 선언이 끝난 뒤에 open 체크를 해야 한다.
   if (!open) return null;

   // 오늘 뽑기 결과를 안전하게 꺼낸다.
   // today는 부모 컴포넌트가 넘겨준 dailyDrawToday 값이다.
   const dailyDraw = today?.dailyDraw ?? null;

   // 오늘 뽑힌 쪽지 상세 정보
   const todayNote = dailyDraw?.note ?? null;

   // 왼쪽 카드가 어떤 뽑기 날짜를 보여줄지 정한다.
   // 기록을 선택했으면 선택한 기록, 아니면 오늘 뽑기 결과를 보여준다.
   const selectedDrawItem = selectedHistoryItem ?? dailyDraw;

   // 왼쪽 카드에 실제로 보여줄 쪽지 정보다.
   // 기록을 선택했으면 상세 조회로 가져온 selectedHistoryNote를 우선 사용한다.
   // 아무 기록도 선택하지 않았으면 오늘 뽑힌 쪽지 todayNote를 사용한다.
   const note = selectedHistoryItem
     ? selectedHistoryNote ?? {
         noteId: selectedHistoryItem.noteId,
         title: selectedHistoryItem.title,
         authorId: selectedHistoryItem.authorId,
         authorName: selectedHistoryItem.authorName,
         noteDate: selectedHistoryItem.noteDate,
         location: selectedHistoryItem.location,
         content: selectedHistoryItem.content,
         attachments: Array.isArray(selectedHistoryItem.attachments)
           ? selectedHistoryItem.attachments
           : [],
       }
     : todayNote;

   // 오늘 카드에 이미지가 있으면 대표 이미지로 사용한다.
   const coverImage = Array.isArray(note?.attachments)
     ? note.attachments.find((attachment) =>
         attachment?.contentType?.startsWith("image/")
       )
     : null;

   /*
    * 오늘의 추억 한 장 상태 계산
    *
    * 이 코드는 MemoryDrawModal 안에서만 사용한다.
    * 그래서 컴포넌트 밖이 아니라 여기 안에 있어야 한다.
    */
   const totalDrawableCount = Number(today?.totalDrawableCount ?? 0);
   const remainingCount = Number(today?.remainingCount ?? 0);
   const drawnCount = Number(today?.drawnCount ?? 0);

   const hasTodayDraw = Boolean(today?.hasTodayDraw && todayNote);
   const hasRemainingNotes =
     Boolean(today?.hasRemainingNotes) || remainingCount > 0;

   const canReceiveTodayMemory =
     jar?.isOpen &&
     !selectedHistoryItem &&
     !hasTodayDraw &&
     hasRemainingNotes;

   const hasNoDrawableNotes =
     jar?.isOpen &&
     !selectedHistoryItem &&
     !hasTodayDraw &&
     totalDrawableCount <= 0;

   const isAllMemoriesReceived =
     jar?.isOpen &&
     !selectedHistoryItem &&
     !hasTodayDraw &&
     totalDrawableCount > 0 &&
     !hasRemainingNotes &&
     drawnCount > 0;

   return createPortal(
     <div
       className="fixed inset-0 z-[9993] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/70 px-4 py-4 backdrop-blur-sm sm:py-6"
       onMouseDown={onClose}
     >
       <style>
         {`
           @keyframes memoryDrawModalPop {
             0% {
               opacity: 0;
               transform: translateY(20px) scale(0.9);
             }
             100% {
               opacity: 1;
               transform: translateY(0) scale(1);
             }
           }

           @keyframes memoryDrawGiftBounce {
             0%, 100% {
               transform: translateY(0) rotate(0deg);
             }
             35% {
               transform: translateY(-8px) rotate(-4deg);
             }
             70% {
               transform: translateY(4px) rotate(4deg);
             }
           }

           /* 버튼을 눌렀을 때 쪽지 아이콘이 통통 흔들리는 효과 */
           @keyframes memoryDrawNotePick {
             0% {
               transform: translateY(0) rotate(-5deg) scale(1);
             }
             25% {
               transform: translateY(-10px) rotate(7deg) scale(1.08);
             }
             50% {
               transform: translateY(3px) rotate(-6deg) scale(1.02);
             }
             75% {
               transform: translateY(-7px) rotate(5deg) scale(1.08);
             }
             100% {
               transform: translateY(0) rotate(0deg) scale(1);
             }
           }

           /* 작은 쪽지들이 가운데에서 바깥으로 날아가는 효과 */
           @keyframes memoryDrawMiniNoteBurst {
             0% {
               opacity: 0;
               transform: translate(0, 0) rotate(0deg) scale(0.45);
             }
             35% {
               opacity: 1;
             }
             100% {
               opacity: 1;
               transform:
                 translate(var(--note-x), var(--note-y))
                 rotate(var(--note-rotate))
                 scale(1);
             }
           }

           /* 가운데 빛이 확 퍼지는 효과 */
           @keyframes memoryDrawGlowPulse {
             0% {
               opacity: 0;
               transform: scale(0.65);
             }
             45% {
               opacity: 1;
               transform: scale(1.12);
             }
             100% {
               opacity: 0.72;
               transform: scale(1);
             }
           }

           /* 아래 안내 문구가 살짝 올라오는 효과 */
           @keyframes memoryDrawTextUp {
             0% {
               opacity: 0;
               transform: translateY(14px);
             }
             100% {
               opacity: 1;
               transform: translateY(0);
             }
           }

           .memory-draw-pop {
             animation: memoryDrawModalPop 260ms cubic-bezier(0.22, 1, 0.36, 1);
           }

           .memory-draw-gift {
             animation: memoryDrawGiftBounce 1.8s ease-in-out infinite;
           }

           .memory-draw-note-pick {
             animation: memoryDrawNotePick 950ms ease-in-out infinite;
             transform-origin: center;
           }

           .memory-draw-mini-note {
             animation: memoryDrawMiniNoteBurst 900ms cubic-bezier(0.16, 1, 0.3, 1) both;
           }

           .memory-draw-glow {
             animation: memoryDrawGlowPulse 1100ms ease-out both;
           }

           .memory-draw-text-up {
             animation: memoryDrawTextUp 520ms 260ms ease-out both;
           }
         `}
       </style>

       <div
         className="memory-draw-pop relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[36px] border border-white/70 bg-white/95 shadow-[0_35px_100px_rgba(0,0,0,0.35)] sm:max-h-[calc(100dvh-3rem)]"
         onMouseDown={(e) => e.stopPropagation()}
       >
         {/* 상단 영역 */}
         <div className="shrink-0 border-b border-slate-100/80 bg-white/95 px-6 pb-4 pt-6">
         {/* 추억 쪽지 뽑기 버튼을 눌렀을 때만 보이는 애니메이션 오버레이 */}
         {drawAnimationPlaying && (
           <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/88 px-6 backdrop-blur-sm">
             <div className="relative flex h-[360px] w-full max-w-xl items-center justify-center text-center">
               {/* 가운데에서 퍼지는 빛 */}
               <div className={`memory-draw-glow absolute h-72 w-72 rounded-full blur-3xl ${palette.floating}`} />
               <div className="memory-draw-glow absolute h-48 w-48 rounded-full bg-amber-200/35 blur-2xl" />

               {/* 작은 쪽지들이 뽑히는 듯 날아가는 효과 */}
               {[
                 { x: "-150px", y: "-95px", r: "-18deg", text: "추억" },
                 { x: "145px", y: "-90px", r: "16deg", text: "쪽지" },
                 { x: "-135px", y: "80px", r: "14deg", text: "마음" },
                 { x: "135px", y: "78px", r: "-12deg", text: "기억" },
                 { x: "-35px", y: "-145px", r: "8deg", text: "우리" },
               ].map((item, index) => (
                 <div
                   key={`${item.text}-${index}`}
                   className="memory-draw-mini-note absolute left-1/2 top-1/2 z-20 flex h-[58px] w-[72px] items-center justify-center rounded-[16px] border-2 border-sky-300 bg-white/95 text-[11px] font-black text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.18)]"
                   style={{
                     "--note-x": item.x,
                     "--note-y": item.y,
                     "--note-rotate": item.r,
                     animationDelay: `${index * 90}ms`,
                   }}
                 >
                   {item.text}

                   {/* 쪽지 모서리 접힌 느낌 */}
                   <span className="absolute right-0 top-0 h-4 w-4 rounded-bl-[10px] border-b-2 border-l-2 border-sky-300 bg-sky-50" />
                 </div>
               ))}

               {/* 가운데 메인 쪽지 아이콘 */}
               <div className="relative z-30 flex flex-col items-center">
                 <MemoryDrawNoteIcon className="memory-draw-note-pick !mb-2 scale-125" />

                 <p className="memory-draw-text-up mt-5 text-2xl font-black text-slate-800">
                   추억 쪽지를 고르는 중...
                 </p>

                 <p className="memory-draw-text-up mt-3 text-sm font-semibold leading-7 text-slate-500">
                   저금통 안에서 오늘 보여줄 쪽지 한 장을 찾고 있어요.
                 </p>
               </div>

             </div>
           </div>
         )}
           <div className="flex items-start justify-between gap-3">
             <div>
               <p className="text-sm font-black uppercase tracking-[0.24em] text-slate-400">
                 MEMORY DRAW
               </p>

               <h2 className="mt-2 text-2xl font-black text-slate-800">
                 오늘의 추억 한 장
               </h2>

               <p className="mt-2 text-sm leading-7 text-slate-500">
                 저금통에 담겨 있던 추억 중 아직 열어보지 않은 한 장을 오늘의 추억으로 받아볼 수 있어요.
               </p>
             </div>

             <button
               type="button"
               onClick={onClose}
               className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
             >
               닫기
             </button>
           </div>
         </div>

         {/* 내용 영역 */}
         <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
           {/* 실시간 안내 */}
           {jar?.isOpen && realtimeMessage && (
             <div className={`mb-5 rounded-2xl border px-4 py-3 text-sm font-bold ${palette.hintBox}`}>
               ✨ {realtimeMessage}
             </div>
           )}

           {/* 저금통이 아직 열리지 않았을 때 */}
           {!jar?.isOpen && (
             <div className={`rounded-[30px] border border-dashed px-6 py-10 text-center ${palette.emptyBox}`}>
               <div className="mb-4 text-5xl">🔒</div>

               <h3 className="text-xl font-black">
                 저금통이 열린 뒤 이용할 수 있어요
               </h3>

               <p className="mx-auto mt-3 max-w-md text-sm leading-7">
                 아직 저금통이 열리지 않았어요.
                 오픈 시간이 지나면 오늘의 추억 한 장을 받을 수 있어요.
               </p>
             </div>
           )}

           {/* 로딩 중 */}
           {jar?.isOpen && loading && (
             <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
               <div className={`animate-pulse rounded-[30px] border p-5 ${palette.softCard}`}>
                 <div className="mb-4 h-5 w-40 rounded-full bg-slate-200" />
                 <div className="h-56 rounded-[24px] bg-slate-100" />
               </div>

               <div className={`animate-pulse rounded-[30px] border p-5 ${palette.softCard}`}>
                 <div className="mb-4 h-5 w-32 rounded-full bg-slate-200" />
                 <div className="space-y-3">
                   <div className="h-14 rounded-2xl bg-slate-100" />
                   <div className="h-14 rounded-2xl bg-slate-100" />
                   <div className="h-14 rounded-2xl bg-slate-100" />
                 </div>
               </div>
             </div>
           )}

           {/* 에러 */}
           {jar?.isOpen && !loading && error && (
             <div className={`rounded-[30px] border border-dashed px-6 py-8 text-center text-sm ${palette.emptyBox}`}>
               <p>{error}</p>

               <button
                 type="button"
                 onClick={onReload}
                 className={`mt-4 rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineBtn}`}
               >
                 다시 불러오기
               </button>
             </div>
           )}

           {/* 열린 저금통 + 오늘 아직 받은 추억이 없고 + 남은 쪽지가 있을 때 */}
           {jar?.isOpen && !loading && !error && canReceiveTodayMemory && (
             <div className={`relative overflow-hidden rounded-[30px] border p-8 text-center ${palette.panel}`}>
               <MemoryDrawNoteIcon palette={palette} />

               <h3 className="text-2xl font-black text-slate-800">
                 아직 오늘 받은 추억이 없어요
               </h3>

               <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-500">
                 버튼을 누르면 저금통에 담겨 있던 추억 중
                 아직 열어보지 않은 한 장을 오늘의 추억으로 받아볼 수 있어요.
               </p>

               <div className="mt-4 flex flex-wrap justify-center gap-2">
                 <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                   남은 추억 {remainingCount}개
                 </span>

                 <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                   받은 추억 {drawnCount}개
                 </span>
               </div>

               <button
                 type="button"
                 onClick={handleMemoryDrawClick}
                 disabled={drawing || drawAnimationPlaying}
                 className={`mt-6 rounded-2xl px-6 py-3 text-sm font-black shadow-lg transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-60 ${palette.primaryButton}`}
               >
                 {drawing || drawAnimationPlaying ? "오늘의 추억 고르는 중..." : "오늘의 추억 받기"}
               </button>
             </div>
           )}

           {/* 열린 저금통 + 애초에 담긴 쪽지가 하나도 없을 때 */}
           {jar?.isOpen && !loading && !error && hasNoDrawableNotes && (
             <div className={`rounded-[30px] border border-dashed px-6 py-10 text-center ${palette.emptyBox}`}>
               <div className="mb-4 text-5xl">💌</div>

               <h3 className="text-xl font-black">
                 담긴 추억 쪽지가 없어요
               </h3>

               <p className="mx-auto mt-3 max-w-md text-sm leading-7">
                 이 저금통에는 오픈 전에 담긴 쪽지가 없어서
                 오늘의 추억을 받을 수 없어요.
               </p>

               <button
                 type="button"
                 onClick={onClose}
                 className={`mt-6 rounded-2xl border px-5 py-3 text-sm font-black transition ${palette.outlineButton}`}
               >
                 전체 화면으로 돌아가기
               </button>
             </div>
           )}

           {/* 열린 저금통 + 더 이상 받을 쪽지가 없을 때 */}
           {jar?.isOpen && !loading && !error && isAllMemoriesReceived && (
             <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
               <article className={`rounded-[30px] border p-8 text-center ${palette.panel}`}>
                 <div className="mb-4 text-5xl">🎉</div>

                 <h3 className="text-2xl font-black text-slate-800">
                   모든 추억을 다 열어봤어요
                 </h3>

                 <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-500">
                   저금통에 담겨 있던 추억 쪽지를 모두 꺼내봤어요.
                   이제는 뽑기 기록에서 지난 추억을 다시 보거나
                   댓글과 채팅으로 이야기를 이어갈 수 있어요.
                 </p>

                 <div className="mt-4 flex flex-wrap justify-center gap-2">
                   <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                     전체 추억 {totalDrawableCount}개
                   </span>

                   <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                     받은 추억 {drawnCount}개
                   </span>
                 </div>

                 <div className="mt-6 flex flex-wrap justify-center gap-2">


                   <button
                     type="button"
                     onClick={onOpenAllNotes}
                     className={`rounded-2xl px-4 py-2 text-sm font-bold shadow-sm transition hover:scale-[1.01] ${palette.primaryButton}`}
                   >
                     전체 추억 보러가기
                   </button>

                   <button
                     type="button"
                     onClick={onOpenChat}
                     className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                   >
                     채팅하러가기
                   </button>
                 </div>
               </article>

               <aside
                 ref={historyPanelRef}
                 className={`rounded-[30px] border p-5 ${palette.panel}`}
               >
                 <div className="mb-4 flex items-center justify-between">
                   <div>
                     <p className="text-sm font-black text-slate-800">
                       뽑기 기록
                     </p>
                     <p className="mt-1 text-xs text-slate-500">
                       지금까지 받은 오늘의 추억들이에요.
                     </p>
                   </div>

                   <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                     {history.length}개
                   </span>
                 </div>

                 {history.length === 0 && (
                   <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
                     아직 뽑기 기록이 없어요.
                   </div>
                 )}

                 {history.length > 0 && (
                   <div className="space-y-3">
                     {history.slice(0, 5).map((item) => (
                       <button
                         key={item.drawId}
                         type="button"
                         onClick={() => handleSelectHistoryItem(item)}
                         className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${palette.softCard}`}
                       >
                         <div className="mb-2 flex flex-wrap items-center gap-2">
                           <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.activeChip}`}>
                             {item.drawDate}
                           </span>

                           {item.noteDate && (
                             <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}>
                               {formatNoteDateOnly(item.noteDate)}
                             </span>
                           )}
                         </div>

                         <p className="text-sm font-black text-slate-800">
                           {item.title || "제목 없는 추억"}
                         </p>

                         <p className="mt-1 text-xs text-slate-500">
                           {item.authorName || `사용자 ${item.authorId}`}
                           {item.location ? ` · ${item.location}` : ""}
                         </p>
                       </button>
                     ))}
                   </div>
                 )}
               </aside>
             </div>
           )}

           {/* 열린 저금통 + 오늘 뽑은 쪽지가 있을 때 */}
           {jar?.isOpen && !loading && !error && note && (
             <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
               {/* 결과 카드 */}
               <article className={`overflow-hidden rounded-[30px] border ${palette.panel}`}>
                 {coverImage ? (
                   <img
                     src={coverImage.thumbnailUrl || coverImage.url}
                     alt={note.title || "뽑힌 추억 이미지"}
                     className="h-64 w-full object-cover"
                   />
                 ) : (
                   <div className={`flex h-64 items-center justify-center ${palette.infoBox}`}>
                     <div className="text-center">
                       <p className="text-sm font-bold text-slate-500">
                         이미지 없이 공개된 추억이에요
                       </p>
                     </div>
                   </div>
                 )}

                 <div className="p-5">
                   <div className="mb-3 flex flex-wrap items-center gap-2">
                     {selectedDrawItem?.drawDate && (
                       <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                         {dailyDraw?.drawDate}
                       </span>
                     )}

                     {note.noteDate && (
                       <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.activeChip}`}>
                         추억 날짜 {formatNoteDateOnly(note.noteDate)}
                       </span>
                     )}

                     {note.location && (
                       <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                         {note.location}
                       </span>
                     )}
                   </div>

                   <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-orange-400">
                     오늘 받은 추억
                   </p>

                   <h3 className="text-2xl font-black text-slate-800">
                     {note.title || "제목 없는 추억"}
                   </h3>

                   <p className="mt-3 line-clamp-4 text-sm leading-7 text-slate-600">
                     {note.content || "내용이 없는 추억이에요."}
                   </p>

                   <p className="mt-3 text-xs font-bold text-slate-400">
                     작성자: {note.authorName || `사용자 ${note.authorId}`}
                   </p>

                   <div className="mt-5 flex flex-wrap gap-2">
                     <button
                       type="button"
                       onClick={() => onOpenNoteDetail?.(note.noteId)}
                       className={`rounded-2xl px-4 py-2 text-sm font-bold shadow-sm transition hover:scale-[1.01] ${palette.primaryButton}`}
                     >
                       자세히 보기
                     </button>

                     <button
                       type="button"
                       onClick={onReload}
                       className={`rounded-2xl border px-4 py-2 text-sm font-bold transition ${palette.outlineButton}`}
                     >
                       새로고침
                     </button>
                   </div>
                 </div>
               </article>

               {/* 공개 기록 */}
               <aside
                 ref={historyPanelRef}
                 className={`rounded-[30px] border p-5 ${palette.panel}`}
               >
                 <div className="mb-4 flex items-center justify-between">
                   <div>
                     <p className="text-sm font-black text-slate-800">
                       뽑기 기록
                     </p>
                     <p className="mt-1 text-xs text-slate-500">
                       지금까지 받은 오늘의 추억들이에요.
                     </p>
                   </div>

                   <span className={`rounded-full px-3 py-1 text-xs font-bold ${palette.countChip}`}>
                     {history.length}개
                   </span>
                 </div>

                 {history.length === 0 && (
                   <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${palette.emptyBox}`}>
                     아직 뽑기 기록이 없어요.
                   </div>
                 )}

                 {history.length > 0 && (
                   <div className="space-y-3">
                     {history.slice(0, 5).map((item) => (
                       <button
                         key={item.drawId}
                         type="button"
                         onClick={() => handleSelectHistoryItem(item)}
                         className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${palette.softCard}`}
                       >
                         <div className="mb-2 flex flex-wrap items-center gap-2">
                           <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.activeChip}`}>
                             {item.drawDate}
                           </span>

                           {item.noteDate && (
                             <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${palette.countChip}`}>
                               {formatNoteDateOnly(item.noteDate)}
                             </span>
                           )}
                         </div>

                         <p className="text-sm font-black text-slate-800">
                           {item.title || "제목 없는 추억"}
                         </p>

                         <p className="mt-1 text-xs text-slate-500">
                           {item.authorName || `사용자 ${item.authorId}`}
                           {item.location ? ` · ${item.location}` : ""}
                         </p>
                       </button>
                     ))}
                   </div>
                 )}
               </aside>
             </div>
           )}
         </div>
       </div>
     </div>,
     document.body
   );
 }