/*
 * jarDetailLabels 역할
 *
 * 저금통 상세 화면에서 서버 enum 값을
 * 사용자가 읽기 쉬운 한글 문구로 바꿔주는 파일이야.
 *
 * 중요한 점:
 * - THEME_LABEL은 화면에 이름을 보여줄 때 사용한다.
 * - EDITABLE_THEME_OPTIONS는 수정 화면에서 선택할 수 있는
 *   현재 테마만 담는다.
 * - 예전 테마 값은 화면 표시용으로만 남기고,
 *   서버 수정 요청으로는 보내지 않는다.
 */

export const ROLE_LABEL = {
  OWNER: "방장",
  ADMIN: "관리자",
  MEMBER: "멤버",
};

/*
 * 현재 백엔드 JarTheme enum에서 지원하는 테마야.
 *
 * 이 목록에 있는 값만 저금통 생성·수정 요청으로 보낼 수 있다.
 */
const CURRENT_THEME_LABEL = {
  SPRING: "봄",
  SUMMER: "여름",
  AUTUMN: "가을",
  WINTER: "겨울",
  LAVENDER: "라벤더",
  DEW: "이슬",
  SAND: "모래",
  MOONLIGHT: "달빛",
};

/*
 * 화면 표시용 테마 이름표야.
 *
 * 혹시 DB나 오래된 응답에 예전 테마 값이 남아 있어도
 * 화면에 COUPLE 같은 영어가 그대로 나오지 않도록 보정한다.
 *
 * 단, 아래 예전 값은 수정 선택 목록에는 넣지 않는다.
 */
export const THEME_LABEL = {
  ...CURRENT_THEME_LABEL,

  COUPLE: "봄",
  FAMILY: "여름",
  FRIEND: "겨울",
  CUSTOM: "라벤더",
};

/*
 * 저금통 수정 화면에서 선택할 수 있는 테마 목록이야.
 *
 * CURRENT_THEME_LABEL만 사용하므로
 * COUPLE, FAMILY, FRIEND, CUSTOM 같은 예전 값은 나오지 않는다.
 */
export const EDITABLE_THEME_OPTIONS = Object.entries(
  CURRENT_THEME_LABEL
).map(([value, label]) => ({
  value,
  label,
}));

/*
 * 예전 테마를 현재 테마로 바꿔주는 표야.
 *
 * 예:
 * - COUPLE → SPRING
 * - CUSTOM → LAVENDER
 */
const LEGACY_THEME_MAP = {
  COUPLE: "SPRING",
  FAMILY: "SUMMER",
  FRIEND: "WINTER",
  CUSTOM: "LAVENDER",
};

/*
 * normalizeJarTheme 역할
 *
 * 서버에서 예전 테마 값이 넘어와도
 * 수정 화면에서는 현재 지원하는 테마 값으로 바꿔준다.
 */
export function normalizeJarTheme(theme) {
  if (!theme) {
    return "LAVENDER";
  }

  return LEGACY_THEME_MAP[theme] ?? theme;
}