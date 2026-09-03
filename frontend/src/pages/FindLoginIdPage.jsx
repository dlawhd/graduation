// src/pages/FindLoginIdPage.jsx

import {
  useEffect,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import MemoryJarLogoIcon
  from "../components/icons/MemoryJarLogoIcon";

import {
  sendLoginIdRecoveryEmailVerification,
  confirmLoginIdRecovery,
  getAuthErrorMessage,
} from "../api/authApi";


/*
 * =========================================================
 * 백엔드 KST 시간을 JavaScript 시간으로 바꾸는 함수
 * =========================================================
 *
 * 백엔드:
 *
 * 2026-09-03T18:00:00
 *
 * ↓
 *
 * 브라우저에서는:
 *
 * 2026-09-03T18:00:00+09:00
 *
 * 로 해석하도록 만든다.
 *
 * SignupPage에서 사용하고 있는 시간 처리 방식과
 * 같은 원리다.
 */
function parseKstDateTime(
  dateTime
) {

  if (!dateTime) {
    return null;
  }


  /*
   * Java LocalDateTime이
   * 마이크로초 6자리까지 내려오는 경우를 대비한다.
   */
  const millisecondsNormalized =
    dateTime.replace(
      /(\.\d{3})\d+/,
      "$1"
    );


  /*
   * 서버가 이미 timezone을 붙여줬다면
   * +09:00을 다시 붙이지 않는다.
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


  return Number.isNaN(
    time
  )
    ? null
    : time;
}


/*
 * =========================================================
 * 초 단위를 MM:SS 형태로 바꾸는 함수
 * =========================================================
 *
 * 300
 * ↓
 * 05:00
 *
 * 59
 * ↓
 * 00:59
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
 * =========================================================
 * 로그인 방법 정리
 * =========================================================
 *
 * 백엔드에서 내려오는 loginMethods 중
 * Memory Jar에서 실제 지원하는:
 *
 * LOCAL
 * NAVER
 * GOOGLE
 * KAKAO
 *
 * 만 남긴다.
 *
 * 중복값도 제거한다.
 */
function normalizeLoginMethods(
  loginMethods
) {

  const supported =
    new Set([
      "LOCAL",
      "NAVER",
      "GOOGLE",
      "KAKAO",
    ]);


  if (
    !Array.isArray(
      loginMethods
    )
  ) {
    return [];
  }


  return [
    ...new Set(
      loginMethods
        .map(
          (method) =>
            String(method)
              .trim()
              .toUpperCase()
        )
        .filter(
          (method) =>
            supported.has(
              method
            )
        )
    ),
  ];
}


/*
 * FindLoginIdPage 역할
 *
 * Memory Jar 자체 로그인 아이디를 잊은 사용자가
 * 가입할 때 사용한 이메일을 인증한 뒤
 * 자신의 loginId를 확인하는 페이지다.
 *
 *
 * 전체 흐름:
 *
 * 이메일 입력
 *      ↓
 * 인증번호 발송
 *      ↓
 * 05:00 타이머
 *      ↓
 * 이메일 인증번호 입력
 *      ↓
 * 서버에서 본인 확인
 *      ↓
 * LOCAL 계정이면 아이디 표시
 *
 *
 * LOCAL 계정이 없고:
 *
 * NAVER
 * GOOGLE
 * KAKAO
 *
 * 소셜 로그인만 사용하는 이메일이면
 * 기존 로그인 방법을 안내한다.
 */
export default function FindLoginIdPage() {

  /*
   * =========================================================
   * 이메일 입력값
   * =========================================================
   */

  const [
    email,
    setEmail,
  ] =
    useState("");


  /*
   * 이메일 발송 상태
   *
   * idle
   * → 아직 보내지 않음
   *
   * sending
   * → AWS SES로 보내는 중
   *
   * sent
   * → 정상 발송
   *
   * error
   * → 발송 실패
   */
  const [
    emailSendStatus,
    setEmailSendStatus,
  ] =
    useState(
      "idle"
    );


  /*
   * 이메일 입력창 아래 안내 문구
   */
  const [
    emailSendMessage,
    setEmailSendMessage,
  ] =
    useState("");


  /*
   * 인증번호가 실제로 만료되는 시각.
   *
   * JavaScript 밀리초 형태로 저장한다.
   */
  const [
    verificationExpiresAt,
    setVerificationExpiresAt,
  ] =
    useState(null);


  /*
   * 인증번호 남은 시간.
   *
   * 단위:
   * 초
   */
  const [
    verificationRemainingSeconds,
    setVerificationRemainingSeconds,
  ] =
    useState(0);


  /*
   * 인증번호 재전송까지 남은 시간.
   *
   * 현재 백엔드와 동일하게
   * 60초 제한을 화면에서도 보여준다.
   */
  const [
    resendRemainingSeconds,
    setResendRemainingSeconds,
  ] =
    useState(0);


  /*
   * 이메일로 받은 6자리 인증번호
   */
  const [
    verificationCode,
    setVerificationCode,
  ] =
    useState("");


  /*
   * 인증번호 확인 상태
   *
   * idle
   * → 확인 전
   *
   * verifying
   * → 백엔드 확인 중
   *
   * verified
   * → 이메일 본인 인증 성공
   *
   * error
   * → 인증 실패
   */
  const [
    verificationStatus,
    setVerificationStatus,
  ] =
    useState(
      "idle"
    );


  /*
   * 인증번호 결과 안내 문구
   */
  const [
    verificationMessage,
    setVerificationMessage,
  ] =
    useState("");


  /*
   * =========================================================
   * 최종 아이디 찾기 결과
   * =========================================================
   *
   * 예:
   *
   * {
   *   email: "...",
   *   existingAccount: true,
   *   loginId: "eunseo01",
   *   loginMethods: ["LOCAL"]
   * }
   */
  const [
    recoveryResult,
    setRecoveryResult,
  ] =
    useState(null);


  /*
   * 소셜 로그인 화면으로 이동 중인 Provider.
   */
  const [
    redirectingProvider,
    setRedirectingProvider,
  ] =
    useState(null);


  /*
   * 인증이 끝났는지 쉽게 확인하기 위한 값.
   */
  const isEmailVerified =
    verificationStatus ===
    "verified";


  /*
   * =========================================================
   * 인증번호 05:00 타이머
   * =========================================================
   *
   * 단순하게:
   *
   * 300
   * 299
   * 298
   *
   * 을 빼는 것이 아니라
   *
   * 서버 만료 시각 - 현재 시각
   *
   * 을 매초 다시 계산한다.
   *
   * 브라우저가 잠깐 백그라운드에 있어도
   * 시간이 크게 어긋나지 않는다.
   */
  useEffect(() => {

    if (
      !verificationExpiresAt
    ) {

      setVerificationRemainingSeconds(
        0
      );

      return undefined;
    }


    let timerId =
      null;


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


      /*
       * 시간이 끝났다면
       * 더 이상 interval을 실행하지 않는다.
       */
      if (
        remainingSeconds ===
          0 &&
        timerId
      ) {

        window.clearInterval(
          timerId
        );
      }
    }


    /*
     * 화면에 바로 한 번 계산한다.
     */
    updateRemainingTime();


    /*
     * 이후 1초마다 다시 계산한다.
     */
    timerId =
      window.setInterval(
        updateRemainingTime,
        1000
      );


    /*
     * 페이지를 나가면 Timer 제거.
     */
    return () => {

      if (timerId) {
        window.clearInterval(
          timerId
        );
      }
    };

  }, [
    verificationExpiresAt,
  ]);


  /*
   * =========================================================
   * 인증번호 재전송 60초 타이머
   * =========================================================
   */
  useEffect(() => {

    if (
      resendRemainingSeconds <=
      0
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

  }, [
    resendRemainingSeconds,
  ]);


  /*
   * =========================================================
   * 이전 이메일 인증 정보 초기화
   * =========================================================
   *
   * 이메일이 바뀌면
   * 이전 이메일에 대한:
   *
   * - 인증번호
   * - 인증 완료 상태
   * - 아이디 결과
   *
   * 를 그대로 사용하면 안 된다.
   */
  function resetVerificationState() {

    setEmailSendStatus(
      "idle"
    );

    setEmailSendMessage("");

    setVerificationExpiresAt(
      null
    );

    setVerificationRemainingSeconds(
      0
    );

    setResendRemainingSeconds(
      0
    );

    setVerificationCode("");

    setVerificationStatus(
      "idle"
    );

    setVerificationMessage("");

    setRecoveryResult(
      null
    );

    setRedirectingProvider(
      null
    );
  }


  /*
   * =========================================================
   * 이메일 인증번호 실제 발송
   * =========================================================
   */
  async function handleSendVerificationCode() {

    /*
     * 이메일은 앞뒤 공백 제거 +
     * 소문자로 통일한다.
     */
    const normalizedEmail =
      email
        .trim()
        .toLowerCase();


    /*
     * 빈 이메일 검사
     */
    if (
      !normalizedEmail
    ) {

      setEmailSendStatus(
        "error"
      );

      setEmailSendMessage(
        "아이디를 찾을 이메일을 입력해 주세요."
      );

      return;
    }


    /*
     * 프론트 1차 이메일 형식 검사.
     *
     * 최종 검증은 백엔드 @Email이
     * 다시 담당한다.
     */
    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    if (
      !emailPattern.test(
        normalizedEmail
      )
    ) {

      setEmailSendStatus(
        "error"
      );

      setEmailSendMessage(
        "이메일 형식을 확인해 주세요."
      );

      return;
    }


    /*
     * 화면의 이메일도
     * 정규화된 값으로 맞춘다.
     */
    setEmail(
      normalizedEmail
    );


    /*
     * 새로운 인증번호를 요청했으므로
     * 이전 결과를 모두 제거한다.
     */
    setVerificationCode("");

    setVerificationStatus(
      "idle"
    );

    setVerificationMessage("");

    setRecoveryResult(
      null
    );

    setVerificationExpiresAt(
      null
    );

    setVerificationRemainingSeconds(
      0
    );


    setEmailSendStatus(
      "sending"
    );

    setEmailSendMessage(
      "인증번호를 보내고 있어요."
    );


    try {

      /*
       * 실제 API:
       *
       * POST
       * /api/v1/auth/login-id-recovery/email-verifications
       */
      const result =
        await sendLoginIdRecoveryEmailVerification(
          normalizedEmail
        );


      /*
       * 백엔드가 내려준 실제 인증 만료 시각.
       */
      const expiresAt =
        parseKstDateTime(
          result?.expiresAt
        );


      if (
        !expiresAt
      ) {

        throw new Error(
          "인증번호 만료 시간을 확인하지 못했어요."
        );
      }


      setEmailSendStatus(
        "sent"
      );


      setEmailSendMessage(
        `${
          result?.email ??
          normalizedEmail
        }로 인증번호를 보냈어요. 메일함을 확인해 주세요.`
      );


      /*
       * 05:00 타이머 시작
       */
      setVerificationExpiresAt(
        expiresAt
      );


      /*
       * 인증번호 재전송은 60초 뒤 가능.
       */
      setResendRemainingSeconds(
        60
      );

    } catch (error) {

      setEmailSendStatus(
        "error"
      );


      setEmailSendMessage(
        getAuthErrorMessage(
          error,
          "인증번호를 보내지 못했어요. 잠시 후 다시 시도해 주세요."
        )
      );
    }
  }


  /*
   * =========================================================
   * 인증번호 확인 + 아이디 조회
   * =========================================================
   */
  async function handleConfirmVerificationCode() {

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();


    /*
     * 먼저 인증번호를 발송했는지 확인.
     */
    if (
      emailSendStatus !==
      "sent"
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
     * 인증번호가 이미 만료됐는지 확인.
     */
    if (
      verificationRemainingSeconds <=
      0
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
     * 정확하게 숫자 6자리인지 검사.
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


    setVerificationStatus(
      "verifying"
    );


    setVerificationMessage(
      "인증번호를 확인하고 있어요."
    );


    setRecoveryResult(
      null
    );


    try {

      /*
       * 실제 API:
       *
       * POST
       * /api/v1/auth/login-id-recovery/confirm
       *
       * 이메일 인증번호 확인과
       * 아이디 조회가 같은 요청에서 끝난다.
       */
      const result =
        await confirmLoginIdRecovery({
          email:
            normalizedEmail,

          code:
            verificationCode,
        });


      /*
       * 서버가 내려준 로그인 방법을
       * 안전하게 정리한다.
       */
      const loginMethods =
        normalizeLoginMethods(
          result?.loginMethods
        );


      /*
       * LOCAL 계정이 없다면
       * loginId는 null로 사용한다.
       */
      const loginId =
        typeof result?.loginId ===
          "string" &&
        result.loginId.trim()

          ? result.loginId.trim()

          : null;


      const accountExists =
        result?.existingAccount ===
        true;


      /*
       * 최종 결과 저장.
       */
      setRecoveryResult({
        email:
          result?.email ??
          normalizedEmail,

        existingAccount:
          accountExists,

        loginId,

        loginMethods,
      });


      /*
       * 이메일 본인 인증 완료
       */
      setVerificationStatus(
        "verified"
      );


      /*
       * 상황에 맞게 결과 문구를 다르게 보여준다.
       */
      if (loginId) {

        setVerificationMessage(
          "본인 인증이 완료됐어요. 아이디를 확인해 주세요."
        );

      } else if (
        accountExists &&
        loginMethods.some(
          (method) =>
            method !==
            "LOCAL"
        )
      ) {

        setVerificationMessage(
          "본인 인증이 완료됐어요. 이 이메일은 소셜 로그인 계정으로 확인됐어요."
        );

      } else if (
        accountExists
      ) {

        setVerificationMessage(
          "본인 인증은 완료됐지만 현재 사용할 수 있는 자체 로그인 아이디를 찾지 못했어요."
        );

      } else {

        setVerificationMessage(
          "본인 인증은 완료됐지만 이 이메일로 가입된 계정을 찾지 못했어요."
        );
      }


      /*
       * 인증이 끝났으므로
       * 05:00 타이머를 종료한다.
       */
      setVerificationExpiresAt(
        null
      );

      setVerificationRemainingSeconds(
        0
      );

    } catch (error) {

      setVerificationStatus(
        "error"
      );


      setRecoveryResult(
        null
      );


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
   * 소셜 계정으로 로그인
   * =========================================================
   *
   * 아이디 찾기 결과:
   *
   * loginId = null
   * loginMethods = ["GOOGLE"]
   *
   * 같은 경우 사용한다.
   */
  function handleOAuthLogin(
    provider
  ) {

    const normalizedProvider =
      String(
        provider ?? ""
      )
        .trim()
        .toLowerCase();


    /*
     * 허용된 Provider만 사용한다.
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
      return;
    }


    /*
     * 기존 Home / SignupPage와 동일한
     * 백엔드 주소 사용.
     */
    const backendUrl =
      import.meta.env
        .VITE_API_BASE_URL
        ?.replace(
          /\/+$/,
          ""
        );


    if (
      !backendUrl
    ) {

      setVerificationMessage(
        "로그인 서버 주소를 확인하지 못했어요."
      );

      return;
    }


    setRedirectingProvider(
      normalizedProvider
    );


    /*
     * OAuth 로그인 성공 뒤에는
     * 저금통 목록으로 이동.
     */
    sessionStorage.setItem(
      "postLoginRedirect",
      "/jars"
    );


    window.location.href =
      `${backendUrl}` +
      `/oauth2/authorization/${normalizedProvider}`;
  }


  /*
   * 소셜 로그인 방법만 따로 꺼낸다.
   */
  const socialLoginMethods =
    recoveryResult
      ?.loginMethods
      ?.filter(
        (method) =>
          [
            "NAVER",
            "GOOGLE",
            "KAKAO",
          ].includes(
            method
          )
      ) ??
    [];


  return (

    /*
     * =========================================================
     * 페이지 전체
     * =========================================================
     *
     * SignupPage와 같은:
     *
     * 흰색
     * 민트
     * 연보라
     *
     * 분위기를 그대로 사용한다.
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


        {/* =====================================================
            아이디 찾기 카드
           ===================================================== */}
        <div className="overflow-hidden rounded-[32px] border border-white bg-white/90 shadow-[0_24px_70px_rgba(15,23,42,0.10)] backdrop-blur-xl">

          {/* 상단 브랜드 영역 */}
          <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 via-white to-violet-50 px-6 py-7 text-center sm:px-8 sm:py-8">

            {/* Memory Jar 로고 */}
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-white shadow-sm ring-1 ring-emerald-100">

              <MemoryJarLogoIcon
                className="h-12 w-12"
              />

            </div>


            <p className="mt-4 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-600">
              Memory Jar
            </p>


            <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-900 sm:text-3xl">
              아이디를 찾아드릴게요
            </h1>


            <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-6 text-slate-500">
              가입할 때 사용한 이메일을 인증하면
              Memory Jar 아이디를 확인할 수 있어요.
            </p>

          </div>


          {/* =====================================================
              입력 영역
             ===================================================== */}
          <div className="space-y-6 px-6 py-7 sm:px-8 sm:py-8">

            {/* ===================================================
                이메일
               =================================================== */}
            <div>

              <label
                htmlFor="find-login-id-email"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                이메일
              </label>


              <div className="flex gap-2">

                <input
                  id="find-login-id-email"
                  type="email"

                  value={email}

                  /*
                   * 인증 완료 후에는
                   * 인증받은 이메일이 바뀌지 않도록 잠근다.
                   */
                  disabled={
                    isEmailVerified
                  }

                  onChange={(event) => {

                    setEmail(
                      event.target.value
                    );

                    /*
                     * 이메일이 바뀌면
                     * 이전 인증 결과 모두 제거.
                     */
                    resetVerificationState();
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

                  disabled={
                    isEmailVerified ||
                    emailSendStatus ===
                      "sending" ||
                    resendRemainingSeconds >
                      0
                  }

                  className={[
                    "shrink-0 rounded-2xl border px-3.5 py-3 text-sm font-black transition sm:px-4",

                    isEmailVerified ||
                    emailSendStatus ===
                      "sending" ||
                    resendRemainingSeconds >
                      0

                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"

                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",

                  ].join(" ")}
                >

                  {isEmailVerified
                    ? "인증 완료"

                    : emailSendStatus ===
                        "sending"
                      ? "전송 중..."

                      : resendRemainingSeconds >
                          0
                        ? `재전송 ${resendRemainingSeconds}초`

                        : emailSendStatus ===
                            "sent"
                          ? "다시 받기"

                          : "인증번호 받기"}

                </button>

              </div>


              <p className="mt-2 text-xs font-medium leading-5 text-slate-400">
                Memory Jar 가입에 사용한 이메일 주소를 입력해 주세요.
              </p>


              {/* 이메일 발송 결과 */}
              {emailSendMessage && (

                <p
                  role="status"
                  aria-live="polite"

                  className={[
                    "mt-1.5 text-xs font-bold leading-5",

                    emailSendStatus ===
                    "error"
                      ? "text-rose-500"
                      : "text-emerald-600",

                  ].join(" ")}
                >
                  {emailSendMessage}
                </p>

              )}

            </div>


            {/* ===================================================
                인증번호
               =================================================== */}
            <div>

              <label
                htmlFor="find-login-id-code"
                className="mb-2 block text-sm font-black text-slate-800"
              >
                이메일 인증번호
              </label>


              <div className="flex gap-2">

                <input
                  id="find-login-id-code"

                  type="text"

                  /*
                   * 모바일에서 숫자 키패드가
                   * 먼저 열리도록 도와준다.
                   */
                  inputMode="numeric"

                  maxLength={6}

                  value={
                    verificationCode
                  }

                  disabled={
                    emailSendStatus !==
                      "sent" ||
                    verificationRemainingSeconds <=
                      0 ||
                    isEmailVerified
                  }

                  onChange={(event) => {

                    /*
                     * 숫자만 남긴다.
                     *
                     * abc12-34
                     * ↓
                     * 1234
                     */
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


                    /*
                     * 사용자가 번호를 다시 수정했다면
                     * 이전 오류 문구를 잠깐 제거한다.
                     */
                    if (
                      verificationStatus ===
                      "error"
                    ) {

                      setVerificationStatus(
                        "idle"
                      );

                      setVerificationMessage(
                        ""
                      );
                    }
                  }}

                  autoComplete="one-time-code"

                  placeholder="6자리 인증번호"

                  className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold tracking-[0.12em] text-slate-800 outline-none transition placeholder:tracking-normal placeholder:text-slate-300 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100/70 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                />


                <button
                  type="button"

                  onClick={
                    handleConfirmVerificationCode
                  }

                  disabled={
                    emailSendStatus !==
                      "sent" ||
                    verificationRemainingSeconds <=
                      0 ||
                    verificationStatus ===
                      "verifying" ||
                    isEmailVerified
                  }

                  className={[
                    "shrink-0 rounded-2xl border px-4 py-3 text-sm font-black transition",

                    emailSendStatus !==
                      "sent" ||
                    verificationRemainingSeconds <=
                      0 ||
                    verificationStatus ===
                      "verifying" ||
                    isEmailVerified

                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"

                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",

                  ].join(" ")}
                >

                  {verificationStatus ===
                  "verifying"
                    ? "확인 중..."

                    : isEmailVerified
                      ? "확인 완료"

                      : "인증하기"}

                </button>

              </div>


              {/* =================================================
                  인증번호 설명 + 05:00 타이머
                 ================================================= */}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">

                <span className="font-medium text-slate-400">
                  이메일로 받은 6자리 번호를 입력해 주세요.
                </span>


                <span
                  className={[
                    "font-bold",

                    isEmailVerified
                      ? "text-emerald-600"

                      : emailSendStatus ===
                          "sent" &&
                        verificationRemainingSeconds >
                          0
                        ? "text-emerald-600"

                        : emailSendStatus ===
                            "sent"
                          ? "text-rose-500"

                          : "text-slate-400",

                  ].join(" ")}
                >

                  {isEmailVerified
                    ? "인증 완료"

                    : emailSendStatus ===
                        "sent"

                      ? formatRemainingTime(
                          verificationRemainingSeconds
                        )

                      : "--:--"}

                </span>

              </div>


              {/* 인증번호 확인 결과 */}
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
                아이디 찾기 결과
               =================================================== */}
            {isEmailVerified &&
              recoveryResult && (

              <div className="rounded-[26px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-5 shadow-sm">


                {/* ===============================================
                    CASE 1.
                    LOCAL 아이디가 존재하는 경우
                   =============================================== */}
                {recoveryResult.loginId ? (

                  <>

                    <div className="text-center">

                      {/* 완료 체크 */}
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-sm font-black text-white">
                        ✓
                      </span>


                      <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
                        찾은 아이디
                      </p>


                      {/* 실제 loginId */}
                      <p className="mt-2 break-all rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-xl font-black tracking-[0.04em] text-slate-900 shadow-sm sm:text-2xl">

                        {
                          recoveryResult.loginId
                        }

                      </p>


                      <p className="mt-3 text-xs font-medium leading-5 text-slate-500">
                        위 아이디와 비밀번호로
                        Memory Jar에 로그인해 주세요.
                      </p>

                    </div>


                    <Link
                      to="/"

                      className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      로그인으로 돌아가기
                    </Link>

                  </>


                ) : recoveryResult.existingAccount &&
                  socialLoginMethods.length >
                    0 ? (


                  /* ===============================================
                     CASE 2.
                     LOCAL 아이디 없이 소셜 계정만 존재
                     =============================================== */
                  <>

                    <div className="text-center">

                      <p className="text-sm font-black text-slate-800">
                        자체 로그인 아이디가 없는 소셜 계정이에요.
                      </p>


                      <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                        아래에 표시된 기존 로그인 방법으로 계속해 주세요.
                      </p>

                    </div>


                    <div className="mt-4 space-y-2.5">


                      {/* NAVER */}
                      {socialLoginMethods.includes(
                        "NAVER"
                      ) && (

                        <button
                          type="button"

                          onClick={() =>
                            handleOAuthLogin(
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


                          {redirectingProvider ===
                          "naver"
                            ? "네이버로 이동 중..."
                            : "네이버로 로그인"}

                        </button>

                      )}


                      {/* GOOGLE */}
                      {socialLoginMethods.includes(
                        "GOOGLE"
                      ) && (

                        <button
                          type="button"

                          onClick={() =>
                            handleOAuthLogin(
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

                          <span className="text-base font-black text-blue-500">
                            G
                          </span>


                          {redirectingProvider ===
                          "google"
                            ? "Google로 이동 중..."
                            : "Google로 로그인"}

                        </button>

                      )}


                      {/* KAKAO */}
                      {socialLoginMethods.includes(
                        "KAKAO"
                      ) && (

                        <button
                          type="button"

                          onClick={() =>
                            handleOAuthLogin(
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


                          {redirectingProvider ===
                          "kakao"
                            ? "카카오로 이동 중..."
                            : "카카오로 로그인"}

                        </button>

                      )}

                    </div>

                  </>


                ) : recoveryResult.existingAccount ? (


                  /* ===============================================
                     CASE 3.
                     과거 이메일 기록은 있지만
                     현재 활성 로그인 방법을 찾지 못한 경우
                     =============================================== */
                  <div className="text-center">

                    <p className="text-sm font-black text-slate-800">
                      현재 사용할 수 있는 자체 로그인 아이디를 찾지 못했어요.
                    </p>


                    <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                      로그인 화면으로 돌아가 기존 로그인 방법을 다시 확인해 주세요.
                    </p>


                    <Link
                      to="/"

                      className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                    >
                      로그인 화면으로 돌아가기
                    </Link>

                  </div>


                ) : (


                  /* ===============================================
                     CASE 4.
                     이 이메일로 가입한 계정 자체가 없음
                     =============================================== */
                  <div className="text-center">

                    <p className="text-sm font-black text-slate-800">
                      이 이메일로 가입된 계정을 찾지 못했어요.
                    </p>


                    <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                      이메일 주소를 다시 확인하거나
                      새 계정을 만들어 주세요.
                    </p>


                    <div className="mt-4 grid gap-2 sm:grid-cols-2">

                      <Link
                        to="/"

                        className="flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        로그인으로 돌아가기
                      </Link>


                      <Link
                        to="/signup"

                        className="flex min-h-[48px] items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
                      >
                        회원가입하기
                      </Link>

                    </div>

                  </div>

                )}


                {/* ===============================================
                    다른 이메일로 다시 찾기
                   =============================================== */}
                <button
                  type="button"

                  onClick={() => {

                    setEmail("");

                    resetVerificationState();
                  }}

                  className="mt-3 w-full rounded-2xl px-4 py-2.5 text-xs font-black text-slate-400 transition hover:bg-white/70 hover:text-emerald-600"
                >
                  다른 이메일로 찾기
                </button>

              </div>

            )}


            {/* ===================================================
                인증 전 하단 안내
               =================================================== */}
            {!isEmailVerified && (

              <div className="border-t border-slate-100 pt-5 text-center">

                <p className="text-xs font-medium text-slate-400">
                  아이디를 알고 계신가요?
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