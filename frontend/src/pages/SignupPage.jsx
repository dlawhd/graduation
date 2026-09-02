// src/pages/SignupPage.jsx

import {
  useEffect,
  useState,
} from "react";
import { Link } from "react-router-dom";
import MemoryJarLogoIcon from "../components/icons/MemoryJarLogoIcon";
import {
  validateNickname,
} from "../utils/nicknamePolicy";

/*
 * 자체 회원가입에서 사용하는 인증 API 함수
 *
 * checkLoginIdAvailability
 * → 아이디 중복 확인
 *
 * getAuthErrorMessage
 * → 서버에서 내려온 오류 문구를
 *   사용자에게 보여주기 쉬운 문자열로 바꿔준다.
 */
import {
  checkLoginIdAvailability,
  sendSignupEmailVerification,
  confirmSignupEmailVerification,

  /*
   * 이메일 인증까지 완료한 사용자의 정보를
   * 백엔드 회원가입 API로 보내는 함수
   */
  signupLocal,

  getAuthErrorMessage,
} from "../api/authApi";

/*
 * 백엔드의 KST LocalDateTime을
 * JavaScript 밀리초 시간으로 변환한다.
 *
 * 예:
 * 2026-08-28T16:30:00
 *        ↓
 * 2026-08-28T16:30:00+09:00
 */
function parseKstDateTime(
  dateTime
) {
  if (!dateTime) {
    return null;
  }

  /*
   * Java LocalDateTime에서 마이크로초 6자리까지
   * 내려올 수 있으므로 밀리초 3자리까지만 사용한다.
   */
  const millisecondsNormalized =
    dateTime.replace(
      /(\.\d{3})\d+/,
      "$1"
    );

  /*
   * 이미 timezone 정보가 있으면
   * 별도로 +09:00을 붙이지 않는다.
   */
  const alreadyHasTimezone =
    /(?:Z|[+-]\d{2}:\d{2})$/.test(
      millisecondsNormalized
    );

  const valueWithTimezone =
    alreadyHasTimezone
      ? millisecondsNormalized
      : `${millisecondsNormalized}+09:00`;

  const time =
    new Date(
      valueWithTimezone
    ).getTime();

  return Number.isNaN(time)
    ? null
    : time;
}


/*
 * 남은 초를 MM:SS 문자열로 변환한다.
 *
 * 300 → 05:00
 * 59  → 00:59
 */
