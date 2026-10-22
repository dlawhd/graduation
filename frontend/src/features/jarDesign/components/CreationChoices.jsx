import { Link } from "react-router-dom";
import JarDesignImage from "./JarDesignImage";
import SpringIcon from "../../../components/icons/SpringIcon";
import "../jarCreation.css";

const OPTIONS = [
  { id: "custom", to: "/jars/design/new", eyebrow: "01 · YOUR DESIGN", tag: "내 취향대로", title: "직접 만들기", body: "CAT", image: "cute-2d", note: "나만의 모양 + 소중한 사진", description: <>틀부터 그림까지, 내 손으로 특별하게.<br />사진을 담거나 직접 그리고 AI로 분위기도 더해요.</>, features: ["자유로운 모양", "사진 · 그림", "AI는 선택"], action: "디자인 시작하기" },
  { id: "ready", to: "/jars/new?mode=default", eyebrow: "02 · READY TO GO", tag: "간편하게 시작", title: "기본 저금통 이용하기", note: "마음에 드는 테마 하나면 준비 끝", description: <>준비된 8가지 테마 중 마음에 드는 것을 골라요.<br />이름과 열리는 날짜를 정하면 완성이에요.</>, features: ["8가지 테마", "이름과 날짜만", "바로 시작"], action: "테마 고르기" },
];

/** 두 생성 경로를 유지하면서 실제 저금통 렌더러로 제작 방식의 차이를 보여준다. */
export default function CreationChoices() {
  return <main className="creation-choice-page"><div className="creation-choice-inner">
    <header className="creation-choice-heading">
      <Link to="/jars" className="creation-back">← 내 저금통으로</Link>
      <p className="creation-eyebrow">MAKE A MEMORY JAR</p>
      <h1>어떤 저금통을<br className="sm:hidden" /> 만들어볼까요?</h1>
      <p>직접 꾸미는 즐거움도, 고르기만 하는 간편함도.<br className="sm:hidden" /> 시작하는 방법은 달라도 담기는 마음은 같아요.</p>
    </header>
    <div className="creation-choice-grid">{OPTIONS.map((option) => <Link key={option.id} to={option.to} className={`creation-option creation-option-${option.id}`}>
      <div className="creation-option-top"><span>{option.eyebrow}</span><span className="creation-option-tag">{option.tag}</span></div>
      <div className="creation-option-art" aria-hidden="true">
        <span className="creation-art-orbit" /><span className="creation-art-spark creation-art-spark-a">✦</span><span className="creation-art-spark creation-art-spark-b">✧</span>
        <div className="creation-art-jar">{option.id === "custom"
          ? <JarDesignImage bodyStyle={option.body} imageUrl={`/images/ai-styles/${option.image}.webp`} showDefaultSlot alt="" />
          // 기본 테마는 사진 창이나 커스텀 본체를 제공하는 것처럼 보이지 않도록 기존 테마 아이콘을 쓴다.
          : <div className="creation-default-jar"><span className="creation-default-lid" /><span className="creation-default-slot" /><div className="creation-default-body"><SpringIcon size={82} /></div></div>}</div>
        {option.id === "ready" ? <><span className="creation-art-theme creation-art-theme-spring">✿ 봄</span><span className="creation-art-theme creation-art-theme-moon">☾ 달빛</span></> : <span className="creation-art-theme creation-art-theme-spring">사진 + 그림</span>}
        <span className="creation-art-note">{option.note}</span>
      </div>
      <div className="creation-option-copy"><h2>{option.title}</h2><p>{option.description}</p>
        <div className="creation-option-features">{option.features.map((feature) => <span key={feature}>{feature}</span>)}</div>
        <span className="creation-option-action">{option.action}<span aria-hidden="true">↗</span></span>
      </div>
    </Link>)}</div>
    <p className="creation-choice-footnote">어느 쪽을 골라도, 함께 추억을 모으고 정한 날에 열어볼 수 있어요.</p>
  </div></main>;
}
