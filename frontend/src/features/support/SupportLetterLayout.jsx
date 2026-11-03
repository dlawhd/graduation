import { Link } from "react-router-dom";
import "./supportLetter.css";

/** 도움말·문의 영역의 배경과 제목을 공통으로 표시한다. 접수와 권한 처리는 각 화면에 남겨둔다. */
export default function SupportLetterLayout({backTo,backLabel,title="어떤 어려움이 있었나요?",description="남겨주신 내용을 차근차근 확인할게요.",illustration=true,children}) {
  return <main className="support-letter-page"><div className="support-letter-inner">
    <Link to={backTo} className="support-letter-back">← {backLabel}</Link>
    <header className="support-letter-heading"><div><h1>{title}</h1><p>{description}</p></div>
      {/* 장식은 접근성 읽기에서 제외하고, 작은 화면에서는 입력 공간을 위해 숨긴다. */}
      {illustration&&<svg className="support-letter-art" viewBox="0 0 240 164" fill="none" aria-hidden="true">
        <ellipse cx="132" cy="148" rx="96" ry="9" fill="#e4e5d2"/>
        <g stroke="#84936b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M124 35v14c-15 7-21 17-21 32v51c0 10 13 13 40 13s40-3 40-13V81c0-15-6-25-21-32V35" fill="#f3f4e6"/>
          <ellipse cx="143" cy="35" rx="26" ry="6" fill="#faf9ef"/>
          <path d="M117 29v10m52-10v10"/>
          <ellipse cx="143" cy="28" rx="26" ry="6" fill="#faf9ef"/>
          <path d="M113 82v35" stroke="#fffefa" strokeWidth="5"/>
          <path d="m29 107 68-21 30 43-70 21z" fill="#fffdf5"/>
          <path d="m29 107 51 15 17-36m-40 64 12-31m58 10-39-10"/>
          <path d="M190 141c11-19 15-39 16-62m-10 47-10-19m17-5 13-14"/>
          <path d="M186 111c-14-5-17-14-15-25 13 3 18 12 15 25zm20-26c-9-9-9-20-2-28 8 9 9 18 2 28zm3 28c2-12 10-18 21-17-2 12-10 18-21 17z" fill="#dce2cb" stroke="none"/>
        </g>
      </svg>}
    </header>
    <div className="support-letter-content">{children}</div>
  </div></main>;
}

/** 주의·답변 확인 안내에 쓰는 작은 선 아이콘이다. 의미는 옆의 글로 전달한다. */
export function SupportLetterIcon({name}) {
  const paths={
    shield:"M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3m-4 9 3 3 5-6",
    info:"M12 11v6m0-10v.2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    attachment:"m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2m-7 13 9-9",
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.info}/></svg>;
}
