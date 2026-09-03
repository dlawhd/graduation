// src/api/authApi.js

import apiClient, {
  fetchCsrf,
} from "./apiClient";

/*
 * authApi.js 역할
 *
 * Memory Jar의 "자체 계정 인증"과 관련된
 * 백엔드 API 요청만 모아두는 파일이야.
 *
 * 쉽게 말하면:
 *
 * 화면 컴포넌트
 *   ↓
 * authApi.js
 *   ↓
 * apiClient.js
 *   ↓
 * Spring Boot 백엔드
 *
 * 이런 구조로 요청을 보내게 된다.
 *
 *
 * 여기서 담당하는 기능:
 *
 * 1. 아이디 중복 확인
 * 2. 이메일 인증번호 발송
 * 3. 이메일 인증번호 확인
 * 4. Memory Jar 회원가입
 * 5. 아이디 / 비밀번호 로그인
 *
 *
 * 중요한 점:
 *
 * 실제 화면(SignupPage, LoginJarCard) 안에
 * axios 요청을 직접 작성하지 않는다.
 *
 * API 요청을 이 파일에 모아두면
 * 나중에 URL이나 요청 방식이 바뀌어도
 * 이 파일만 수정하면 되기 때문에 관리하기 쉬워진다.
 */


/*
 * Memory Jar 인증 API의 공통 주소
 *
 * 예:
 *
 * /api/v1/auth/login
 * /api/v1/auth/signup
 * /api/v1/auth/email-verifications
 */
const AUTH_API_PATH =
  "/api/v1/auth";


/*
 * 서버의 공통 성공 응답에서
 * 실제로 화면에서 사용할 data만 꺼내주는 함수야.
 *
 * 백엔드 응답:
 *
 * {
 *   "data": {
 *     ...
 *   }
 * }
 *
 * 프론트에서는:
 *
 * {
 *   ...
 * }
 *
 * 부분만 받게 된다.
 */
function extractData(response) {
  return response?.data?.data;
}


/*
 * 공개 인증 API에 사용할 Axios 설정
 *
 * _skipAuthRefresh: true가 매우 중요하다.
 *
 *
 * 왜 필요할까?
 *
 * 현재 apiClient.js는 일반 API 요청에서
 * 401 Unauthorized가 발생하면:
 *
 * 401
 *   ↓
 * /api/v1/auth/refresh
 *   ↓
 * Access Token 재발급
 *
 * 을 시도한다.
 *
 *
 * 그런데 로그인할 때 비밀번호가 틀린 경우의 401은
 * "로그인이 만료된 것"이 아니라
 * "로그인 정보가 틀린 것"이다.
 *
 * 이때 refresh를 시도하면 안 된다.
 *
 *
 * 따라서 로그인 / 회원가입 / 이메일 인증처럼
 * 로그인 전에 사용할 수 있는 공개 인증 API에는
 *
 * _skipAuthRefresh: true
 *
 * 를 붙여준다.
 */
function publicAuthConfig(
  extraConfig = {}
) {
  return {
    ...extraConfig,

    /*
     * apiClient의 401 자동 Refresh 기능을
     * 이 요청에서는 사용하지 않는다.
     */
    _skipAuthRefresh: true,
  };
}


/*
 * =========================================================
 * 1. 아이디 사용 가능 여부 확인
 * =========================================================
 *
 * GET /api/v1/auth/login-id/availability
 *
 *
 * 요청 예:
 *
 * loginId = "memory_user"
 *
 *
 * 실제 요청:
 *
 * GET
 * /api/v1/auth/login-id/availability?loginId=memory_user
 *
 *
 * 응답 예:
 *
 * {
 *   "data": {
 *     "loginId": "memory_user",
 *     "available": true
 *   }
 * }
 *
 *
 * GET 요청은 데이터를 변경하지 않기 때문에
 * CSRF 토큰은 필요하지 않다.
 */
export async function checkLoginIdAvailability(
  loginId
) {
  const response = await apiClient.get(
    `${AUTH_API_PATH}/login-id/availability`,
    publicAuthConfig({
      params: {
        loginId,
      },
    })
  );

  return extractData(response);
}


