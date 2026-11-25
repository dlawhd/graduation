import { useState } from "react";
import { Link } from "react-router-dom";
import DesignDraftShelf from "./DesignDraftShelf";
import JarDesignImage from "./JarDesignImage";
import DefaultJarArtwork, { SPRING_PREVIEW_PRESET, SpringJarAccents } from "./DefaultJarArtwork";
import "../jarCreation.css";

const OPTIONS = [
  {
    id: "custom",
    to: "/jars/design/new",
    title: "직접 만들기",
    summary: "모양부터 내 손으로 그려요.",
    description: "저금통의 테두리를 직접 그려요. 처음부터 그리기 어렵다면 둥근 틀이나 병 모양으로 시작해도 좋아요.",
    choice: "저금통의 모양과 색. 사진이나 그림은 선택이에요.",
    next: "그림판에서 모양을 만든 뒤 사진을 담을지 정해요.",
    action: "모양 그리러 가기",
  },
  {
    id: "catalog",
    to: "/jars/design/new?catalog=1",
    title: "준비된 모양 고르기",
    summary: "준비된 저금통에 내 이미지를 담아요.",
    description: "코기나 개구리처럼 이미 만들어진 저금통을 고르고, 저금통 가운데 창에 내 사진이나 그림을 담아요.",
    choice: "준비된 저금통 모양. 사진이나 그림은 선택이에요.",
    next: "사진을 함께 담을지 먼저 정한 뒤 마음에 드는 모양을 골라요.",
    action: "저금통 모양 보러 가기",
  },
  {
    id: "image",
    to: "/jars/design/new?mode=image-only&step=image",
    title: "이미지만 사용하기",
    summary: "틀 없이 사진이나 그림을 써요.",
    description: "사진이나 그림 자체가 저금통의 모습이 돼요. 저금통 모양을 고르는 단계는 건너뛰어요.",
    choice: "저금통으로 쓸 사진이나 그림 한 장",
    next: "바로 사진을 올리거나 그림을 그리고, 필요하면 이미지를 다듬어요.",
    action: "사진이나 그림 담으러 가기",
  },
  {
    id: "ready",
    to: "/jars/new?mode=default",
    title: "기본 테마 고르기",
    summary: "완성된 테마로 바로 시작해요.",
    description: "봄이나 달빛처럼 꾸며진 기본 테마에서 시작해요. 표지로 쓸 사진이나 그림을 따로 준비하지 않아도 돼요.",
    choice: "기본 테마, 저금통 이름과 열리는 날짜",
    next: "기본 8가지 테마에서 하나를 고르고 이름과 날짜를 정해요.",
    action: "기본 테마 보러 가기",
  },
];

const FLOWER_DRAWING = "/images/ai-styles/cute-2d.webp";
const FLOWER_WATERCOLOR = "/images/ai-styles/watercolor.webp";

/** 목록에는 작은 썸네일을, 선택한 방식에는 실제 저금통 렌더러로 완성 예시를 보여준다. */
function CreationOptionArtwork({ id, compact = false }) {
  switch (id) {
    case "custom":
      return <JarDesignImage bodyStyle="CAT" imageUrl={FLOWER_DRAWING} showDefaultSlot alt="" />;
    case "catalog":
      return (
        <div className="creation-art-catalog">
          {(compact ? ["FROG"] : ["CORGI", "FROG", "AXOLOTL"]).map((bodyStyle) => (
            <JarDesignImage key={bodyStyle} bodyStyle={bodyStyle} showDefaultSlot alt="" />
          ))}
        </div>
      );
    case "image":
      return (
        <div className="creation-art-photo">
          <img src={FLOWER_WATERCOLOR} alt="" width={144} height={144} />
        </div>
      );
    default:
      // 기본 테마는 사진 창이나 커스텀 본체를 제공하는 것처럼 보이지 않도록 기존 테마 아이콘을 쓴다.
      return (
        <div className="creation-theme-artwork">
          <DefaultJarArtwork preset={SPRING_PREVIEW_PRESET}>
            {!compact && <SpringJarAccents />}
          </DefaultJarArtwork>
        </div>
      );
  }
}

/** 새 작업을 열기 전에 네 제작 방식의 결과와 다음 단계를 한곳에서 비교한다. */
export default function CreationChoices({ userId }) {
  const [option, setOption] = useState(OPTIONS[0]);

  return (
    <main className="creation-choice-page">
      <div className="creation-choice-inner">
        <header className="creation-choice-heading">
          <Link to="/jars" className="creation-back">← 내 저금통으로</Link>
          <h1>어떤 저금통을 만들어볼까요?</h1>
          <p>만들기 방식을 선택해 완성 모습과 다음 단계를 살펴보세요.</p>
        </header>

        <DesignDraftShelf key={userId} userId={userId} />

        <div className="creation-choice-grid">
          <div className="creation-choice-options" role="group" aria-label="저금통 만들기 방식">
            {OPTIONS.map((item) => (
              <div key={item.id} className="creation-option-row" data-method={item.id}>
                <button
                  type="button"
                  className="creation-option"
                  aria-pressed={option.id === item.id}
                  aria-controls="creation-preview"
                  onClick={() => setOption(item)}
                >
                  <span className="creation-option-text">
                    <strong>{item.title}</strong>
                    <span>{item.summary}</span>
                  </span>
                  <span className="creation-option-marker" aria-hidden="true" />
                </button>
                <div className="creation-option-thumb" aria-hidden="true">
                  <div className="creation-option-mini"><CreationOptionArtwork id={item.id} compact /></div>
                </div>
              </div>
            ))}
          </div>

          <section id="creation-preview" className="creation-preview" data-method={option.id} aria-labelledby="creation-preview-title">
            <div className="creation-option-art" aria-hidden="true" style={option.id === "ready" ? SPRING_PREVIEW_PRESET.previewCardStyle : undefined}>
              <span className="creation-art-orbit" />
              <span className="creation-art-spark creation-art-spark-a">✦</span>
              <span className="creation-art-spark creation-art-spark-b">✧</span>
              <div className="creation-art-jar"><CreationOptionArtwork id={option.id} /></div>
              <span className="creation-art-note">완성 모습 예시</span>
            </div>
            <div className="creation-option-copy">
              <div aria-live="polite">
                <h2 id="creation-preview-title">{option.title}</h2>
                <p>{option.description}</p>
                <dl className="creation-option-details">
                  <div><dt>내가 고르는 것</dt><dd>{option.choice}</dd></div>
                  <div><dt>다음 화면에서는</dt><dd>{option.next}</dd></div>
                </dl>
              </div>
              <Link to={option.to} className="creation-option-action">
                {option.action}<span aria-hidden="true">→</span>
              </Link>
            </div>
          </section>
        </div>
        <p className="creation-choice-footnote">어느 방식을 골라도 함께 추억을 모으고 정한 날에 열어볼 수 있어요.</p>
      </div>
    </main>
  );
}
