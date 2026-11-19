/** 화면 선택과 관계없이 오픈 전에는 작성자 전용 API만 사용한다. 서버도 소유권을 별도로 검사한다. */
export function noteViewScope(isOpen, requested) {
  return !isOpen || requested === "MINE" ? "MINE" : "ALL";
}