/*
 * =========================================================
 * 2. 회원가입 이메일 인증번호 발송
 * =========================================================
 *
 * POST /api/v1/auth/email-verifications
 *
 *
 * 요청:
 *
 * {
 *   "email": "user@example.com"
 * }
 *
 *
 * 처리 흐름:
 *
 * 사용자 이메일 입력
 *       ↓
 * Spring Boot
 *       ↓
 * 6자리 인증번호 생성
 *       ↓
 * DB에는 HMAC Hash 저장
 *       ↓
 * AWS SES
 *       ↓
 * 실제 이메일 전송
 *
 *
 * POST 요청이므로
 * 먼저 fetchCsrf()를 호출한다.
 */
export async function sendSignupEmailVerification(
  email
) {
  /*
   * apiClient가 CSRF 토큰을 기억하도록
   * POST 전에 먼저 요청한다.
   */
  await fetchCsrf();

  const response = await apiClient.post(
    `${AUTH_API_PATH}/email-verifications`,

    /*
     * Request Body
     */
    {
      email,
    },

    /*
     * 로그인 전 공개 API이므로
     * 401 발생 시 자동 Refresh를 하지 않는다.
     */
    publicAuthConfig()
  );

  return extractData(response);
}


/*
 * =========================================================
 * 3. 회원가입 이메일 인증번호 확인
 * =========================================================
 *
 * POST /api/v1/auth/email-verifications/confirm
 *
 *
 * 사용자가 이메일로 받은:
 *
 * 482193
 *
 * 같은 6자리 번호를 서버에 보내서
 * 실제로 맞는 번호인지 검사한다.
 *
 *
 * 요청 예:
 *
 * {
 *   "email": "user@example.com",
 *   "code": "482193"
 * }
 *
 *
 * 인증 성공 시 서버가 회원가입에서 사용할
 * verificationToken을 내려준다.
 *
 * 이 토큰은 다음 회원가입 요청에서 사용한다.
 */
export async function confirmSignupEmailVerification({
  email,
  code,
}) {
  await fetchCsrf();

  const response = await apiClient.post(
    `${AUTH_API_PATH}/email-verifications/confirm`,
    {
      email,
      code,
    },
    publicAuthConfig()
  );

  return extractData(response);
}


/*
 * =========================================================
 * 4. Memory Jar 자체 회원가입
 * =========================================================
 *
 * POST /api/v1/auth/signup
 *
 *
 * 회원가입 화면에서 입력받은:
 *
 * - 아이디
 * - 비밀번호
 * - 닉네임
 * - 이메일
 * - 이메일 인증 완료 토큰
 *
 * 을 서버에 전달한다.
 *
 *
 * passwordConfirm은 보내지 않는다.
 *
 * 비밀번호 확인 값은:
 *
 * password === passwordConfirm
 *
 * 인지 프론트 화면에서 검사하기 위한 값이지
 * 실제 회원가입 데이터가 아니기 때문이다.
 */
export async function signupLocal({
  loginId,
  password,
  nickname,
  email,
  verificationToken,
}) {
  await fetchCsrf();

  const response = await apiClient.post(
    `${AUTH_API_PATH}/signup`,
    {
      loginId,
      password,
      nickname,
      email,
      verificationToken,
    },
    publicAuthConfig()
  );

  return extractData(response);
}


/*
 * =========================================================
 * 5. Memory Jar 자체 로그인
 * =========================================================
 *
 * POST /api/v1/auth/login
 *
 *
 * 요청:
 *
 * {
 *   "loginId": "memory_user",
 *   "password": "사용자 비밀번호"
 * }
 *
 *
 * 로그인에 성공하면 백엔드는 기존 OAuth 로그인과 마찬가지로
 * Access Token / Refresh Token을 HttpOnly Cookie에 저장한다.
 *
 * 따라서 프론트 JavaScript에서 JWT 값을 직접 저장할 필요가 없다.
 *
 *
 * apiClient.js에 이미:
 *
 * withCredentials: true
 *
 * 가 설정돼 있기 때문에
 * 백엔드가 내려준 인증 쿠키를 브라우저가 관리한다.
 */
export async function loginLocal({
  loginId,
  password,
}) {
  await fetchCsrf();

  const response = await apiClient.post(
    `${AUTH_API_PATH}/login`,
    {
      loginId,
      password,
    },

    /*
     * 비밀번호가 틀려서 401이 발생한 경우
     * Refresh Token 재발급을 시도하면 안 되기 때문에
     * 자동 Refresh를 명시적으로 끈다.
     */
    publicAuthConfig()
  );

  return extractData(response);
}

