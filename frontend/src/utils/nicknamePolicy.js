/*
 * nicknamePolicy.js 역할
 *
 * 회원가입과 닉네임 변경 화면에서
 * 동일한 닉네임 규칙을 사용하도록 관리한다.
 */

export const NICKNAME_MAX_UNITS = 16;


/*
 * 한글 / 영문 / 숫자만 허용
 */
const NICKNAME_PATTERN =
  /^[가-힣A-Za-z0-9]+$/;


/*
 * 닉네임 길이 계산
 *
 * 한글 = 2칸
 * 영어/숫자 = 1칸
 */
export function getNicknameUnits(
  nickname
) {
  const normalized =
    String(nickname || "")
      .trim();

  return Array.from(
    normalized
  ).reduce(
    (
      total,
      character
    ) => {

      const isHangul =
        /[가-힣]/.test(
          character
        );

      return (
        total +
        (isHangul ? 2 : 1)
      );
    },
    0
  );
}


/*
 * 닉네임 전체 검사
 */
export function validateNickname(
  nickname
) {
  const normalized =
    String(nickname || "")
      .trim();


  /*
   * 아무것도 입력하지 않음
   */
  if (!normalized) {
    return {
      valid: false,
      normalized,
      units: 0,
      message:
        "닉네임을 입력해 주세요.",
    };
  }


  /*
   * 특수문자 또는 중간 공백 포함
   */
  if (
    !NICKNAME_PATTERN.test(
      normalized
    )
  ) {
    return {
      valid: false,
      normalized,
      units:
        getNicknameUnits(
          normalized
        ),
      message:
        "한글, 영문, 숫자만 사용할 수 있어요.",
    };
  }


  const units =
    getNicknameUnits(
      normalized
    );


  /*
   * 최대 길이 초과
   */
  if (
    units >
    NICKNAME_MAX_UNITS
  ) {
    return {
      valid: false,
      normalized,
      units,
      message:
        "한글은 최대 8자, 영문과 숫자는 최대 16자까지 사용할 수 있어요.",
    };
  }


  return {
    valid: true,
    normalized,
    units,
    message:
      `✓ 사용할 수 있는 닉네임이에요. (${units}/16)`,
  };
}