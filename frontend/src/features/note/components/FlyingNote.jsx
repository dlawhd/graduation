import { createPortal } from "react-dom";
import MemoryDrawNoteIcon from "../../../components/icons/MemoryDrawNoteIcon";
import { NOTE_FLIGHT_DURATION, NOTE_FLIGHT_HEIGHT, NOTE_FLIGHT_WIDTH } from "../../jarDetail/utils/noteFlightGeometry.mjs";

/** 접힌 쪽지를 화면 전체 좌표로 날린다. 페이지의 transform·잘림 영역과 이동 기준이 섞이지 않게 body에 표시한다. */
export default function FlyingNote({ flight, onAnimationEnd }) {
  if (!flight) return null;

  return createPortal(<>
    <style>{`
      @keyframes noteFlightToJar {
        0% { opacity: 1; transform: translate(0, 0) scale(1) rotate(-8deg); }
        35% { opacity: 1; transform: translate(calc(var(--note-dx) * 0.34), calc(var(--note-dy) * 0.22 - 26px)) scale(0.92) rotate(6deg); }
        75% { opacity: 1; transform: translate(calc(var(--note-dx) * 0.82), calc(var(--note-dy) * 0.86)) scale(0.46) rotate(12deg); }
        /* 입구에 먼저 도착한 뒤 사라져, 중간 지점에서 쪽지가 사라지는 것처럼 보이지 않게 한다. */
        90% { opacity: 1; transform: translate(var(--note-dx), var(--note-dy)) scale(var(--note-end-scale)) rotate(18deg); }
        100% { opacity: 0; transform: translate(var(--note-dx), var(--note-dy)) scale(var(--note-end-scale)) rotate(18deg); }
      }
      .note-flight-paper {
        position: fixed;
        width: ${NOTE_FLIGHT_WIDTH}px;
        height: ${NOTE_FLIGHT_HEIGHT}px;
        transform-origin: center;
        pointer-events: none;
        z-index: 140;
        animation: noteFlightToJar ${NOTE_FLIGHT_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        filter: drop-shadow(0 18px 28px rgba(15, 23, 42, 0.2));
      }
    `}</style>
    <div key={flight.id} className="note-flight-paper" aria-hidden="true" onAnimationEnd={onAnimationEnd}
      style={{ left: `${flight.startX}px`, top: `${flight.startY}px`, "--note-dx": `${flight.deltaX}px`,
        "--note-dy": `${flight.deltaY}px`, "--note-end-scale": flight.endScale }}>
      {/* SVG를 감싼 div에도 크기를 주어 아이콘 중심과 이동 상자의 중심을 일치시킨다. */}
      {/* 저금통으로 날아가는 쪽지도 같은 SVG를 사용한다.
          작은 크기와 장식 없는 버전으로 써서 움직일 때 깔끔하게 보이게 한다. */}
      <MemoryDrawNoteIcon className="h-full w-full" sizeClass="h-full w-full" withShadow={false}
        withDecorations={false} centered={false} />
    </div>
  </>, document.body);
}