/*
 * =========================================================
 * 6. 아이디 찾기 이메일 인증번호 발송
 * =========================================================
 *
 * POST
 * /api/v1/auth/login-id-recovery/email-verifications
 *
 * 사용자가 아이디를 찾기 위해 입력한 이메일로
 * 6자리 인증번호를 발송한다.
 *
 * 로그인 전 사용하는 공개 API이기 때문에
 * 401이 발생하더라도 Refresh Token 재발급을
 * 시도하지 않는다.
 *
 * POST 요청이므로 먼저 CSRF 토큰을 받아온다.
 */
export async function sendLoginIdRecoveryEmailVerification(
  email
) {
  /*
   * POST 요청에 필요한 CSRF 토큰 준비
   */
  await fetchCsrf();

  const response =
    await apiClient.post(
      `${AUTH_API_PATH}/login-id-recovery/email-verifications`,

      /*
       * Request Body
       *
       * {
       *   "email": "user@example.com"
       * }
       */
      {
        email,
      },

      /*
       * 로그인 전 공개 API
       */
      publicAuthConfig()
    );

  /*
   * 공통 응답:
   *
   * {
   *   data: {
   *     email,
   *     expiresAt
   *   }
   * }
   *
   * 에서 data만 꺼낸다.
   */
  return extractData(
    response
  );
}


/*
 * =========================================================
 * 7. 아이디 찾기 인증번호 확인 + 아이디 조회
 * =========================================================
 *
 * POST
 * /api/v1/auth/login-id-recovery/confirm
 *
 * 이메일로 받은 인증번호가 맞으면
 * 서버가 같은 요청 안에서:
 *
 * - 기존 계정 여부
 * - LOCAL 아이디
 * - 로그인 방법
 *
 * 을 확인해서 내려준다.
 *
 * 매우 중요:
 *
 * 이메일 주소만 입력해서 아이디를 알려주는 것이 아니라
 * 이메일 인증번호 확인까지 성공해야 결과를 받는다.
 */
export async function confirmLoginIdRecovery({
  email,
  code,
}) {
  /*
   * POST 요청에 필요한 CSRF 토큰 준비
   */
  await fetchCsrf();

  const response =
    await apiClient.post(
      `${AUTH_API_PATH}/login-id-recovery/confirm`,

      /*
       * Request Body
       *
       * {
       *   "email": "user@example.com",
       *   "code": "123456"
       * }
       */
      {
        email,
        code,
      },

      /*
       * 로그인 전 공개 API
       */
      publicAuthConfig()
    );

  return extractData(
    response
  );
}


/*
 * =========================================================
 * 인증 API 오류 문구 꺼내기
 * =========================================================
 *
 * Memory Jar 백엔드의 공통 오류 응답은:
 *
 * {
 *   "error": {
 *     "code": "...",
 *     "message": "...",
 *     "details": ...
 *   }
 * }
 *
 * 형태다.
 *
 *
 * SignupPage와 LoginJarCard에서 매번 긴 코드를 작성하지 않고:
 *
 * getAuthErrorMessage(error)
 *
 * 만 호출해서 사용자용 오류 문구를 가져올 수 있게 한다.
 */
export function getAuthErrorMessage(
  error,
  fallbackMessage =
    "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
) {
  return (
    error?.response?.data?.error
      ?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage
  );
}


/*
 * named export뿐 아니라
 * 하나의 객체 형태로도 사용할 수 있도록 묶어둔다.
 *
 *
 * 방법 1:
 *
 * import {
 *   loginLocal,
 *   signupLocal,
 * } from "../api/authApi";
 *
 *
 * 방법 2:
 *
 * import authApi from "../api/authApi";
 *
 * authApi.loginLocal(...);
 */
const authApi = {
  checkLoginIdAvailability,
  sendSignupEmailVerification,
  confirmSignupEmailVerification,
  signupLocal,
  loginLocal,

  /*
   * 아이디 찾기
   */
  sendLoginIdRecoveryEmailVerification,
  confirmLoginIdRecovery,

  getAuthErrorMessage,
};

export default authApi;