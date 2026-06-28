/*
 * jarDetailLabels 역할
 *
 * 저금통 상세 화면에서 서버 enum 값을
 * 사용자가 읽기 쉬운 한글 문구로 바꿔주는 사전이야.
 *
 * 쉽게 말하면:
 * - OWNER를 "방장"으로 보여주고
 * - SPRING을 "봄"으로 보여주는 역할을 해.
 */

export const ROLE_LABEL = {
  OWNER: "방장",
  ADMIN: "관리자",
  MEMBER: "멤버",
};

export const THEME_LABEL = {
  SPRING: "봄",
  SUMMER: "여름",
  AUTUMN: "가을",
  WINTER: "겨울",
  LAVENDER: "라벤더",
  DEW: "이슬",
  SAND: "모래",
  MOONLIGHT: "달빛",

  // 예전 데이터가 남아 있어도 화면이 깨지지 않게 보정해둔다.
  COUPLE: "봄",
  FAMILY: "여름",
  FRIEND: "겨울",
  CUSTOM: "라벤더",
};