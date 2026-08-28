// src/pages/SignupPage.jsx

import {
  useEffect,
  useState,
} from "react";
import { Link } from "react-router-dom";
import MemoryJarLogoIcon from "../components/icons/MemoryJarLogoIcon";

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
   * 이번 단계에서는 아직 API를 호출하지 않으므로
   * 버튼을 눌렀을 때 "다음 단계에서 연결" 안내만 보여준다.
   *
   * 다음 단계에서 실제 성공/실패 메시지 상태로 바꿀 거야.
   */
  const [guideMessage, setGuideMessage] =
    useState("");

  /*
   * 비밀번호와 비밀번호 확인 값이 모두 입력된 상태에서
   * 서로 다른지 확인한다.
   */
  const passwordMismatch =
    Boolean(password) &&
    Boolean(passwordConfirm) &&
    password !== passwordConfirm;

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
        "아이디는 영문 소문자, 숫자, 밑줄(_)을 사용해 4~20자로 입력해 주세요."
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
   * 성공하면 서버에서 회원가입에 사용할
   * verificationToken을 내려준다.
   */
  async function handleConfirmVerificationCode() {
    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    /*
     * 이메일 발송 자체가 성공하지 않았다면
     * 인증번호 확인을 진행할 수 없다.
     */
    if (
      emailSendStatus !== "sent"
    ) {
      setVerificationStatus("error");

      setVerificationMessage(
        "먼저 이메일 인증번호를 받아 주세요."
      );

      return;
    }

    /*
     * 인증번호가 이미 만료된 경우
     * 서버까지 불필요한 요청을 보내지 않는다.
     */
    if (
      verificationRemainingSeconds <=
      0
    ) {
      setVerificationStatus("error");

      setVerificationMessage(
        "인증번호가 만료됐어요. 인증번호를 다시 받아 주세요."
      );

      return;
    }

    /*
     * 인증번호는 정확히 숫자 6자리여야 한다.
     */
    if (
      !/^\d{6}$/.test(
        verificationCode
      )
    ) {
      setVerificationStatus("error");

      setVerificationMessage(
        "이메일로 받은 인증번호 6자리를 입력해 주세요."
      );

      return;
    }

    /*
     * 서버 확인 시작
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
       * 실제 요청:
       *
       * POST
       * /api/v1/auth/email-verifications/confirm
       *
       * Body:
       *
       * {
       *   "email": "user@example.com",
       *   "code": "123456"
       * }
       */
      const result =
        await confirmSignupEmailVerification({
          email: normalizedEmail,
          code: verificationCode,
        });

      /*
       * 인증 성공 시 서버가 회원가입에서 사용할
       * verificationToken을 내려줘야 한다.
       */
      const token =
        result?.verificationToken;

      /*
       * 인증 성공 응답인데 토큰이 없다면
       * 정상적인 인증 완료로 처리하면 안 된다.
       */
      if (!token) {
        throw new Error(
          "이메일 인증 토큰을 확인하지 못했어요."
        );
      }

      /*
       * 인증 성공
       */
      setVerificationStatus(
        "verified"
      );

      setVerificationMessage(
        "이메일 인증이 완료됐어요."
      );

      /*
       * 6단계 회원가입에서 사용할
       * 일회성 토큰을 React 상태에 보관한다.
       */
      setVerificationToken(
        token
      );
    } catch (error) {
      /*
       * 실패한 경우 기존 토큰은 절대 남겨두지 않는다.
       */
      setVerificationStatus(
        "error"
      );

      setVerificationToken("");

      setVerificationMessage(
        getAuthErrorMessage(
          error,
          "인증번호를 확인하지 못했어요. 번호를 다시 확인해 주세요."
        )
      );
    }
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

              <p className="mt-2 text-xs font-medium leading-5 text-slate-400">
                영문 소문자, 숫자, 밑줄(_)을 사용해
                4~20자로 입력해 주세요.
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

              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(
                    event.target.value
                  );

                  /*
                   * 사용자가 입력값을 다시 수정하기 시작하면
                   * 이전 회원가입 실패 상태를 초기화한다.
                   */
                  setSignupStatus("idle");
                  setGuideMessage("");
                }}
                autoComplete="new-password"
                placeholder="비밀번호를 입력해 주세요."
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
              />
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

              <input
                id="signup-password-confirm"
                type="password"
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
                  "w-full rounded-2xl border bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:ring-4",
                  passwordMismatch
                    ? "border-rose-300 focus:border-rose-300 focus:ring-rose-100"
                    : "border-slate-200 focus:border-emerald-300 focus:ring-emerald-100/70",
                ].join(" ")}
              />

              {passwordMismatch && (
                <p className="mt-2 text-xs font-bold text-rose-500">
                  비밀번호가 서로 일치하지 않아요.
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
                onChange={(event) => {
                  setNickname(event.target.value);
                  setGuideMessage("");
                }}
                autoComplete="nickname"
                placeholder="Memory Jar에서 보여줄 이름"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
              />

              <p className="mt-2 text-xs font-medium text-slate-400">
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

                    setGuideMessage("");
                  }}
                  autoComplete="email"
                  placeholder="example@email.com"
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
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
                    emailSendStatus ===
                      "sending" ||
                    resendRemainingSeconds > 0
                  }

                  className={[
                    "shrink-0 rounded-2xl border px-3.5 py-3 text-sm font-black transition sm:px-4",

                    emailSendStatus ===
                      "sending" ||
                    resendRemainingSeconds > 0
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"

                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                  ].join(" ")}
                >
                  {emailSendStatus ===
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

            {/* ===================================================
                최종 회원가입 버튼
               =================================================== */}
            <button
              type="submit"

              /*
               * 회원가입 요청 중에는 버튼을 막는다.
               *
               * 회원가입은 DB에 실제 사용자를 생성하는 요청이므로
               * 같은 요청이 중복으로 들어가지 않도록 하는 것이 중요하다.
               */
              disabled={
                signupStatus ===
                "submitting"
              }

              className={[
                "w-full rounded-[20px] px-5 py-4 text-sm font-black transition",

                signupStatus ===
                "submitting"
                  ? "cursor-not-allowed bg-slate-200 text-slate-500"

                  : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-200/60 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-200/70 active:translate-y-0",
              ].join(" ")}
            >
              {signupStatus ===
              "submitting"
                ? "계정을 만들고 있어요..."

                : "Memory Jar 시작하기"}
            </button>

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