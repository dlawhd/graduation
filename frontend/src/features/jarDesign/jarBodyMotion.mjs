import { ANIMAL_BODY_CATALOG } from "./animalBodyCatalog.mjs";
/** 형태·사진·입구 좌표를 움직이지 않고 작은 장식만 살아나게 하는 오브제의 연출 계약이다. */
const profiles = {
  CLASSIC: ["botanical", "허브 잎의 느린 흔들림"], BELLO: ["glaze", "도자기에 머무는 반사광"],
  APOTHECARY: ["botanical", "허브 잎의 작은 숨결"], MILK: ["botanical", "꽃과 잎의 부드러운 흔들림"],
  FACET: ["jewel", "프리즘 가장자리의 빛"], PERFUME: ["jewel", "향수 주변의 작은 반짝임"],
  DOME: ["snow", "유리 돔 주변의 느린 눈송이"], HEART: ["heart", "작은 하트 참의 두근거림"],
  STAR: ["jewel", "별빛의 여운"], MOON: ["jewel", "달 곁의 별빛"], CLOUD: ["rain", "빗방울 참의 흔들림"],
  SHELL: ["glaze", "조개 유약의 오팔빛"], PEARL: ["jewel", "진주의 작은 반사광"], CRYSTAL: ["jewel", "수정 끝의 반짝임"],
  PLANET: ["orbit", "작은 위성의 느린 움직임"], ROCKET: ["flame", "로켓 불꽃의 잔잔한 맥동"],
  HOUSE: ["chimney", "굴뚝 위 따뜻한 연기"], CASTLE: ["flag", "첨탑 깃발의 흔들림"],
  TEAPOT: ["steam", "주전자 위 차의 김"], LANTERN: ["lantern", "등불의 따뜻한 빛"],
  PIG: ["blink", "행운의 돼지 눈 깜빡임"], CAT: ["blink", "밤하늘 고양이 눈 깜빡임"],
  BEAR: ["blink", "느긋한 곰 눈 깜빡임"], RABBIT: ["blink", "달빛 토끼 눈 깜빡임"],
  PANDA: ["blink", "대나무 판다 눈 깜빡임"], PENGUIN: ["blink", "겨울 펭귄 눈 깜빡임"],
  WHALE: ["bubble", "고래 눈 깜빡임과 작은 물방울"], MUSHROOM: ["botanical", "이끼 정원의 잎 흔들림"],
  ACORN: ["leaf", "도토리 위 가을 잎"], FLOWER: ["bloom", "피오니 꽃잎의 작은 숨결"],
  ...Object.fromEntries(ANIMAL_BODY_CATALOG.map(({id,name}) => [id,["blink",`${name}의 눈 깜빡임과 작은 장식 움직임`]])),
};
export const JAR_BODY_MOTIONS = Object.freeze(Object.fromEntries(Object.entries(profiles).map(([id, [kind, label]], index) =>
  [id, Object.freeze({ kind, label, delay: -(index * .47), duration: 7.8 + index % 5 * .65 })])));

// 카드마다 observer/타이머를 만들지 않는다. 모든 인스턴스가 하나의 가시성 감시자를 공유한다.
let observer;
const elements = new Set();
function updateVisibility() {
  for (const node of elements) node.dataset.motionActive = String(!document.hidden && node.dataset.motionVisible === "true");
}
export function observeJarMotion(node) {
  if (!node) return () => {};
  if (!elements.size) document.addEventListener("visibilitychange", updateVisibility);
  elements.add(node);
  if (typeof IntersectionObserver !== "undefined") {
    observer ||= new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        target.dataset.motionVisible = String(isIntersecting);
        target.dataset.motionActive = String(isIntersecting && !document.hidden);
      }
    });
    observer.observe(node);
  } else {
    node.dataset.motionVisible = "true";
    updateVisibility();
  }
  return () => {
    observer?.unobserve(node); elements.delete(node);
    if (!elements.size) { observer?.disconnect(); observer = undefined; document.removeEventListener("visibilitychange", updateVisibility); }
  };
}
