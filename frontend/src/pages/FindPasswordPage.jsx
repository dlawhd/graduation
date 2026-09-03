// src/pages/FindPasswordPage.jsx

import {
  useEffect,
  useState,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import MemoryJarLogoIcon
  from "../components/icons/MemoryJarLogoIcon";

import {
  checkPasswordResetLoginId,
  sendPasswordResetEmailVerification,
  confirmPasswordResetEmailVerification,
  resetLocalPassword,
  getAuthErrorMessage,
} from "../api/authApi";

/*
 * 백엔드 KST LocalDateTime을
 * JavaScript가 계산할 수 있는 시간으로 바꾼다.
 *
 * 예:
 * 2026-09-03T20:10:00
 *      ↓
 * 2026-09-03T20:10:00+09:00
 */
function parseKstDateTime(
  dateTime
) {
  if (!dateTime) {
    return null;
  }

  const millisecondsNormalized =
    dateTime.replace(
      /(\.\d{3})\d+/,
      "$1"
    );

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
 * 남은 초를 MM:SS 형태로 보여준다.
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
 * 비밀번호 보기 / 숨기기 버튼에서 사용하는 눈 아이콘.
 *
 * SignupPage와 같은 방식으로 동작한다.
 */
function PasswordVisibilityIcon({
  visible,
}) {
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
 * FindPasswordPage 역할
 *
 * Memory Jar LOCAL 계정의 비밀번호를 잊은 사용자가
 * 아이디 확인 → 가입 이메일 인증 → 새 비밀번호 설정
 * 순서로 비밀번호를 재설정하는 페이지다.
 *
 * 전체 흐름:
 *
 * 1. LOCAL 아이디 확인
 * 2. 해당 아이디에 연결된 이메일 직접 입력
 * 3. 이메일 인증번호 발송
 * 4. 05:00 안에 6자리 인증번호 확인
 * 5. 1회용 passwordResetToken 발급
 * 6. 새 비밀번호 + 확인 입력
 * 7. 비밀번호 변경
 * 8. 기존 Refresh Token 전체 폐기
 * 9. 로그인 화면으로 이동
 *
 * 중요한 보안 원칙:
 *
 * passwordResetToken은 localStorage/sessionStorage에 저장하지 않고
 * 이 페이지의 React state에만 잠시 보관한다.
 */
export default function FindPasswordPage() {
  const navigate =
    useNavigate();

  /*
   * =========================================================
   * 1단계: LOCAL 아이디 확인
   * =========================================================
   */
  const [loginId, setLoginId] =
    useState("");

  const [loginIdStatus, setLoginIdStatus] =
    useState("idle");

  const [loginIdMessage, setLoginIdMessage] =
    useState("");

  /*
   * =========================================================
   * 2단계: 이메일 인증번호 발송
   * =========================================================
   */
  const [email, setEmail] =
    useState("");

  const [emailSendStatus, setEmailSendStatus] =
    useState("idle");

  const [emailSendMessage, setEmailSendMessage] =
    useState("");

  const [verificationExpiresAt, setVerificationExpiresAt] =
    useState(null);

  const [verificationRemainingSeconds, setVerificationRemainingSeconds] =
    useState(0);

  const [resendRemainingSeconds, setResendRemainingSeconds] =
    useState(0);

  /*
   * =========================================================
   * 3단계: 이메일 인증번호 확인
   * =========================================================
   */
  const [verificationCode, setVerificationCode] =
    useState("");

  const [verificationStatus, setVerificationStatus] =
    useState("idle");

  const [verificationMessage, setVerificationMessage] =
    useState("");

  /*
   * 인증 성공 뒤 서버가 발급한 1회용 Token이다.
   *
   * 새 비밀번호 변경 API를 호출할 때만 사용한다.
   */
  const [passwordResetToken, setPasswordResetToken] =
    useState("");

  const [passwordResetExpiresAt, setPasswordResetExpiresAt] =
    useState(null);

  /*
   * =========================================================
   * 4단계: 새 비밀번호
   * =========================================================
   */
  const [newPassword, setNewPassword] =
    useState("");

  const [newPasswordConfirm, setNewPasswordConfirm] =
    useState("");

  const [showNewPassword, setShowNewPassword] =
    useState(false);

  const [showNewPasswordConfirm, setShowNewPasswordConfirm] =
    useState(false);

  const [resetStatus, setResetStatus] =
    useState("idle");

  const [resetMessage, setResetMessage] =
    useState("");

  /*
   * =========================================================
   * 입력값 검증
   * =========================================================
   */

  /*
   * 백엔드 LocalAuthService와 동일한 아이디 규칙.
   *
   * - 영문 소문자
   * - 숫자
   * - 밑줄(_)
   * - 4~20자
   */
  const loginIdPattern =
    /^[a-z0-9_]{4,20}$/;

  const normalizedLoginId =
    loginId
      .trim()
      .toLowerCase();

  const isLoginIdFormatValid =
    loginIdPattern.test(
      normalizedLoginId
    );

  /*
   * 이메일은 프론트에서 1차 형식 검사만 한다.
   * 최종 검증은 백엔드가 다시 수행한다.
   */
  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const isEmailFormatValid =
    emailPattern.test(
      normalizedEmail
    );

  /*
   * 회원가입과 동일한 새 비밀번호 정책.
   */
  const isPasswordLengthValid =
    newPassword.length >= 8 &&
    newPassword.length <= 100;

  const passwordHasLetter =
    /[A-Za-z]/.test(
      newPassword
    );

  const passwordHasNumber =
    /[0-9]/.test(
      newPassword
    );

  const passwordHasSpecialCharacter =
    /[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]/.test(
      newPassword
    );

  const isPasswordValid =
    isPasswordLengthValid &&
    passwordHasLetter &&
    passwordHasNumber &&
    passwordHasSpecialCharacter;

  const isPasswordMatched =
    Boolean(
      newPasswordConfirm
    ) &&
    newPassword ===
      newPasswordConfirm;

  const passwordMismatch =
    Boolean(newPassword) &&
    Boolean(newPasswordConfirm) &&
    !isPasswordMatched;

  const isLoginIdVerified =
    loginIdStatus === "valid";

  const isEmailVerified =
    verificationStatus === "verified" &&
    Boolean(passwordResetToken);

  /*
   * 현재 어느 단계까지 완료했는지
   * 상단 진행 표시에서 사용한다.
   */
  const currentStep =
    isEmailVerified
      ? 3
      : isLoginIdVerified
        ? 2
        : 1;

  /*
   * =========================================================
   * 이메일 인증번호 05:00 타이머
   * =========================================================
   *
   * 서버가 내려준 expiresAt을 기준으로 계산한다.
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
          Math.ceil(
            remainingMilliseconds /
              1000
          )
        );

      setVerificationRemainingSeconds(
        remainingSeconds
      );

      if (
        remainingSeconds === 0 &&
        timerId
      ) {
        window.clearInterval(
          timerId
        );
      }
    }

    updateRemainingTime();

    timerId =
      window.setInterval(
        updateRemainingTime,
        1000
      );

    return () => {
      if (timerId) {
        window.clearInterval(
          timerId
        );
      }
    };
  }, [verificationExpiresAt]);

  /*
   * =========================================================
   * 인증번호 재전송 60초 타이머
   * =========================================================
   */
  useEffect(() => {
    if (
      resendRemainingSeconds <= 0
    ) {
      return undefined;
    }

    const timeoutId =
      window.setTimeout(
        () => {
          setResendRemainingSeconds(
            (current) =>
              Math.max(
                0,
                current - 1
              )
          );
        },
        1000
      );

    return () => {
      window.clearTimeout(
        timeoutId
      );
    };
  }, [resendRemainingSeconds]);

  /*
   * 아이디가 바뀌면
   * 그 아이디에 연결되어 있던 모든 하위 인증 상태를 버린다.
   */
  function resetAfterLoginIdChange() {
    setLoginIdStatus("idle");
    setLoginIdMessage("");

    setEmail("");
    setEmailSendStatus("idle");
    setEmailSendMessage("");

    setVerificationExpiresAt(null);
    setVerificationRemainingSeconds(0);
    setResendRemainingSeconds(0);
    setVerificationCode("");
    setVerificationStatus("idle");
    setVerificationMessage("");

    setPasswordResetToken("");
    setPasswordResetExpiresAt(null);

    setNewPassword("");
    setNewPasswordConfirm("");
    setResetStatus("idle");
    setResetMessage("");
  }

  /*
   * 이메일이 바뀌면
   * 이전 이메일의 인증번호/Token을 사용할 수 없도록 초기화한다.
   */
  function resetAfterEmailChange() {
    setEmailSendStatus("idle");
    setEmailSendMessage("");

    setVerificationExpiresAt(null);
    setVerificationRemainingSeconds(0);
    setResendRemainingSeconds(0);
    setVerificationCode("");
    setVerificationStatus("idle");
    setVerificationMessage("");

    setPasswordResetToken("");
    setPasswordResetExpiresAt(null);

    setNewPassword("");
    setNewPasswordConfirm("");
    setResetStatus("idle");
    setResetMessage("");
  }

  /*
   * =========================================================
   * 1단계 API
   * LOCAL 아이디가 실제 존재하는지 확인한다.
   * =========================================================
   */
  async function handleCheckLoginId() {
    if (!normalizedLoginId) {
      setLoginIdStatus("error");
      setLoginIdMessage(
        "아이디를 입력해 주세요."
      );
      return;
    }

    if (!isLoginIdFormatValid) {
      setLoginIdStatus("error");
      setLoginIdMessage(
        "아이디는 4~20자의 영문 소문자, 숫자, 밑줄(_)만 사용할 수 있어요."
      );
      return;
    }

    setLoginIdStatus("checking");
    setLoginIdMessage(
      "아이디를 확인하고 있어요."
    );

    try {
      const result =
        await checkPasswordResetLoginId(
          normalizedLoginId
        );

      if (result?.valid === true) {
        /*
         * 백엔드가 정규화한 loginId를
         * 화면 값에도 다시 반영한다.
         */
        setLoginId(
          result?.loginId ??
            normalizedLoginId
        );

        setLoginIdStatus("valid");
        setLoginIdMessage(
          "확인된 아이디예요. 가입할 때 사용한 이메일을 입력해 주세요."
        );
        return;
      }

      setLoginIdStatus("invalid");
      setLoginIdMessage(
        "등록된 자체 로그인 아이디가 아니에요."
      );
    } catch (error) {
      setLoginIdStatus("error");
      setLoginIdMessage(
        getAuthErrorMessage(
          error,
          "아이디를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
        )
      );
    }
  }

  /*
   * =========================================================
   * 2단계 API
   * loginId + email이 같은 LOCAL 계정인지 서버에서 확인한 뒤
   * 이메일 인증번호를 발송한다.
   * =========================================================
   */
  async function handleSendVerificationCode() {
    if (!isLoginIdVerified) {
      setEmailSendStatus("error");
      setEmailSendMessage(
        "먼저 아이디를 확인해 주세요."
      );
      return;
    }

    if (!normalizedEmail) {
      setEmailSendStatus("error");
      setEmailSendMessage(
        "가입할 때 사용한 이메일을 입력해 주세요."
      );
      return;
    }

    if (!isEmailFormatValid) {
      setEmailSendStatus("error");
      setEmailSendMessage(
        "이메일 형식을 확인해 주세요."
      );
      return;
    }

    setEmail(
      normalizedEmail
    );

    /*
     * 새 번호를 요청하면 이전 인증 결과는 버린다.
     */
    setVerificationCode("");
    setVerificationStatus("idle");
    setVerificationMessage("");
    setPasswordResetToken("");
    setPasswordResetExpiresAt(null);
    setNewPassword("");
    setNewPasswordConfirm("");
    setResetStatus("idle");
    setResetMessage("");

    setEmailSendStatus("sending");
    setEmailSendMessage(
      "인증번호를 보내고 있어요."
    );

    try {
      const result =
        await sendPasswordResetEmailVerification({
          loginId:
            normalizedLoginId,
          email:
            normalizedEmail,
        });

      const expiresAt =
        parseKstDateTime(
          result?.expiresAt
        );

      if (!expiresAt) {
        throw new Error(
          "인증번호 만료 시간을 확인하지 못했어요."
        );
      }

      setEmailSendStatus("sent");
      setEmailSendMessage(
        `${
          result?.email ??
          normalizedEmail
        }로 인증번호를 보냈어요. 메일함을 확인해 주세요.`
      );

      setVerificationExpiresAt(
        expiresAt
      );

      /*
       * 백엔드 재전송 제한과 맞춘다.
       */
      setResendRemainingSeconds(
        60
      );
    } catch (error) {
      setEmailSendStatus("error");
      setEmailSendMessage(
        getAuthErrorMessage(
          error,
          "인증번호를 보내지 못했어요. 입력한 아이디와 이메일을 다시 확인해 주세요."
        )
      );
    }
  }

  /*
   * =========================================================
   * 3단계 API
   * 이메일 인증번호를 확인하고 passwordResetToken을 받는다.
   * =========================================================
   */
  async function handleConfirmVerificationCode() {
    if (
      emailSendStatus !== "sent"
    ) {
      setVerificationStatus("error");
      setVerificationMessage(
        "먼저 이메일 인증번호를 받아 주세요."
      );
      return;
    }

    if (
      verificationRemainingSeconds <= 0
    ) {
      setVerificationStatus("error");
      setVerificationMessage(
        "인증번호가 만료됐어요. 인증번호를 다시 받아 주세요."
      );
      return;
    }

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

    setVerificationStatus("verifying");
    setVerificationMessage(
      "인증번호를 확인하고 있어요."
    );

    try {
      const result =
        await confirmPasswordResetEmailVerification({
          loginId:
            normalizedLoginId,
          email:
            normalizedEmail,
          code:
            verificationCode,
        });

      const resetToken =
        typeof result?.passwordResetToken === "string"
          ? result.passwordResetToken
          : "";

      const resetExpiresAt =
        parseKstDateTime(
          result?.expiresAt
        );

      if (
        !resetToken ||
        !resetExpiresAt
      ) {
        throw new Error(
          "비밀번호 재설정 인증 정보를 확인하지 못했어요."
        );
      }

      setPasswordResetToken(
        resetToken
      );

      setPasswordResetExpiresAt(
        resetExpiresAt
      );

      setVerificationStatus("verified");
      setVerificationMessage(
        "이메일 인증이 완료됐어요. 새 비밀번호를 입력해 주세요."
      );

      /*
       * 6자리 인증번호 단계는 끝났으므로
       * 05:00 타이머를 종료한다.
       */
      setVerificationExpiresAt(null);
      setVerificationRemainingSeconds(0);
    } catch (error) {
      setVerificationStatus("error");
      setPasswordResetToken("");
      setPasswordResetExpiresAt(null);

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
   * 4단계 API
   * 실제 새 비밀번호를 저장한다.
   * =========================================================
   */
  async function handleResetPassword(
    event
  ) {
    event.preventDefault();

    if (!isEmailVerified) {
      setResetStatus("error");
      setResetMessage(
        "먼저 이메일 인증을 완료해 주세요."
      );
      return;
    }

    /*
     * 인증 성공 Token은 백엔드에서 15분 뒤 만료된다.
     * 브라우저에서도 명백하게 만료된 상태라면
     * 불필요한 요청을 보내지 않는다.
     */
    if (
      !passwordResetExpiresAt ||
      Date.now() >=
        passwordResetExpiresAt
    ) {
      setResetStatus("error");
      setResetMessage(
        "본인 인증 시간이 만료됐어요. 인증번호를 다시 받아 주세요."
      );
      return;
    }

    if (!isPasswordValid) {
      setResetStatus("error");
      setResetMessage(
        "새 비밀번호 조건을 모두 확인해 주세요."
      );
      return;
    }

    if (!isPasswordMatched) {
      setResetStatus("error");
      setResetMessage(
        "새 비밀번호가 서로 일치하지 않아요."
      );
      return;
    }

    setResetStatus("submitting");
    setResetMessage(
      "새 비밀번호로 변경하고 있어요."
    );

    try {
      const result =
        await resetLocalPassword({
          loginId:
            normalizedLoginId,
          email:
            normalizedEmail,
          passwordResetToken,
          newPassword,
          newPasswordConfirm,
        });

      if (result?.ok !== true) {
        throw new Error(
          "비밀번호 변경 완료 응답을 확인하지 못했어요."
        );
      }

      /*
       * 성공 메시지는 로그인 화면에서 한 번 보여준다.
       *
       * 비밀번호나 Token은 저장하지 않는다.
       */
      sessionStorage.setItem(
        "passwordResetSuccessMessage",
        "비밀번호가 변경됐어요. 새 비밀번호로 로그인해 주세요."
      );

      /*
       * replace를 사용해서 뒤로가기로
       * 이미 사용한 passwordResetToken 화면으로 돌아가는 일을 줄인다.
       */
      navigate(
        "/",
        {
          replace: true,
        }
      );
    } catch (error) {
      setResetStatus("error");
      setResetMessage(
        getAuthErrorMessage(
          error,
          "비밀번호를 변경하지 못했어요. 본인 인증부터 다시 확인해 주세요."
        )
      );
    }
  }

  return (
    <section className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-gradient-to-b from-white via-emerald-50/30 to-cyan-50/40 px-4 py-8 sm:px-6 sm:py-12">
      {/* 배경 장식 */}
      <div
        className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-emerald-100/50 blur-3xl"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute -right-24 bottom-16 h-72 w-72 rounded-full bg-violet-100/45 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-[620px]">
        {/* 로그인 화면으로 돌아가기 */}
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 rounded-full px-1 py-2 text-sm font-bold text-slate-500 transition hover:text-emerald-600"
        >
          <span aria-hidden="true">
            ←
          </span>
          로그인으로 돌아가기
        </Link>

        <div className="overflow-hidden rounded-[32px] border border-white bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          {/* 상단 브랜드 영역 */}
          <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-violet-50 px-6 py-7 text-center sm:px-8 sm:py-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-white shadow-sm ring-1 ring-emerald-100">
              <MemoryJarLogoIcon
                className="h-12 w-12"
              />
            </div>

            <p className="mt-4 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600">
              Memory Jar
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">
              비밀번호를 다시 설정할게요
            </h1>

            <p className="mx-auto mt-3 max-w-md text-sm font-medium leading-6 text-slate-500">
              아이디를 확인한 뒤 가입한 이메일로 본인 인증을 완료하면
              새 비밀번호를 설정할 수 있어요.
            </p>

            {/* 단계 안내 */}
            <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2">
              {[
                [1, "아이디"],
                [2, "본인 인증"],
                [3, "재설정"],
              ].map(([step, label]) => {
                const completed =
                  currentStep > step;

                const active =
                  currentStep === step;

                return (
                  <div
                    key={step}
                    className="text-center"
                  >
                    <div
                      className={[
                        "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition",
                        completed
                          ? "bg-emerald-500 text-white"
                          : active
                            ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-200"
                            : "bg-slate-100 text-slate-400",
                      ].join(" ")}
                    >
                      {completed
                        ? "✓"
                        : step}
                    </div>

                    <p
                      className={[
                        "mt-1.5 text-[11px] font-black",
                        active || completed
                          ? "text-emerald-700"
                          : "text-slate-400",
                      ].join(" ")}
                    >
                      {label}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6 px-6 py-7 sm:px-8 sm:py-8">
            {/* =================================================
                STEP 1. 아이디 확인
               ================================================= */}
            <div>
              <label
                htmlFor="find-password-login-id"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                아이디
              </label>

              <div className="flex gap-2">
                <input
                  id="find-password-login-id"
                  type="text"
                  value={loginId}
                  disabled={isLoginIdVerified}
                  onChange={(event) => {
                    setLoginId(
                      event.target.value
                    );
                    resetAfterLoginIdChange();
                  }}
                  autoComplete="username"
                  placeholder="Memory Jar 아이디"
                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                />

                <button
                  type="button"
                  onClick={handleCheckLoginId}
                  disabled={
                    loginIdStatus === "checking" ||
                    isLoginIdVerified
                  }
                  className={[
                    "shrink-0 rounded-2xl border px-4 py-3 text-sm font-black transition",
                    loginIdStatus === "checking" ||
                    isLoginIdVerified
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                  ].join(" ")}
                >
                  {loginIdStatus === "checking"
                    ? "확인 중..."
                    : isLoginIdVerified
                      ? "확인 완료"
                      : "아이디 확인"}
                </button>
              </div>

              <p className="mt-2 text-xs font-medium leading-5 text-slate-400">
                먼저 비밀번호를 바꿀 자체 로그인 아이디를 확인해 주세요.
              </p>

              {loginIdMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className={[
                    "mt-1.5 text-xs font-bold leading-5",
                    loginIdStatus === "valid"
                      ? "text-emerald-600"
                      : loginIdStatus === "checking"
                        ? "text-slate-400"
                        : "text-rose-500",
                  ].join(" ")}
                >
                  {loginIdMessage}
                </p>
              )}
            </div>

            {/* =================================================
                STEP 2. 이메일 + 인증번호
               ================================================= */}
            {isLoginIdVerified && (
              <div className="space-y-5 border-t border-slate-100 pt-6">
                <div>
                  <label
                    htmlFor="find-password-email"
                    className="mb-2 block text-sm font-black text-slate-800"
                  >
                    가입 이메일
                  </label>

                  <div className="flex gap-2">
                    <input
                      id="find-password-email"
                      type="email"
                      value={email}
                      disabled={isEmailVerified}
                      onChange={(event) => {
                        setEmail(
                          event.target.value
                        );
                        resetAfterEmailChange();
                      }}
                      autoComplete="email"
                      placeholder="example@email.com"
                      className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    />

                    <button
                      type="button"
                      onClick={handleSendVerificationCode}
                      disabled={
                        isEmailVerified ||
                        emailSendStatus === "sending" ||
                        resendRemainingSeconds > 0
                      }
                      className={[
                        "shrink-0 rounded-2xl border px-3.5 py-3 text-sm font-black transition sm:px-4",
                        isEmailVerified ||
                        emailSendStatus === "sending" ||
                        resendRemainingSeconds > 0
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                      ].join(" ")}
                    >
                      {isEmailVerified
                        ? "인증 완료"
                        : emailSendStatus === "sending"
                          ? "전송 중..."
                          : resendRemainingSeconds > 0
                            ? `재전송 ${resendRemainingSeconds}초`
                            : emailSendStatus === "sent"
                              ? "다시 받기"
                              : "인증번호 받기"}
                    </button>
                  </div>

                  <p className="mt-2 text-xs font-medium leading-5 text-slate-400">
                    서버에 저장된 이메일을 보여주지 않아요. 가입할 때 사용한 이메일을 직접 입력해 주세요.
                  </p>

                  {emailSendMessage && (
                    <p
                      role="status"
                      aria-live="polite"
                      className={[
                        "mt-1.5 text-xs font-bold leading-5",
                        emailSendStatus === "error"
                          ? "text-rose-500"
                          : "text-emerald-600",
                      ].join(" ")}
                    >
                      {emailSendMessage}
                    </p>
                  )}
                </div>

                {/* 인증번호는 메일 발송 이후에만 보여준다. */}
                {(emailSendStatus === "sent" ||
                  isEmailVerified) && (
                  <div>
                    <label
                      htmlFor="find-password-code"
                      className="mb-2 block text-sm font-black text-slate-800"
                    >
                      이메일 인증번호
                    </label>

                    <div className="flex gap-2">
                      <input
                        id="find-password-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={verificationCode}
                        disabled={
                          verificationRemainingSeconds <= 0 ||
                          isEmailVerified
                        }
                        onChange={(event) => {
                          const nextCode =
                            event.target.value
                              .replace(
                                /\D/g,
                                ""
                              )
                              .slice(
                                0,
                                6
                              );

                          setVerificationCode(
                            nextCode
                          );

                          if (
                            verificationStatus === "error"
                          ) {
                            setVerificationStatus("idle");
                            setVerificationMessage("");
                          }
                        }}
                        autoComplete="one-time-code"
                        placeholder="6자리 인증번호"
                        className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold tracking-[0.12em] text-slate-800 outline-none transition placeholder:tracking-normal placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      />

                      <button
                        type="button"
                        onClick={handleConfirmVerificationCode}
                        disabled={
                          verificationRemainingSeconds <= 0 ||
                          verificationStatus === "verifying" ||
                          isEmailVerified
                        }
                        className={[
                          "shrink-0 rounded-2xl border px-4 py-3 text-sm font-black transition",
                          verificationRemainingSeconds <= 0 ||
                          verificationStatus === "verifying" ||
                          isEmailVerified
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                        ].join(" ")}
                      >
                        {verificationStatus === "verifying"
                          ? "확인 중..."
                          : isEmailVerified
                            ? "확인 완료"
                            : "인증하기"}
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-400">
                        이메일로 받은 숫자 6자리를 입력해 주세요.
                      </span>

                      <span
                        className={[
                          "font-bold",
                          isEmailVerified
                            ? "text-emerald-600"
                            : verificationRemainingSeconds > 0
                              ? "text-emerald-600"
                              : "text-rose-500",
                        ].join(" ")}
                      >
                        {isEmailVerified
                          ? "인증 완료"
                          : formatRemainingTime(
                              verificationRemainingSeconds
                            )}
                      </span>
                    </div>

                    {verificationMessage && (
                      <p
                        role="status"
                        aria-live="polite"
                        className={[
                          "mt-2 text-xs font-bold leading-5",
                          verificationStatus === "verified"
                            ? "text-emerald-600"
                            : verificationStatus === "verifying"
                              ? "text-slate-400"
                              : "text-rose-500",
                        ].join(" ")}
                      >
                        {verificationMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* =================================================
                STEP 3. 새 비밀번호
               ================================================= */}
            {isEmailVerified && (
              <form
                onSubmit={handleResetPassword}
                className="space-y-5 border-t border-slate-100 pt-6"
              >
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs font-bold leading-5 text-emerald-700">
                  ✓ 본인 인증이 완료됐어요. 인증 완료 후 15분 안에 새 비밀번호로 변경해 주세요.
                </div>

                <div>
                  <label
                    htmlFor="find-password-new-password"
                    className="mb-2 block text-sm font-black text-slate-800"
                  >
                    새 비밀번호
                  </label>

                  <div className="relative">
                    <input
                      id="find-password-new-password"
                      type={
                        showNewPassword
                          ? "text"
                          : "password"
                      }
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(
                          event.target.value
                        );
                        setResetStatus("idle");
                        setResetMessage("");
                      }}
                      autoComplete="new-password"
                      placeholder="새 비밀번호를 입력해 주세요."
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-4 pr-12 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setShowNewPassword(
                          (previous) =>
                            !previous
                        );
                      }}
                      aria-label={
                        showNewPassword
                          ? "새 비밀번호 숨기기"
                          : "새 비밀번호 보기"
                      }
                      title={
                        showNewPassword
                          ? "새 비밀번호 숨기기"
                          : "새 비밀번호 보기"
                      }
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                    >
                      <PasswordVisibilityIcon
                        visible={showNewPassword}
                      />
                    </button>
                  </div>

                  {/* 회원가입과 동일한 비밀번호 조건 표시 */}
                  <div className="mt-2 space-y-1">
                    <p
                      className={[
                        "text-xs font-bold leading-5 transition",
                        !newPassword
                          ? "text-slate-400"
                          : isPasswordLengthValid
                            ? "text-emerald-600"
                            : "text-rose-500",
                      ].join(" ")}
                    >
                      {newPassword && isPasswordLengthValid
                        ? "✓"
                        : "•"}{" "}
                      8~100자로 입력해 주세요.
                    </p>

                    <p
                      className={[
                        "text-xs font-bold leading-5 transition",
                        !newPassword
                          ? "text-slate-400"
                          : passwordHasLetter
                            ? "text-emerald-600"
                            : "text-rose-500",
                      ].join(" ")}
                    >
                      {newPassword && passwordHasLetter
                        ? "✓"
                        : "•"}{" "}
                      영문을 1자 이상 포함해 주세요.
                    </p>

                    <p
                      className={[
                        "text-xs font-bold leading-5 transition",
                        !newPassword
                          ? "text-slate-400"
                          : passwordHasNumber
                            ? "text-emerald-600"
                            : "text-rose-500",
                      ].join(" ")}
                    >
                      {newPassword && passwordHasNumber
                        ? "✓"
                        : "•"}{" "}
                      숫자를 1자 이상 포함해 주세요.
                    </p>

                    <p
                      className={[
                        "text-xs font-bold leading-5 transition",
                        !newPassword
                          ? "text-slate-400"
                          : passwordHasSpecialCharacter
                            ? "text-emerald-600"
                            : "text-rose-500",
                      ].join(" ")}
                    >
                      {newPassword && passwordHasSpecialCharacter
                        ? "✓"
                        : "•"}{" "}
                      특수문자를 1자 이상 포함해 주세요.
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="find-password-new-password-confirm"
                    className="mb-2 block text-sm font-black text-slate-800"
                  >
                    새 비밀번호 확인
                  </label>

                  <div className="relative">
                    <input
                      id="find-password-new-password-confirm"
                      type={
                        showNewPasswordConfirm
                          ? "text"
                          : "password"
                      }
                      value={newPasswordConfirm}
                      onChange={(event) => {
                        setNewPasswordConfirm(
                          event.target.value
                        );
                        setResetStatus("idle");
                        setResetMessage("");
                      }}
                      autoComplete="new-password"
                      placeholder="새 비밀번호를 한 번 더 입력해 주세요."
                      className={[
                        "w-full rounded-2xl border bg-white py-3.5 pl-4 pr-12 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:ring-4",
                        passwordMismatch
                          ? "border-rose-300 focus:border-rose-300 focus:ring-rose-100"
                          : "border-slate-200 focus:border-emerald-300 focus:ring-emerald-100/70",
                      ].join(" ")}
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setShowNewPasswordConfirm(
                          (previous) =>
                            !previous
                        );
                      }}
                      aria-label={
                        showNewPasswordConfirm
                          ? "새 비밀번호 확인 숨기기"
                          : "새 비밀번호 확인 보기"
                      }
                      title={
                        showNewPasswordConfirm
                          ? "새 비밀번호 확인 숨기기"
                          : "새 비밀번호 확인 보기"
                      }
                      className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                    >
                      <PasswordVisibilityIcon
                        visible={showNewPasswordConfirm}
                      />
                    </button>
                  </div>

                  {newPasswordConfirm && (
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
                        ? "✓ 새 비밀번호가 일치해요."
                        : "새 비밀번호가 서로 일치하지 않아요."}
                    </p>
                  )}
                </div>

                {resetMessage && (
                  <p
                    role="status"
                    aria-live="polite"
                    className={[
                      "rounded-2xl px-4 py-3 text-center text-xs font-bold leading-5",
                      resetStatus === "error"
                        ? "bg-rose-50 text-rose-600"
                        : "bg-emerald-50 text-emerald-700",
                    ].join(" ")}
                  >
                    {resetMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={
                    resetStatus === "submitting" ||
                    !isPasswordValid ||
                    !isPasswordMatched
                  }
                  className="min-h-[50px] w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-3 text-sm font-black text-white shadow-md shadow-emerald-200/70 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50"
                >
                  {resetStatus === "submitting"
                    ? "비밀번호 변경 중..."
                    : "새 비밀번호로 변경"}
                </button>
              </form>
            )}

            {/* 인증 전에는 로그인 화면 링크를 하단에도 보여준다. */}
            {!isEmailVerified && (
              <div className="border-t border-slate-100 pt-5 text-center">
                <p className="text-xs font-medium text-slate-400">
                  비밀번호가 기억나셨나요?
                </p>

                <Link
                  to="/"
                  className="mt-2 inline-flex items-center justify-center text-sm font-black text-emerald-600 transition hover:text-emerald-700"
                >
                  로그인 화면으로 돌아가기
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