function formatRemainingTime(
  totalSeconds
) {
  const safeSeconds =
    Math.max(
      0,
      totalSeconds
    );

  const minutes =
    Math.floor(
      safeSeconds / 60
    );

  const seconds =
    safeSeconds % 60;

  return `${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}


/*
 * PasswordVisibilityIcon 역할
 *
 * 비밀번호가 현재 보이는 상태인지에 따라
 * 눈 아이콘 모양을 바꿔준다.
 */
function PasswordVisibilityIcon({
  visible,
}) {
  /*
   * 비밀번호가 보이는 상태
   * → 눈에 사선이 있는 아이콘
   */
  if (visible) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 3l18 18" />
        <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
        <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 9.5 8 9.5 8a15 15 0 0 1-2.1 3.3" />
        <path d="M6.6 6.6C3.8 8.4 2.5 12 2.5 12S5.5 20 12 20a9.8 9.8 0 0 0 4-.8" />
      </svg>
    );
  }

  /*
   * 비밀번호가 숨겨진 상태
   * → 일반 눈 아이콘
   */
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12S5.5 4 12 4s9.5 8 9.5 8-3 8-9.5 8-9.5-8-9.5-8Z" />
      <circle
        cx="12"
        cy="12"
        r="2.5"
      />
    </svg>
  );
}

/*
 * SignupPage 역할
 *
 * Memory Jar 자체 계정을 새로 만드는 회원가입 화면이야.
 *
 * 전체 회원가입 흐름:
 *
 * 1. 아이디 입력 / 중복 확인
 * 2. 비밀번호 / 비밀번호 확인
 * 3. 닉네임 입력
 * 4. 이메일 인증번호 실제 발송
 * 5. 인증번호 5분 만료 타이머
 * 6. 인증번호 재전송 60초 제한
 * 7. 이메일 인증번호 실제 확인
 * 8. 회원가입용 verificationToken 발급
 * 9. 자체 계정 회원가입
 * 10. Access / Refresh Token HttpOnly Cookie 발급
 * 11. 자동 로그인 상태로 /jars 이동
 */
export default function SignupPage() {

  /*
   * =========================================================
   * 회원가입 입력값
   * =========================================================
   */

  // 로그인할 때 사용할 Memory Jar 아이디
  const [loginId, setLoginId] = useState("");

  /*
   * 아이디 중복 확인 상태
   *
   * idle
   * → 아직 확인하지 않음
   *
   * checking
   * → 서버에 중복 확인 요청 중
   *
   * available
   * → 사용할 수 있는 아이디
   *
   * unavailable
   * → 이미 사용 중인 아이디
   */
  const [
    loginIdCheckStatus,
    setLoginIdCheckStatus,
  ] = useState("idle");

  /*
   * 아이디 입력칸 아래에 보여줄
   * 중복 확인 결과 문구
   */
  const [
    loginIdCheckMessage,
    setLoginIdCheckMessage,
  ] = useState("");

  // 비밀번호
  const [password, setPassword] = useState("");

  /*
   * 비밀번호 보기 / 숨기기 상태
   *
   * false
   * → ••••••••
   *
   * true
   * → Memory123!
   */
  const [
    showPassword,
    setShowPassword,
  ] = useState(false);


  /*
   * 비밀번호 확인 칸도
   * 같은 방식으로 따로 제어한다.
   */
  const [
    showPasswordConfirm,
    setShowPasswordConfirm,
  ] = useState(false);

  // 비밀번호를 한 번 더 입력해서 오타를 확인한다.
  const [passwordConfirm, setPasswordConfirm] =
    useState("");

  // 서비스 안에서 보여줄 이름
  const [nickname, setNickname] = useState("");

  // 인증번호를 받을 이메일
  const [email, setEmail] =
    useState("");

  /*
   * 이메일 인증번호 발송 상태
   *
   * idle
   * → 아직 발송하지 않음
   *
   * sending
   * → 서버/AWS SES가 현재 메일을 보내는 중
   *
   * sent
   * → 정상적으로 발송 완료
   *
   * error
   * → 발송 실패
   */
  const [
    emailSendStatus,
    setEmailSendStatus,
  ] = useState("idle");

  /*
   * 이메일 입력칸 아래에 표시할
   * 발송 성공/실패 문구
   */
  const [
    emailSendMessage,
    setEmailSendMessage,
  ] = useState("");

  /*
   * 인증번호가 만료되는 실제 시각.
   *
   * Date.now()처럼 밀리초 숫자로 보관한다.
   */
  const [
    verificationExpiresAt,
    setVerificationExpiresAt,
  ] = useState(null);

  /*
   * 화면에 표시할 인증번호 남은 시간.
   *
   * 단위는 초.
   *
   * 예:
   *
   * 300
   * 299
   * 298
   */
  const [
    verificationRemainingSeconds,
    setVerificationRemainingSeconds,
  ] = useState(0);

  /*
   * 재전송 가능까지 남은 시간.
   *
   * 백엔드에서도 동일 이메일의 너무 빠른 재전송을
   * 60초 동안 막고 있기 때문에
   * 프론트에서도 버튼을 비활성화한다.
   */
  const [
    resendRemainingSeconds,
    setResendRemainingSeconds,
  ] = useState(0);

  // 사용자가 이메일로 받은 6자리 인증번호
  const [
    verificationCode,
    setVerificationCode,
  ] = useState("");

  /*
   * 이메일 인증번호 확인 상태
   *
   * idle
   * → 아직 인증번호 확인을 하지 않음
   *
   * verifying
   * → 서버에서 인증번호를 확인하는 중
   *
   * verified
   * → 인증 성공
   *
   * error
   * → 인증번호가 틀렸거나 만료됨
   */
  const [
    verificationStatus,
    setVerificationStatus,
  ] = useState("idle");

  /*
   * 인증번호 입력칸 아래에 보여줄
   * 인증 성공 / 실패 메시지
   */
  const [
    verificationMessage,
    setVerificationMessage,
  ] = useState("");

  /*
   * 이메일 인증에 성공하면
   * 서버가 내려주는 1회성 회원가입 토큰.
   *
   * 실제 회원가입 API를 호출할 때:
   *
   * {
   *   loginId,
   *   password,
   *   nickname,
   *   email,
   *   verificationToken
   * }
   *
   * 형태로 함께 보낸다.
   *
   * 이 값이 있어야
   * "실제로 이메일 인증을 완료한 사람"인지
   * 서버가 확인할 수 있다.
   */
  const [
    verificationToken,
    setVerificationToken,
  ] = useState("");

  /*
   * =========================================================
   * 기존 계정 로그인 방법
   * =========================================================
   *
   * 이메일 인증번호까지 성공한 뒤
   * 서버가 이 이메일이 기존 계정인지 알려준다.
   *
   * false
   * → 신규 사용자
   *
   * true
   * → 이미 Memory Jar에서 사용 중인 이메일
   */
  const [
    existingAccount,
    setExistingAccount,
  ] = useState(false);


  /*
   * 기존 계정에서 사용할 수 있는 로그인 방법.
   *
   * 예:
   *
   * ["NAVER"]
   *
   * ["LOCAL", "GOOGLE"]
   *
   * ["NAVER", "GOOGLE", "KAKAO"]
   */
  const [
    existingLoginMethods,
    setExistingLoginMethods,
  ] = useState([]);


  /*
   * 기존 계정 안내에서
   * 어느 OAuth 로그인 화면으로 이동 중인지 저장한다.
   *
   * null
   * → 이동 중 아님
   *
   * "naver"
   * "google"
   * "kakao"
   * → 해당 Provider로 이동 중
   */
  const [
    redirectingProvider,
    setRedirectingProvider,
  ] = useState(null);

  /*
   * 최종 회원가입 요청 상태
   *
   * idle
   * → 아직 회원가입 요청 전
   *
   * submitting
   * → 현재 서버에서 회원가입 처리 중
   *
   * error
   * → 회원가입 실패
   *
   * 성공한 경우에는 바로 /jars로 이동하므로
   * 별도의 success 상태는 필요하지 않다.
   */
  const [
    signupStatus,
    setSignupStatus,
  ] = useState("idle");

  /*
   * =========================================================
   * 화면 안내 문구
   * =========================================================
   *
   * 회원가입 과정에서 발생하는
   * 진행 상태와 성공/실패 안내 문구를
   * 사용자에게 보여주기 위해 사용한다.
   */
  const [guideMessage, setGuideMessage] =
    useState("");

  /*
   * =========================================================
   * 회원가입 입력값 유효성 검사
   * =========================================================
   *
   * 화면 곳곳에서 같은 조건을 여러 번 계산하지 않고
   * 여기에서 한 번만 정리한다.
   *
   * 이 값들은:
   *
   * 1. 입력칸 아래 안내 문구
   * 2. 비밀번호 일치 여부
   * 3. 마지막 "Memory Jar 시작하기" 버튼 활성화 여부
   *
   * 를 판단할 때 함께 사용한다.
   */

  /*
   * 아이디 형식
   *
   * 허용:
   * - 영문 소문자
   * - 숫자
   * - 밑줄(_)
   *
   * 길이:
   * - 4~20자
   */
  const loginIdPattern =
    /^[a-z0-9_]{4,20}$/;

  const isLoginIdFormatValid =
    loginIdPattern.test(
      loginId.trim()
    );

  /*
   * 비밀번호 길이 조건
   *
   * 현재 우리가 정한 회원가입 정책:
   * 8자 이상 100자 이하
   */
  const isPasswordLengthValid =
    password.length >= 8 &&
    password.length <= 100;

  /*
   * =========================================================
   * 비밀번호 문자 종류 검사
   * =========================================================
   *
   * Memory Jar 비밀번호는 아래 세 가지를
   * 각각 최소 1개 이상 포함해야 한다.
   *
   * 1. 영문
   * 2. 숫자
   * 3. 특수문자
   *
   * 예:
   *
   * memory123!  → 가능
   * memory123   → 특수문자가 없어서 불가능
   * memory!!!   → 숫자가 없어서 불가능
   * 12345678!   → 영문이 없어서 불가능
   */

  /*
   * 영문이 최소 1글자 들어 있는지 확인한다.
   *
   * 대문자 A-Z와 소문자 a-z 모두 인정한다.
   */
  const passwordHasLetter =
    /[A-Za-z]/.test(password);

  /*
   * 숫자가 최소 1개 들어 있는지 확인한다.
   */
  const passwordHasNumber =
    /[0-9]/.test(password);

  /*
   * 특수문자가 최소 1개 들어 있는지 확인한다.
   *
   * ASCII 특수문자 범위를 사용한다.
   *
   * 예:
   * ! @ # $ % ^ & * _ - ? 등
   *
   * 이렇게 범위를 명확하게 지정하는 이유는
   * 한글 같은 문자가 실수로
   * "특수문자"로 판정되는 것을 막기 위해서다.
   */
  const passwordHasSpecialCharacter =
    /[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]/.test(
      password
    );

  /*
   * 영문 + 숫자 + 특수문자를
   * 모두 최소 1개 이상 포함했는지 확인한다.
   *
   * 세 조건 중 하나라도 false라면
   * 전체 결과도 false가 된다.
   */
  const isPasswordRequiredCharactersValid =
    passwordHasLetter &&
    passwordHasNumber &&
    passwordHasSpecialCharacter;

  /*
   * 비밀번호 최종 검사.
   *
   * 아래 두 조건을 모두 만족해야 한다.
   *
   * 1. 8~100자
   * 2. 영문 + 숫자 + 특수문자 각각 최소 1개
   */
  const isPasswordValid =
    isPasswordLengthValid &&
    isPasswordRequiredCharactersValid;

  /*
   * 비밀번호 확인까지 입력했고
   * 두 비밀번호가 같은지 확인한다.
   */
  const isPasswordMatched =
    Boolean(passwordConfirm) &&
    password === passwordConfirm;

  /*
   * 기존 화면에서 빨간 오류를 보여줄 때
   * 사용하는 값도 그대로 유지한다.
   */
  const passwordMismatch =
    Boolean(password) &&
    Boolean(passwordConfirm) &&
    !isPasswordMatched;

  /*
   * 공통 닉네임 정책으로 검사한다.
   *
   * 회원가입과 닉네임 변경이
   * 완전히 같은 규칙을 사용한다.
   */
  const nicknameValidation =
    validateNickname(
      nickname
    );

  const isNicknameValid =
    nicknameValidation.valid;

  /*
   * 이메일 인증은 인증번호 확인 성공뿐 아니라
   * 서버에서 받은 verificationToken까지
   * 존재해야 진짜 완료로 판단한다.
   */
  const isEmailVerified =
    verificationStatus === "verified" &&
    Boolean(verificationToken);

  /*
   * 최종 회원가입 버튼 활성화 조건.
   *
   * 기존 계정 이메일이라면
   * 이메일 인증까지 완료했더라도
   * 새로운 User를 만들면 안 된다.
   */
  const canSubmitSignup =
    isLoginIdFormatValid &&
    loginIdCheckStatus === "available" &&
    isPasswordValid &&
    isPasswordMatched &&
    isNicknameValid &&
    isEmailVerified &&

    /*
     * 신규 이메일일 때만 회원가입 가능
     */
    !existingAccount;

  /*
   * 이메일이 바뀌거나
   * 새로운 인증번호를 다시 받으면
   * 이전 이메일의 기존 계정 판별 결과를 지운다.
   *
   * 예:
   *
   * A 이메일 → NAVER 기존 계정
   *
   * 그 뒤 B 이메일로 변경
   *
   * 이때 A 이메일의 NAVER 정보가
   * B 이메일 화면에 남아 있으면 안 된다.
   */
  function resetExistingAccountInfo() {
    setExistingAccount(false);
    setExistingLoginMethods([]);
    setRedirectingProvider(null);
  }

  /*
   * =========================================================
   * 이메일 인증번호 만료 타이머
   * =========================================================
   *
   * verificationExpiresAt이 생기면
   * 1초마다:
   *
   * 서버 만료 시각 - 현재 시각
   *
   * 을 다시 계산한다.
   *
   * 단순히 300, 299, 298을 빼는 방식보다
   * 실제 시각 차이를 계산하는 방식이 정확하다.
   */
  useEffect(() => {
    if (!verificationExpiresAt) {
      setVerificationRemainingSeconds(
        0
      );

      return undefined;
    }

    let timerId = null;

    function updateRemainingTime() {
      const remainingMilliseconds =
        verificationExpiresAt -
        Date.now();

      const remainingSeconds =
        Math.max(
          0,

          /*
           * 1.1초가 남아 있다면 화면에는
           * 아직 2초 정도로 표시하는 편이 자연스럽다.
           */
          Math.ceil(
            remainingMilliseconds /
              1000
          )
        );

      setVerificationRemainingSeconds(
        remainingSeconds
      );

      /*
       * 만료됐다면 더 이상 interval을
       * 계속 실행할 필요가 없다.
       */
      if (
        remainingSeconds === 0 &&
        timerId
      ) {
        clearInterval(timerId);
      }
    }

    /*
     * 화면에 진입하자마자 한 번 계산한다.
     */
    updateRemainingTime();

    /*
     * 이후 1초마다 다시 계산한다.
     */
    timerId = window.setInterval(
      updateRemainingTime,
      1000
    );

    /*
     * SignupPage를 벗어나거나
     * 새로운 expiresAt으로 변경되면
     * 기존 interval을 제거한다.
     *
     * 이 처리가 없으면 사용하지 않는 타이머가
     * 계속 메모리에 남을 수 있다.
     */
    return () => {
      if (timerId) {
        clearInterval(timerId);
      }
    };
  }, [verificationExpiresAt]);

  /*
   * 인증번호 재전송 제한 타이머
   */
  useEffect(() => {
    if (
      resendRemainingSeconds <= 0
    ) {
      return undefined;
    }

    const timeoutId =
      window.setTimeout(() => {
        setResendRemainingSeconds(
          (current) =>
            Math.max(
              0,
              current - 1
            )
        );
      }, 1000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [resendRemainingSeconds]);

  /*
   * =========================================================
   * 회원가입 화면 이벤트 처리
   * =========================================================
   *
   * 아이디 중복 확인,
   * 이메일 인증번호 발송,
   * 인증번호 확인 등의
   * 실제 API 요청을 처리한다.
   */

  /*
   * 아이디 중복 확인
   *
   * 사용자가 [중복 확인] 버튼을 누르면
   * 실제 Spring Boot API에 요청한다.
   */
  async function handleCheckLoginId() {
    /*
     * 서버에 보내기 전에
     * 앞뒤 공백을 제거하고 소문자로 맞춘다.
     *
     * 예:
     *
     * "  Memory_User  "
     *        ↓
     * "memory_user"
     */
    const normalizedLoginId =
      loginId.trim().toLowerCase();

    /*
     * 아이디가 비어 있으면
     * API 요청 자체를 보내지 않는다.
     */
    if (!normalizedLoginId) {
      setLoginIdCheckStatus("idle");

      setLoginIdCheckMessage(
        "사용할 아이디를 입력해 주세요."
      );

      return;
    }

    /*
     * Memory Jar 아이디 규칙
     *
     * 영문 소문자
     * 숫자
     * 밑줄(_)
     *
     * 4~20자
     */
    const loginIdPattern =
      /^[a-z0-9_]{4,20}$/;

    /*
     * 형식이 잘못된 경우에도
     * 서버까지 요청할 필요가 없다.
     */
    if (
      !loginIdPattern.test(
        normalizedLoginId
      )
    ) {
      setLoginIdCheckStatus("idle");

      setLoginIdCheckMessage(
        "아이디는 4~20자의 영문 소문자와 숫자를 사용해 주세요. 밑줄(_)도 사용할 수 있어요."
      );

      return;
    }

    /*
     * 화면의 입력값도
     * 서버에 보낼 형태와 동일하게 맞춘다.
     */
    setLoginId(normalizedLoginId);

    /*
     * 요청 시작
     */
    setLoginIdCheckStatus("checking");

    setLoginIdCheckMessage(
      "아이디를 확인하고 있어요."
    );

    /*
     * 이전 공통 안내 문구가 있다면 지운다.
     */
    setGuideMessage("");

    try {
      /*
       * authApi.js에서 만든 함수 호출
       *
       * 실제 요청:
       *
       * GET
       * /api/v1/auth/login-id/availability
       * ?loginId=memory_user
       */
      const result =
        await checkLoginIdAvailability(
          normalizedLoginId
        );

      /*
       * 백엔드 응답 예:
       *
       * {
       *   loginId: "memory_user",
       *   available: true
       * }
       */

      if (result?.available) {
        /*
         * 사용할 수 있는 아이디
         */
        setLoginIdCheckStatus(
          "available"
        );

        setLoginIdCheckMessage(
          "사용할 수 있는 아이디예요."
        );

        return;
      }

      /*
       * 이미 존재하는 아이디
       */
      setLoginIdCheckStatus(
        "unavailable"
      );

      setLoginIdCheckMessage(
        "이미 사용 중인 아이디예요."
      );
    } catch (error) {
      /*
       * 네트워크 오류나 서버 오류가 발생하면
       * 사용 가능한 것으로 처리하면 안 된다.
       */
      setLoginIdCheckStatus("idle");

      setLoginIdCheckMessage(
        getAuthErrorMessage(
          error,
          "아이디 중복 확인에 실패했어요. 잠시 후 다시 시도해 주세요."
        )
      );
    }
  }

  /*
   * 이메일 인증번호 실제 발송
   *
   * 사용자가 [인증번호 받기] 버튼을 누르면:
   *
   * 1. 이메일 형식 확인
   * 2. 백엔드 API 호출
   * 3. 백엔드에서 인증번호 생성
   * 4. AWS SES 발송
   * 5. 서버가 내려준 expiresAt을 이용해 타이머 시작
   */
  async function handleSendVerificationCode() {
    /*
     * Memory Jar에서는 이메일도
     * 앞뒤 공백 제거 + 소문자 형태로 통일해서 사용한다.
     */
    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (!normalizedEmail) {
      setEmailSendStatus("error");

      setEmailSendMessage(
        "인증번호를 받을 이메일을 입력해 주세요."
      );

      return;
    }

    /*
     * 프론트의 1차 이메일 형식 검사.
     *
     * 최종 검증은 백엔드의 @Email에서도
     * 다시 수행되기 때문에 이 검사가 보안의 전부는 아니다.
     *
     * 화면에서 명백한 오타를 빠르게 알려주는 역할이다.
     */
    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailPattern.test(
        normalizedEmail
      )
    ) {
      setEmailSendStatus("error");

      setEmailSendMessage(
        "이메일 형식을 확인해 주세요."
      );

      return;
    }

    /*
     * 화면의 이메일도 정규화된 값으로 맞춘다.
     */
    setEmail(normalizedEmail);

    /*
     * 새로운 인증번호를 요청하므로
     * 이전 인증번호와 이전 만료시간은 모두 무효화한다.
     */
    setVerificationCode("");

    /*
     * 새로운 인증번호를 요청했다는 것은
     * 이전 인증 성공 결과 역시 더 이상 사용하지 않는다는 뜻이다.
     */
    setVerificationStatus("idle");
    setVerificationMessage("");
    setVerificationToken("");

    /*
     * 새로운 이메일 인증을 시작하므로
     * 이전 계정 판별 결과를 제거한다.
     */
    resetExistingAccountInfo();

    /*
     * 이전 인증번호의 5분 타이머도 종료한다.
     *
     * 새 번호 발송에 성공하면
     * 서버가 내려준 새로운 expiresAt으로 다시 시작한다.
     */
    setVerificationExpiresAt(null);
    setVerificationRemainingSeconds(0);

    setEmailSendStatus("sending");

    setEmailSendMessage(
      "인증번호를 보내고 있어요."
    );

    setGuideMessage("");

    try {
      /*
       * 실제 API 호출
       *
       * POST /api/v1/auth/email-verifications
       */
      const result =
        await sendSignupEmailVerification(
          normalizedEmail
        );

      /*
       * 응답 예:
       *
       * {
       *   email: "user@example.com",
       *   expiresAt: "2026-08-28T16:30:00"
       * }
       */
      const expiresAt =
        parseKstDateTime(
          result?.expiresAt
        );

      /*
       * 정상 응답이라면 서버가 expiresAt을
       * 반드시 보내줘야 한다.
       *
       * 혹시 예상치 못한 응답이 왔다면
       * 인증 UI를 성공 상태로 만들지 않는다.
       */
      if (!expiresAt) {
        throw new Error(
          "인증번호 만료 시간을 확인하지 못했어요."
        );
      }

      setEmailSendStatus("sent");

      setEmailSendMessage(
        `${result?.email ?? normalizedEmail}로 인증번호를 보냈어요. 메일함을 확인해 주세요.`
      );

      /*
       * 서버가 알려준 실제 만료 시각 저장.
       *
       * 저장되는 순간 위에서 만든 useEffect가
       * 5분 타이머를 시작한다.
       */
      setVerificationExpiresAt(
        expiresAt
      );

      /*
       * 같은 이메일로 바로 재전송하지 못하도록
       * 60초 동안 버튼을 비활성화한다.
       *
       * 실제 제한은 백엔드에서도 다시 검사한다.
       */
      setResendRemainingSeconds(
        60
      );
    } catch (error) {
      setEmailSendStatus("error");

      setEmailSendMessage(
        getAuthErrorMessage(
          error,
          "인증번호를 보내지 못했어요. 잠시 후 다시 시도해 주세요."
        )
      );
    }
  }

  /*
   * 이메일 인증번호 실제 확인
   *
   * 사용자가 이메일로 받은 6자리 번호를
   * 백엔드에 보내서 실제로 맞는지 검사한다.
   *
   * 성공하면:
   *
   * 1. verificationToken을 받는다.
   * 2. 기존 계정인지 확인한다.
   * 3. 기존 계정이면 로그인 방법을 저장한다.
   */
  async function handleConfirmVerificationCode() {

    /*
     * 이메일은 앞뒤 공백 제거 + 소문자로 통일한다.
     */
    const normalizedEmail =
      email
        .trim()
        .toLowerCase();


    /*
     * =========================================================
     * 1. 인증번호 발송 여부 확인
     * =========================================================
     */
    if (
      emailSendStatus !== "sent"
    ) {

      setVerificationStatus(
        "error"
      );

      setVerificationMessage(
        "먼저 이메일 인증번호를 받아 주세요."
      );

      return;
    }


    /*
     * =========================================================
     * 2. 인증번호 만료 여부 확인
     * =========================================================
     */
    if (
      verificationRemainingSeconds <= 0
    ) {

      setVerificationStatus(
        "error"
      );

      setVerificationMessage(
        "인증번호가 만료됐어요. 인증번호를 다시 받아 주세요."
      );

      return;
    }


    /*
     * =========================================================
     * 3. 인증번호 형식 확인
     * =========================================================
     *
     * 정확히 숫자 6자리만 허용한다.
     */
    if (
      !/^\d{6}$/.test(
        verificationCode
      )
    ) {

      setVerificationStatus(
        "error"
      );

      setVerificationMessage(
        "이메일로 받은 인증번호 6자리를 입력해 주세요."
      );

      return;
    }


    /*
     * =========================================================
     * 4. 서버 확인 시작
     * =========================================================
     */
    setVerificationStatus(
      "verifying"
    );

    setVerificationMessage(
      "인증번호를 확인하고 있어요."
    );

    setGuideMessage("");


    try {

      /*
       * =======================================================
       * 실제 이메일 인증 API 호출
       * =======================================================
       *
       * POST
       * /api/v1/auth/email-verifications/confirm
       *
       * 응답 예:
       *
       * {
       *   verificationToken: "...",
       *   existingAccount: true,
       *   loginMethods: ["NAVER"]
       * }
       */
      const result =
        await confirmSignupEmailVerification({
          email:
            normalizedEmail,

          code:
            verificationCode,
        });


      /*
       * =======================================================
       * 5. verificationToken 확인
       * =======================================================
       */
      const token =
        result?.verificationToken;


      /*
       * 인증 성공 응답인데
       * 회원가입용 토큰이 없다면
       * 정상 완료로 처리하지 않는다.
       */
      if (!token) {

        throw new Error(
          "이메일 인증 토큰을 확인하지 못했어요."
        );
      }


      /*
       * =======================================================
       * 6. 기존 계정 여부 확인
       * =======================================================
       *
       * true
       * → 이미 가입된 이메일
       *
       * false
       * → 신규 회원가입 가능
       */
      const accountAlreadyExists =
        result?.existingAccount ===
        true;


      /*
       * loginMethods가 배열인지 확인한다.
       *
       * 서버 응답에 문제가 있어도
       * 화면이 깨지지 않도록
       * 기본값은 빈 배열로 사용한다.
       */
      const rawLoginMethods =
        Array.isArray(
          result?.loginMethods
        )
          ? result.loginMethods
          : [];


      /*
       * Memory Jar에서 지원하는
       * 로그인 방법만 허용한다.
       */
      const supportedLoginMethods =
        new Set([
          "LOCAL",
          "NAVER",
          "GOOGLE",
          "KAKAO",
        ]);


      /*
       * Provider 이름을 대문자로 통일하고
       * 중복값도 제거한다.
       *
       * 예:
       *
       * ["naver", "NAVER"]
       *
       *     ↓
       *
       * ["NAVER"]
       */
      const normalizedLoginMethods = [
        ...new Set(
          rawLoginMethods
            .map(
              (method) =>
                String(method)
                  .trim()
                  .toUpperCase()
            )
            .filter(
              (method) =>
                supportedLoginMethods
                  .has(method)
            )
        ),
      ];


      /*
       * 기존 계정 여부 저장
       */
      setExistingAccount(
        accountAlreadyExists
      );


      /*
       * NAVER / GOOGLE / KAKAO / LOCAL
       * 로그인 방법 저장
       */
      setExistingLoginMethods(
        normalizedLoginMethods
      );


      /*
       * =======================================================
       * 7. 이메일 인증 성공 처리
       * =======================================================
       */
      setVerificationStatus(
        "verified"
      );

      setVerificationMessage(
        accountAlreadyExists
          /*
           * 기존 사용자는 새 계정을 만들지 않고
           * 아래에 표시되는 기존 로그인 방법으로 이동한다.
           */
          ? "이메일 인증이 완료됐어요. 기존 로그인 방법을 이용해 주세요."

          /*
           * 신규 사용자는 회원가입을 계속 진행한다.
           */
          : "이메일 인증이 완료됐어요."
      );


      /*
       * 신규 회원가입에 사용할
       * 일회성 verificationToken 저장
       *
       * 기존 계정에서는 실제 회원가입 버튼이 숨겨지지만,
       * 인증 결과 자체는 정상적으로 보관한다.
       */
      setVerificationToken(
        token
      );

    } catch (error) {

      /*
       * =======================================================
       * 인증 실패
       * =======================================================
       */

      setVerificationStatus(
        "error"
      );


      /*
       * 실패한 인증 토큰을
       * 화면 상태에 남겨두면 안 된다.
       */
      setVerificationToken("");


      /*
       * 이전 계정 판별 결과 역시
       * 더 이상 신뢰하지 않는다.
       */
      resetExistingAccountInfo();


      setVerificationMessage(
        getAuthErrorMessage(
          error,
          "인증번호를 확인하지 못했어요. 번호를 다시 확인해 주세요."
        )
      );
    }
  }

  /*
   * =========================================================
   * 기존 소셜 계정으로 로그인 이동
   * =========================================================
   *
   * 이메일 인증 후 기존 계정으로 확인되면:
   *
   * NAVER
   * GOOGLE
   * KAKAO
   *
   * 중 사용자가 실제 연결해 둔 Provider로 이동한다.
   */
  function handleExistingOAuthLogin(
    provider
  ) {

    /*
     * naver / google / kakao 형태로 통일한다.
     */
    const normalizedProvider =
      String(provider ?? "")
        .trim()
        .toLowerCase();


    /*
     * 예상하지 못한 Provider로
     * OAuth 주소를 만들지 않도록 방어한다.
     */
    if (
      ![
        "naver",
        "google",
        "kakao",
      ].includes(
        normalizedProvider
      )
    ) {

      setGuideMessage(
        "지원하지 않는 로그인 방법이에요."
      );

      return;
    }


    /*
     * Home.jsx와 동일한
     * 백엔드 주소 환경변수를 사용한다.
     */
    const backendUrl =
      import.meta.env
        .VITE_API_BASE_URL
        ?.replace(
          /\/+$/,
          ""
        );


    if (!backendUrl) {

      setGuideMessage(
        "로그인 서버 주소를 확인하지 못했어요."
      );

      return;
    }


    /*
     * 다른 Provider 버튼을
     * 연속으로 누르지 못하게 한다.
     */
    setRedirectingProvider(
      normalizedProvider
    );

    setGuideMessage("");


    /*
     * 로그인에 성공한 뒤에는
     * 저금통 목록으로 이동하도록 기본 목적지를 저장한다.
     */
    sessionStorage.setItem(
      "postLoginRedirect",
      "/jars"
    );


    /*
     * Spring Security OAuth2 로그인 시작.
     *
     * 예:
     *
     * https://api.esjh.shop
     * /oauth2/authorization/naver
     */
    window.location.href =
      `${backendUrl}` +
      `/oauth2/authorization/${normalizedProvider}`;
  }

  /*
   * 최종 회원가입
   *
   * 회원가입 버튼을 누르면:
   *
   * 1. 모든 입력값 확인
   * 2. 아이디 중복 확인 여부 확인
   * 3. 이메일 인증 완료 여부 확인
   * 4. POST /api/v1/auth/signup 호출
   * 5. 백엔드가 회원 생성
   * 6. Access / Refresh Token 쿠키 발급
   * 7. /jars로 이동
   */
  async function handleSubmit(
    event
  ) {
    /*
     * form 태그의 기본 동작인
     * 페이지 새로고침을 막는다.
     */
    event.preventDefault();

    /*
     * =========================================================
     * 기존 계정 회원가입 차단
     * =========================================================
     *
     * 버튼 자체는 기존 계정일 때 숨기고 있지만
     * Enter 키 등으로 form submit이 발생하더라도
     * 새 User를 만들지 않도록 한 번 더 막는다.
     */
    if (existingAccount) {

      setGuideMessage(
        "이미 가입된 이메일이에요. 기존 로그인 방법을 이용해 주세요."
      );

      return;
    }

    /*
     * 신규 사용자라도
     * 아직 필요한 조건을 완료하지 않았다면 차단
     */
    if (!canSubmitSignup) {

      setGuideMessage(
        "회원가입에 필요한 항목을 모두 완료해 주세요."
      );

      return;
    }

    /*
     * 이미 회원가입 요청 중이라면
     * 중복 요청을 보내지 않는다.
     *
     * 사용자가 버튼을 빠르게 여러 번 눌러
     * 회원가입 요청이 중복되는 상황을 막는다.
     */
    if (
      signupStatus ===
      "submitting"
    ) {
      return;
    }

    /*
     * =========================================================
     * 1. 필수 입력값 확인
     * =========================================================
     */
    if (
      !loginId.trim() ||
      !password ||
      !passwordConfirm ||
      !nickname.trim() ||
      !email.trim()
    ) {
      setGuideMessage(
        "회원가입 정보를 모두 입력해 주세요."
      );

      return;
    }

    /*
     * =========================================================
     * 2. 비밀번호 확인
     * =========================================================
     */
    if (passwordMismatch) {
      setGuideMessage(
        "비밀번호와 비밀번호 확인이 일치하지 않아요."
      );

      return;
    }

    /*
     * =========================================================
     * 3. 아이디 중복 확인
     * =========================================================
     *
     * 사용 가능 여부를 확인하지 않았거나,
     * 중복 확인 후 아이디를 다시 수정했다면
     * 회원가입을 진행하지 않는다.
     */
    if (
      loginIdCheckStatus !==
      "available"
    ) {
      setGuideMessage(
        "아이디 중복 확인을 완료해 주세요."
      );

      return;
    }

    /*
     * =========================================================
     * 4. 이메일 인증 확인
     * =========================================================
     *
     * 프론트의 verified 상태만 확인하는 것이 아니라
     * 서버가 발급한 verificationToken이 실제로
     * 존재하는지도 함께 확인한다.
     */
    if (
      verificationStatus !==
        "verified" ||
      !verificationToken
    ) {
      setGuideMessage(
        "이메일 인증을 완료해 주세요."
      );

      return;
    }

    /*
     * 백엔드에 보내기 전에
     * 문자열 값을 한 번 정리한다.
     */
    const normalizedLoginId =
      loginId
        .trim()
        .toLowerCase();

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    const normalizedNickname =
      nickname.trim();

    /*
     * 회원가입 요청 시작
     */
    setSignupStatus(
      "submitting"
    );

    setGuideMessage(
      "Memory Jar 계정을 만들고 있어요."
    );

    try {
      /*
       * =======================================================
       * 실제 회원가입 API
       * =======================================================
       *
       * POST /api/v1/auth/signup
       *
       * Body:
       *
       * {
       *   loginId,
       *   password,
       *   nickname,
       *   email,
       *   verificationToken
       * }
       *
       *
       * 주의:
       *
       * passwordConfirm은 보내지 않는다.
       *
       * passwordConfirm은 프론트에서
       * 사용자가 비밀번호를 잘못 입력하지 않았는지
       * 확인하기 위한 값일 뿐 실제 회원정보가 아니다.
       */
      await signupLocal({
        loginId:
          normalizedLoginId,

        password,

        nickname:
          normalizedNickname,

        email:
          normalizedEmail,

        verificationToken,
      });

      /*
       * =======================================================
       * 회원가입 성공 = 로그인 성공
       * =======================================================
       *
       * 회원가입 백엔드가 성공하면서
       * Access Token과 Refresh Token을
       * HttpOnly Cookie에 저장한다.
       *
       * 따라서 프론트에서 JWT를
       * localStorage 등에 저장할 필요가 없다.
       *
       * loginLocal()을 다시 호출할 필요도 없다.
       */

      /*
       * 여기서는 React Router navigate 대신
       * 실제 페이지 이동을 사용한다.
       *
       * 이유:
       *
       * 회원가입 직후 App 전체를 새로 시작하면
       * 기존 App의 인증 초기화 로직이 다시 실행되면서
       * /api/v1/me를 통해 방금 생성된 로그인 세션을
       * 정확하게 읽을 수 있다.
       *
       * 그래서 공통 Header의 로그인 상태도
       * 바로 최신 상태가 된다.
       */
      window.location.replace(
        "/jars"
      );
    } catch (error) {
      /*
       * 회원가입 실패
       *
       * 예:
       *
       * - 아이디가 그 사이 다른 사용자에게 선점됨
       * - 이메일 인증 토큰 문제
       * - 입력값 검증 실패
       * - 서버 오류
       */
      setSignupStatus("error");

      setGuideMessage(
        getAuthErrorMessage(
          error,
          "회원가입에 실패했어요. 입력한 정보를 확인한 뒤 다시 시도해 주세요."
        )
      );
    }
  }

  return (
    /*
     * =========================================================
     * 페이지 전체
     * =========================================================
     *
     * 기존 Memory Jar의
     * 흰색 + 민트 + 연한 보라 계열 분위기를 유지한다.
     */
    <section className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-gradient-to-b from-white via-emerald-50/30 to-cyan-50/40 px-4 py-8 sm:px-6 sm:py-12">

      {/* 왼쪽 배경 장식 */}
      <div
        className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-emerald-100/50 blur-3xl"
        aria-hidden="true"
      />

      {/* 오른쪽 배경 장식 */}
      <div
        className="pointer-events-none absolute -right-24 bottom-16 h-72 w-72 rounded-full bg-violet-100/45 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-[560px]">

        {/* =====================================================
            로그인 화면으로 돌아가기
           ===================================================== */}
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 rounded-full px-1 py-2 text-sm font-bold text-slate-500 transition hover:text-emerald-600"
        >
          <span aria-hidden="true">
            ←
          </span>

          로그인으로 돌아가기
        </Link>

        {/* =====================================================
            회원가입 카드
           ===================================================== */}
        <div className="overflow-hidden rounded-[32px] border border-white bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">

          {/* 상단 브랜드 영역 */}
          <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-violet-50 px-6 py-7 text-center sm:px-8 sm:py-8">

            {/* Memory Jar 아이콘 */}
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-white shadow-sm ring-1 ring-emerald-100">
              <MemoryJarLogoIcon className="h-12 w-12" />
            </div>

            <p className="mt-4 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600">
              Memory Jar
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">
              새로운 추억을 시작해요
            </h1>

            <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-6 text-slate-500">
              사용할 계정 정보와 이메일을 입력하면
              Memory Jar를 바로 시작할 수 있어요.
            </p>
          </div>

          {/* =====================================================
              회원가입 입력 폼
             ===================================================== */}
          <form
            onSubmit={handleSubmit}
            className="space-y-6 px-6 py-7 sm:px-8 sm:py-8"
          >

            {/* ===================================================
                아이디
               =================================================== */}
            <div>
              <label
                htmlFor="signup-login-id"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                아이디
              </label>

              <div className="flex gap-2">
                <input
                  id="signup-login-id"
                  type="text"
                  value={loginId}
                  onChange={(event) => {
                    /*
                     * 아이디 정책상 대문자를 사용하지 않으므로
                     * 입력하는 순간 소문자로 바꿔준다.
                     */
                    const nextLoginId =
                      event.target.value.toLowerCase();

                    setLoginId(nextLoginId);

                    /*
                     * 매우 중요:
                     *
                     * 예를 들어 memory_user를 중복 확인한 뒤
                     * 사용자가 memory_user2로 수정했다면
                     *
                     * memory_user에 대한 확인 결과를
                     * 그대로 사용할 수 없다.
                     *
                     * 따라서 입력값이 바뀔 때마다
                     * 이전 중복 확인 결과를 무효화한다.
                     */
                    setLoginIdCheckStatus("idle");
                    setLoginIdCheckMessage("");

                    setGuideMessage("");
                  }}
                  autoComplete="username"
                  placeholder="memory_user"
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                />

                <button
                  type="button"
                  onClick={handleCheckLoginId}

                  /*
                   * 서버 확인 중에는 여러 번 누르지 못하게 막는다.
                   *
                   * 사용자가 빠르게 10번 눌러서
                   * 같은 요청이 여러 번 나가는 것을 방지한다.
                   */
                  disabled={
                    loginIdCheckStatus ===
                    "checking"
                  }

                  className={[
                    "shrink-0 rounded-2xl border px-4 py-3 text-sm font-black transition",

                    loginIdCheckStatus ===
                    "checking"
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"

                      : loginIdCheckStatus ===
                          "available"
                        ? "border-emerald-300 bg-emerald-100 text-emerald-700"

                        : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                  ].join(" ")}
                >
                  {loginIdCheckStatus ===
                  "checking"
                    ? "확인 중..."
                    : loginIdCheckStatus ===
                        "available"
                      ? "확인 완료"
                      : "중복 확인"}
                </button>
              </div>

              {/*
               * 아이디 형식 안내
               *
               * 밑줄(_)이 반드시 들어가야 하는 것처럼
               * 보이지 않도록 "사용할 수 있습니다"라고
               * 선택 사항임을 명확하게 알려준다.
               */}
              <p className="mt-2 text-xs font-medium leading-5 text-slate-400">
                4~20자의 영문 소문자와 숫자를 사용해 주세요.
                밑줄(_)도 사용할 수 있습니다.
              </p>
              {/*
               * 아이디 중복 확인 결과
               */}
              {loginIdCheckMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={[
                    "mt-1.5 text-xs font-bold leading-5",

                    /*
                     * 사용 가능하면 초록색
                     */
                    loginIdCheckStatus ===
                    "available"
                      ? "text-emerald-600"

                      /*
                       * 확인 중이면 회색
                       */
                      : loginIdCheckStatus ===
                          "checking"
                        ? "text-slate-400"

                        /*
                         * 나머지 오류/중복은 빨간색
                         */
                        : "text-rose-500",
                  ].join(" ")}
                >
                  {loginIdCheckMessage}
                </p>
              )}
            </div>

            {/* ===================================================
                비밀번호
               =================================================== */}
            <div>
              <label
                htmlFor="signup-password"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                비밀번호
              </label>

              {/*
               * 비밀번호 입력창 + 눈 버튼
               *
               * showPassword가:
               *
               * false → 비밀번호를 ••••• 형태로 숨김
               * true  → 실제 입력한 글자를 보여줌
               */}
              <div className="relative">

                <input
                  id="signup-password"

                  /*
                   * 눈 버튼 상태에 따라
                   * input type을 바꾼다.
                   */
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }

                  value={password}

                  onChange={(event) => {
                    setPassword(
                      event.target.value
                    );

                    /*
                     * 사용자가 비밀번호를 수정하면
                     * 이전 회원가입 오류 상태를 초기화한다.
                     */
                    setSignupStatus("idle");
                    setGuideMessage("");
                  }}

                  autoComplete="new-password"

                  placeholder="비밀번호를 입력해 주세요."

                  /*
                   * pr-12:
                   *
                   * 오른쪽에 눈 버튼이 들어가기 때문에
                   * 입력한 글자가 눈 아이콘과 겹치지 않도록
                   * 오른쪽 여백을 넉넉하게 준다.
                   */
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-4 pr-12 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                />


                {/*
                 * 비밀번호 보기 / 숨기기 버튼
                 *
                 * type="button"이 매우 중요하다.
                 *
                 * 이 버튼이 회원가입 form 안에 있기 때문에
                 * type을 지정하지 않으면
                 * 실수로 회원가입 submit 버튼처럼 동작할 수 있다.
                 */}
                <button
                  type="button"

                  onClick={() => {
                    setShowPassword(
                      (previous) =>
                        !previous
                    );
                  }}

                  aria-label={
                    showPassword
                      ? "비밀번호 숨기기"
                      : "비밀번호 보기"
                  }

                  title={
                    showPassword
                      ? "비밀번호 숨기기"
                      : "비밀번호 보기"
                  }

                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                >

                  <PasswordVisibilityIcon
                    visible={showPassword}
                  />

                </button>

              </div>
              {/*
               * 비밀번호 조건 안내
               *
               * 사용자가 입력할 때마다 조건 충족 여부가
               * 바로 화면에 표시된다.
               */}
              <div className="mt-2 space-y-1">

                {/* 8~100자 조건 */}
                <p
                  className={[
                    "text-xs font-bold leading-5 transition",

                    /*
                     * 아직 아무것도 입력하지 않았다면 회색,
                     * 조건을 만족하면 초록색,
                     * 입력했지만 조건을 만족하지 못하면 빨간색.
                     */
                    !password
                      ? "text-slate-400"
                      : isPasswordLengthValid
                        ? "text-emerald-600"
                        : "text-rose-500",
                  ].join(" ")}
                >
                  {password && isPasswordLengthValid
                    ? "✓"
                    : "•"}{" "}
                  8~100자로 입력해 주세요.
                </p>

                {/*
                 * 영문 조건
                 *
                 * 영문이 하나라도 들어오면
                 * 초록색 체크 표시로 바뀐다.
                 */}
                <p
                  className={[
                    "text-xs font-bold leading-5 transition",

                    !password
                      ? "text-slate-400"
                      : passwordHasLetter
                        ? "text-emerald-600"
                        : "text-rose-500",
                  ].join(" ")}
                >
                  {password && passwordHasLetter
                    ? "✓"
                    : "•"}{" "}
                  영문을 1자 이상 포함해 주세요.
                </p>

                {/*
                 * 숫자 조건
                 */}
                <p
                  className={[
                    "text-xs font-bold leading-5 transition",

                    !password
                      ? "text-slate-400"
                      : passwordHasNumber
                        ? "text-emerald-600"
                        : "text-rose-500",
                  ].join(" ")}
                >
                  {password && passwordHasNumber
                    ? "✓"
                    : "•"}{" "}
                  숫자를 1자 이상 포함해 주세요.
                </p>

                {/*
                 * 특수문자 조건
                 */}
                <p
                  className={[
                    "text-xs font-bold leading-5 transition",

                    !password
                      ? "text-slate-400"
                      : passwordHasSpecialCharacter
                        ? "text-emerald-600"
                        : "text-rose-500",
                  ].join(" ")}
                >
                  {password &&
                  passwordHasSpecialCharacter
                    ? "✓"
                    : "•"}{" "}
                  특수문자를 1자 이상 포함해 주세요.
                </p>
              </div>
            </div>

            {/* ===================================================
                비밀번호 확인
               =================================================== */}
            <div>
              <label
                htmlFor="signup-password-confirm"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                비밀번호 확인
              </label>

              {/*
               * 비밀번호 확인 입력창 + 눈 버튼
               */}
              <div className="relative">

                <input
                  id="signup-password-confirm"

                  /*
                   * 비밀번호 확인은
                   * showPasswordConfirm 상태를 따로 사용한다.
                   *
                   * 그래서 첫 번째 비밀번호 눈 버튼과
                   * 서로 독립적으로 동작한다.
                   */
                  type={
                    showPasswordConfirm
                      ? "text"
                      : "password"
                  }

                  value={passwordConfirm}

                  onChange={(event) => {
                    setPasswordConfirm(
                      event.target.value
                    );

                    setGuideMessage("");
                  }}

                  autoComplete="new-password"

                  placeholder="비밀번호를 한 번 더 입력해 주세요."

                  className={[
                    /*
                     * 오른쪽 눈 아이콘 때문에
                     * pr-12를 사용한다.
                     */
                    "w-full rounded-2xl border bg-white py-3.5 pl-4 pr-12 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:ring-4",

                    passwordMismatch
                      ? "border-rose-300 focus:border-rose-300 focus:ring-rose-100"
                      : "border-slate-200 focus:border-emerald-300 focus:ring-emerald-100/70",

                  ].join(" ")}
                />


                {/*
                 * 비밀번호 확인 보기 / 숨기기
                 */}
                <button
                  type="button"

                  onClick={() => {
                    setShowPasswordConfirm(
                      (previous) =>
                        !previous
                    );
                  }}

                  aria-label={
                    showPasswordConfirm
                      ? "비밀번호 확인 숨기기"
                      : "비밀번호 확인 보기"
                  }

                  title={
                    showPasswordConfirm
                      ? "비밀번호 확인 숨기기"
                      : "비밀번호 확인 보기"
                  }

                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                >

                  <PasswordVisibilityIcon
                    visible={
                      showPasswordConfirm
                    }
                  />

                </button>

              </div>

              {/*
               * 비밀번호 확인 결과
               *
               * 아직 입력하지 않았다면 아무것도 보여주지 않고,
               * 입력한 뒤에는 일치 / 불일치를 바로 알려준다.
               */}
              {passwordConfirm && (
                <p
                  role="status"
                  aria-live="polite"
                  className={[
                    "mt-2 text-xs font-bold",

                    isPasswordMatched
                      ? "text-emerald-600"
                      : "text-rose-500",
                  ].join(" ")}
                >
                  {isPasswordMatched
                    ? "✓ 비밀번호가 일치해요."
                    : "비밀번호가 서로 일치하지 않아요."}
                </p>
              )}
            </div>

            {/* ===================================================
                닉네임
               =================================================== */}
            <div>
              <label
                htmlFor="signup-nickname"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                닉네임
              </label>

              <input
                id="signup-nickname"
                type="text"

                value={nickname}

                /*
                 * 영어/숫자는 최대 16글자이므로
                 * HTML에서도 일단 16글자를 넘지 못하게 막는다.
                 *
                 * 한글 8자 제한은
                 * nicknameValidation에서 별도로 계산한다.
                 */
                maxLength={16}

                onChange={(event) => {

                  setNickname(
                    event.target.value
                  );

                  /*
                   * 닉네임을 수정하면
                   * 이전 공통 안내 문구를 지운다.
                   */
                  setGuideMessage("");
                }}

                autoComplete="nickname"

                placeholder="Memory Jar에서 보여줄 이름"

                className={[
                  "w-full rounded-2xl border bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:ring-4",

                  /*
                   * 아무것도 입력하지 않았을 때는 기본 테두리.
                   *
                   * 입력했는데 규칙에 맞지 않으면 빨간색.
                   *
                   * 사용할 수 있으면 민트색.
                   */
                  !nickname
                    ? "border-slate-200 focus:border-emerald-300 focus:ring-emerald-100/70"

                    : nicknameValidation.valid
                      ? "border-emerald-300 focus:border-emerald-300 focus:ring-emerald-100/70"

                      : "border-rose-300 focus:border-rose-300 focus:ring-rose-100",

                ].join(" ")}
              />


              {/*
               * 사용자가 닉네임을 입력하기 시작하면
               * 현재 닉네임이 사용 가능한지 바로 알려준다.
               */}
              {nickname && (

                <p
                  role="status"
                  aria-live="polite"

                  className={[
                    "mt-2 text-xs font-bold leading-5",

                    nicknameValidation.valid
                      ? "text-emerald-600"
                      : "text-rose-500",

                  ].join(" ")}
                >
                  {nicknameValidation.message}
                </p>

              )}


              {/*
               * 닉네임 기본 규칙 안내
               */}
              <p className="mt-1.5 text-xs font-medium leading-5 text-slate-400">
                한글은 최대 8자, 영문과 숫자는 최대 16자까지 사용할 수 있어요.
                특수문자와 공백은 사용할 수 없습니다.
              </p>


              <p className="mt-1 text-xs font-medium text-slate-400">
                다른 사용자와 같은 닉네임도 사용할 수 있어요.
              </p>
            </div>

            {/* ===================================================
                이메일
               =================================================== */}
            <div>
              <label
                htmlFor="signup-email"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                이메일
              </label>

              <div className="flex gap-2">
                <input
                  id="signup-email"
                  type="email"
                  value={email}

                  /*
                   * 이메일 인증이 완료된 뒤에는
                   * 인증받은 주소가 실수로 변경되지 않도록 잠근다.
                   */
                  disabled={isEmailVerified}

                  onChange={(event) => {
                    const nextEmail =
                      event.target.value;

                    setEmail(nextEmail);

                    /*
                     * 이메일 주소 자체가 바뀌었다면
                     * 이전 이메일로 받은 인증번호는 더 이상 유효한
                     * 화면 상태로 취급하면 안 된다.
                     */
                    setEmailSendStatus("idle");
                    setEmailSendMessage("");

                    /*
                     * 기존 만료 타이머 초기화
                     */
                    setVerificationExpiresAt(null);
                    setVerificationRemainingSeconds(0);

                    /*
                     * 재전송 제한 역시 새 이메일에는 적용하지 않는다.
                     */
                    setResendRemainingSeconds(0);

                    /*
                     * 이전 이메일에서 받은 인증번호도 지운다.
                     */
                    setVerificationCode("");

                    /*
                     * 이전 이메일에 대한 인증 완료 상태와
                     * 회원가입용 verificationToken도 모두 제거한다.
                     */
                    setVerificationStatus("idle");
                    setVerificationMessage("");
                    setVerificationToken("");

                    /*
                     * 이메일이 달라졌으므로
                     * 이전 이메일의 계정 정보도 모두 무효화한다.
                     */
                    resetExistingAccountInfo();

                    setGuideMessage("");
                  }}
                  autoComplete="email"
                  placeholder="example@email.com"
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />

                <button
                  type="button"
                  onClick={
                    handleSendVerificationCode
                  }

                  /*
                   * 메일을 보내고 있는 동안
                   * 또는 재전송 대기시간 동안은
                   * 다시 누르지 못하게 한다.
                   */
                  disabled={
                    /*
                     * 이메일 인증이 이미 끝났다면
                     * 새로운 인증번호를 받을 필요가 없다.
                     */
                    isEmailVerified ||

                    /*
                     * 현재 이메일 전송 중
                     */
                    emailSendStatus ===
                      "sending" ||

                    /*
                     * 재전송 제한 시간
                     */
                    resendRemainingSeconds > 0
                  }

                  className={[
                    "shrink-0 rounded-2xl border px-3.5 py-3 text-sm font-black transition sm:px-4",

                    isEmailVerified ||
                    emailSendStatus ===
                      "sending" ||
                    resendRemainingSeconds > 0
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                  ].join(" ")}
                >
                  {/*
                   * 이메일 상태에 따라
                   * 버튼 문구도 함께 바꾼다.
                   */}
                  {isEmailVerified
                    ? "인증 완료"

                    : emailSendStatus ===
                        "sending"
                      ? "전송 중..."

                      : resendRemainingSeconds > 0
                        ? `재전송 ${resendRemainingSeconds}초`

                        : emailSendStatus ===
                            "sent"
                          ? "다시 받기"

                          : "인증번호 받기"}
                </button>
              </div>

              <p className="mt-2 text-xs font-medium leading-5 text-slate-400">
                회원가입과 계정 복구에 사용할 이메일이에요.
              </p>
              {emailSendMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={[
                    "mt-1.5 text-xs font-bold leading-5",

                    emailSendStatus ===
                    "sent"
                      ? "text-emerald-600"

                      : emailSendStatus ===
                          "sending"
                        ? "text-slate-400"

                        : "text-rose-500",
                  ].join(" ")}
                >
                  {emailSendMessage}
                </p>
              )}
            </div>

            {/* ===================================================
                이메일 인증번호
               =================================================== */}
            <div>
              <label
                htmlFor="signup-verification-code"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                인증번호
              </label>

              <div className="flex gap-2">
                <input
                  id="signup-verification-code"
                  type="text"
                  value={verificationCode}

                  disabled={
                    /*
                     * 인증번호를 아직 받지 않았거나
                     */
                    emailSendStatus !== "sent" ||

                    /*
                     * 인증번호가 만료됐거나
                     */
                    verificationRemainingSeconds <=
                      0 ||

                    /*
                     * 이미 인증을 완료했다면
                     * 더 이상 번호를 수정하지 못하게 한다.
                     */
                    verificationStatus ===
                      "verified"
                  }

                  onChange={(event) => {
                    /*
                     * 숫자만 최대 6자리까지 입력
                     */
                    const onlyNumbers =
                      event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 6);

                    setVerificationCode(
                      onlyNumbers
                    );

                    /*
                     * 사용자가 번호를 다시 수정하고 있다면
                     * 이전 실패 문구는 지워준다.
                     *
                     * 이미 인증 완료된 상태에서는 input 자체가
                     * 아래에서 disabled 되기 때문에 이 코드가 실행되지 않는다.
                     */
                    if (
                      verificationStatus !==
                      "verified"
                    ) {
                      setVerificationStatus("idle");
                      setVerificationMessage("");
                      setVerificationToken("");
                    }

                    setGuideMessage("");
                  }}

                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6자리 입력"

                  className={[
                    "min-w-0 flex-1 rounded-2xl border px-4 py-3.5 text-sm font-bold tracking-[0.18em] outline-none transition placeholder:tracking-normal placeholder:text-slate-300",

                    emailSendStatus !== "sent" ||
                    verificationRemainingSeconds <= 0 ||
                    verificationStatus === "verified"
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"

                      : "border-slate-200 bg-white text-slate-800 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70",
                  ].join(" ")}
                />

                <button
                  type="button"
                  onClick={
                    handleConfirmVerificationCode
                  }

                  /*
                   * 인증번호 확인 버튼 비활성 조건
                   */
                  disabled={
                    emailSendStatus !== "sent" ||
                    verificationRemainingSeconds <= 0 ||
                    verificationCode.length !== 6 ||
                    verificationStatus ===
                      "verifying" ||
                    verificationStatus ===
                      "verified"
                  }

                  className={[
                    "shrink-0 rounded-2xl border px-5 py-3 text-sm font-black transition",

                    /*
                     * 인증 성공 상태는 초록색으로 보여준다.
                     */
                    verificationStatus ===
                    "verified"
                      ? "cursor-default border-emerald-300 bg-emerald-100 text-emerald-700"

                      : emailSendStatus !==
                          "sent" ||
                        verificationRemainingSeconds <=
                          0 ||
                        verificationCode.length !==
                          6 ||
                        verificationStatus ===
                          "verifying"
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"

                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700",
                  ].join(" ")}
                >
                  {verificationStatus ===
                  "verifying"
                    ? "확인 중..."

                    : verificationStatus ===
                        "verified"
                      ? "인증 완료"

                      : "확인"}
                </button>
              </div>

              {/*
               * =========================================================
               * 이미 가입된 이메일 안내
               * =========================================================
               *
               * 이메일 인증번호 확인까지 성공했고
               * 서버가 existingAccount=true를 내려준 경우에만 보인다.
               *
               * 이 화면이 보일 때는 아래쪽
               * "Memory Jar 시작하기" 버튼은 숨긴다.
               */}
              {isEmailVerified &&
                existingAccount && (

                <div className="rounded-[24px] border border-amber-100 bg-amber-50/70 p-4">

                  <p className="text-sm font-black text-slate-800">
                    이미 가입된 이메일이에요.
                  </p>

                  <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                    기존에 사용하던 로그인 방법으로 계속해 주세요.
                  </p>


                  <div className="mt-4 grid gap-2">

                    {/* ================================================
                        LOCAL 로그인
                       ================================================ */}
                    {existingLoginMethods.includes(
                      "LOCAL"
                    ) && (

                      <Link
                        to="/"
                        className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-50"
                      >
                        아이디로 로그인
                      </Link>
                    )}


                    {/* ================================================
                        NAVER 로그인
                       ================================================ */}
                    {existingLoginMethods.includes(
                      "NAVER"
                    ) && (

                      <button
                        type="button"
                        onClick={() =>
                          handleExistingOAuthLogin(
                            "naver"
                          )
                        }
                        disabled={
                          Boolean(
                            redirectingProvider
                          )
                        }
                        className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-2xl bg-[#03C75A] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                      >
                        <span className="text-base font-black">
                          N
                        </span>

                        <span>
                          {redirectingProvider ===
                          "naver"
                            ? "네이버로 이동 중..."
                            : "네이버로 로그인"}
                        </span>
                      </button>
                    )}


                    {/* ================================================
                        GOOGLE 로그인
                       ================================================ */}
                    {existingLoginMethods.includes(
                      "GOOGLE"
                    ) && (

                      <button
                        type="button"
                        onClick={() =>
                          handleExistingOAuthLogin(
                            "google"
                          )
                        }
                        disabled={
                          Boolean(
                            redirectingProvider
                          )
                        }
                        className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                      >
                        {/*
                         * 현재 회원가입 화면에서는
                         * 작은 G 문자로 로그인 종류를 표시한다.
                         *
                         * 이후 원하면 LoginJarCard의
                         * 4색 GoogleLogo를 공용 아이콘 컴포넌트로
                         * 분리해서 완전히 같은 디자인으로 맞출 수 있다.
                         */}
                        <span className="text-base font-black text-blue-500">
                          G
                        </span>

                        <span>
                          {redirectingProvider ===
                          "google"
                            ? "Google로 이동 중..."
                            : "Google로 로그인"}
                        </span>
                      </button>
                    )}


                    {/* ================================================
                        KAKAO 로그인
                       ================================================ */}
                    {existingLoginMethods.includes(
                      "KAKAO"
                    ) && (

                      <button
                        type="button"
                        onClick={() =>
                          handleExistingOAuthLogin(
                            "kakao"
                          )
                        }
                        disabled={
                          Boolean(
                            redirectingProvider
                          )
                        }
                        className="flex min-h-[48px] w-full items-center justify-center gap-3 rounded-2xl bg-[#FEE500] px-4 py-3 text-sm font-black text-[#191919] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                      >
                        <span aria-hidden="true">
                          💬
                        </span>

                        <span>
                          {redirectingProvider ===
                          "kakao"
                            ? "카카오로 이동 중..."
                            : "카카오로 로그인"}
                        </span>
                      </button>
                    )}


                    {/* ================================================
                        로그인 방법을 찾지 못한 경우
                       ================================================

                       soft delete 계정처럼
                       이메일 사용 기록은 있지만
                       현재 활성 로그인 방법이 없는 경우를 위한
                       안전한 빠져나가기 버튼이다.
                     */}
                    {existingLoginMethods.length ===
                      0 && (

                      <Link
                        to="/"
                        className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        로그인 화면으로 돌아가기
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/*
               * 다음 단계에서 인증번호가 발송되면
               * 여기에 05:00 → 04:59 형태의 타이머를 붙인다.
               */}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-400">
                  이메일로 받은 6자리 번호를 입력해 주세요.
                </span>

                <span
                  className={[
                    "font-bold",

                    verificationStatus ===
                    "verified"
                      ? "text-emerald-600"

                      : emailSendStatus === "sent" &&
                          verificationRemainingSeconds >
                            0
                        ? "text-emerald-600"

                        : emailSendStatus ===
                            "sent"
                          ? "text-rose-500"

                          : "text-slate-400",
                  ].join(" ")}
                >
                  {verificationStatus ===
                  "verified"
                    ? "인증 완료"

                    : emailSendStatus ===
                        "sent"
                      ? formatRemainingTime(
                          verificationRemainingSeconds
                        )

                      : "--:--"}
                </span>
              </div>
              {/*
               * 인증번호 확인 결과
               */}
              {verificationMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={[
                    "mt-2 text-xs font-bold leading-5",

                    verificationStatus ===
                    "verified"
                      ? "text-emerald-600"

                      : verificationStatus ===
                          "verifying"
                        ? "text-slate-400"

                        : "text-rose-500",
                  ].join(" ")}
                >
                  {verificationMessage}
                </p>
              )}
            </div>

            {/* ===================================================
                현재 단계 안내 문구
               =================================================== */}
            {guideMessage && (
              <div
                role="status"
                aria-live="polite"

                className={[
                  "rounded-2xl border px-4 py-3 text-sm font-bold leading-5",

                  /*
                   * 회원가입 오류일 때는
                   * 빨간 계열 안내 박스
                   */
                  signupStatus === "error"
                    ? "border-rose-100 bg-rose-50/80 text-rose-600"

                    /*
                     * 회원가입 진행 중이거나
                     * 일반 안내는 Memory Jar 민트색
                     */
                    : "border-emerald-100 bg-emerald-50/70 text-emerald-700",
                ].join(" ")}
              >
                {guideMessage}
              </div>
            )}

            {/*
             * 기존 계정이면:
             *
             * 소셜/LOCAL 로그인 선택지만 보여준다.
             *
             * 신규 계정이면:
             *
             * Memory Jar 시작하기 버튼을 보여준다.
             */}
            {!existingAccount && (

              <button
                type="submit"

                /*
                 * 모든 회원가입 조건 완료 전이거나
                 * 이미 서버 요청 중이면 클릭할 수 없다.
                 */
                disabled={
                  !canSubmitSignup ||
                  signupStatus ===
                    "submitting"
                }

                className={[
                  "w-full rounded-[20px] px-5 py-4 text-sm font-black transition",

                  canSubmitSignup &&
                  signupStatus !==
                    "submitting"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-200/60 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-200/70 active:translate-y-0"
                    : "cursor-not-allowed bg-slate-200 text-slate-400 shadow-none",
                ].join(" ")}
              >
                {signupStatus ===
                "submitting"
                  ? "Memory Jar 계정 만드는 중..."
                  : "Memory Jar 시작하기"}
              </button>
            )}

            {/* 이미 계정이 있는 사용자 */}
            <p className="text-center text-sm font-medium text-slate-500">
              이미 Memory Jar 계정이 있나요?{" "}

              <Link
                to="/"
                className="font-black text-emerald-600 transition hover:text-emerald-700"
              >
                로그인
              </Link>
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}