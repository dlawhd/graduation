/** 같은 컬렉션도 사물·재질에 맞는 색으로 구분한다. 저장되는 것은 기존 스타일 ID뿐이다. */
export const SLOT_FINISHES = Object.freeze(Object.fromEntries(Object.entries({
  rose: ["#fff1f5", "#e79bb3", "#99546f", "#fff8e6"],
  peach: ["#fff1df", "#e5ac83", "#976444", "#fff9da"],
  honey: ["#fff6c9", "#dab365", "#8d6b39", "#fffde9"],
  cocoa: ["#f5e6d7", "#b68a6d", "#715046", "#fff5e5"],
  mint: ["#e6fff2", "#88c6af", "#4b8978", "#fff9dc"],
  sage: ["#f1f7dc", "#a8bd84", "#65855c", "#fffbe8"],
  lilac: ["#f3e9ff", "#baa0d8", "#796299", "#fff6d8"],
  sky: ["#e9f5ff", "#92bfdf", "#567caa", "#fffbe5"],
  silver: ["#f7faff", "#b4c1d2", "#627185", "#ffffff"],
  charcoal: ["#d8dfe9", "#687388", "#344250", "#fff0c7"],
  coral: ["#fff0e7", "#e3a08f", "#a36567", "#fff5d1"],
  lagoon: ["#e4fffa", "#71c5c4", "#36828e", "#fff7dc"],
  ocean: ["#e3f4ff", "#78aaca", "#3c659c", "#f3ffff"],
  abyss: ["#bfd8e7", "#365e80", "#173047", "#b8f5eb"],
  pearl: ["#fff9f1", "#ddc7cf", "#9b8099", "#ffffff"],
  violet: ["#ede5ff", "#a28ccd", "#625388", "#f9ecff"],
  nebula: ["#f4dffa", "#bd8cac", "#665483", "#f6e8ab"],
  aurora: ["#d5fff0", "#86b6c3", "#7974b3", "#fcf0ff"],
  cobalt: ["#dfe8ff", "#758fc8", "#3d527f", "#fff3bb"],
  lemon: ["#fff9d6", "#e6cb7d", "#a48c4e", "#fffef2"],
}).map(([name, colors]) => [name, Object.freeze(colors)])));

const themedFinishes = {
  "동물 친구들": ["peach", "rose", "cocoa", "coral", "silver", "lilac", "honey", "ocean", "honey", "lemon", "cocoa", "mint"],
  "바다의 편지": ["ocean", "abyss", "coral", "lilac", "lagoon", "sage", "sky", "peach", "violet", "pearl", "silver", "abyss"],
  "달과 우주": ["cobalt", "honey", "aurora", "coral", "charcoal", "nebula", "lemon", "peach", "silver", "sky", "violet", "aurora"],
  "달콤한 간식": ["cocoa", "rose", "mint", "violet", "honey", "lilac", "pearl", "coral", "rose", "peach", "lemon", "sky"],
  "취미와 일상": ["charcoal", "cocoa", "violet", "silver", "peach", "aurora", "rose", "sky", "coral", "mint", "cobalt", "honey"],
};

export function slotFinish(collection, index, fallback) {
  return SLOT_FINISHES[themedFinishes[collection]?.[index]] || fallback;
}
