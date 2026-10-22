import { useId, useState } from "react";
import "../jarCreation.css";

const STEPS = ["틀 만들기 또는 선택", "그림 담기", "사진 배치와 AI 꾸미기", "투입구와 배경", "이름 붙이기"];

/** 색뿐 아니라 체크·현재 표시·테두리로 완료/현재/예정 단계를 구분하는 제작 안내다. */
export default function DesignProgress({ activeStep = 1 }) {
  const [expanded, setExpanded] = useState(false);
  const stepsId = useId();
  return <nav className="design-progress" aria-label="디자인 제작 순서">
    <div className="design-progress-heading"><span>저금통 완성까지</span><span>{activeStep}/5 · {STEPS[activeStep - 1]}</span></div>
    <button type="button" className="design-progress-toggle" aria-expanded={expanded} aria-controls={stepsId} onClick={() => setExpanded(!expanded)}>{expanded ? "전체 단계 접기" : "전체 단계 보기"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <ol id={stepsId} className={expanded ? "is-expanded" : ""}>{STEPS.map((label, index) => {
      const step = index + 1;
      const status = step < activeStep ? "complete" : step === activeStep ? "current" : "upcoming";
      return <li key={label} data-status={status} aria-current={status === "current" ? "step" : undefined}>
        <span className="design-progress-number" aria-hidden="true">{status === "complete" ? "✓" : step}</span>
        <span className="design-progress-label">{label}<span className="design-progress-state">{status === "complete" ? "완료" : status === "current" ? "현재 단계" : "예정"}</span></span>
      </li>;
    })}</ol>
  </nav>;
}
