# API

실제 구현 기준

2026.09.16

검토 기준: 현재 로컬 프로젝트

실제 Controller, DTO, Security 설정, 주요 Service, WebSocket 설정을 대조했어. 현재 공개된 API는 REST 63개와 STOMP 메시지 전송 1개야. 소셜 로그인은 Spring Security가 처리하므로 별도로 정리할게.

# 0. API 공통 규칙

## 0-1. 기본 주소

```
Base Path: /api/v1

운영 프론트엔드: https://www.esjh.shop
운영 백엔드:     https://api.esjh.shop
```

API를 호출할 때는 백엔드 주소 뒤에 경로를 붙이면 돼.

예시:

```
GET https://api.esjh.shop/api/v1/jars
```

OAuth2 로그인과 WebSocket은 `/api/v1`이 아닌 별도 경로를 사용해.

## 0-2. 인증 방식

현재 프로젝트는 JWT 기반 인증을 사용하고, Access Token과 Refresh Token을 HttpOnly Cookie에 저장해.

| 쿠키 | 역할 | 기본 유효기간 | Path |
| --- | --- | --- | --- |
| `accessToken` | 일반 API 인증 | 30분 | `/` |
| `refreshToken` | Access Token 재발급 | 14일 | `/api` |

운영 환경에서는 설정값에 따라 유효기간과 쿠키 속성이 달라질 수 있어.

프론트엔드 Axios 설정:

```
// frontend/src/api/apiClient.js// 브라우저가 서버에 요청할 때 인증 쿠키를 함께 전송한다.constapiClient=axios.create({
  baseURL:import.meta.env.VITE_API_BASE_URL,
  withCredentials:true,
});
```

Access Token은 요청마다 인증에 사용하고, 만료되어 401이 발생하면 프론트에서 Refresh API를 호출해 새로운 토큰을 발급받아.

현재 `apiClient.js`는 여러 요청에서 동시에 401이 발생하더라도 Refresh 요청을 공유하고, 원래 요청은 한 번만 재시도하도록 구성되어 있어.

## 0-3. CSRF

쿠키 기반 인증을 사용하므로 CSRF 보호가 적용되어 있어.

```
GET /api/v1/csrf
        ↓
CSRF 토큰 획득
        ↓
POST / PUT / PATCH / DELETE
        ↓
X-XSRF-TOKEN 헤더에 토큰 전달
```

현재 서버는 `CookieCsrfTokenRepository.withHttpOnlyFalse()`를 사용해.

CSRF 토큰용 `XSRF-TOKEN` 쿠키는 JavaScript에서 읽을 수 있지만, 인증용 Access Token·Refresh Token 쿠키는 HttpOnly야. 서로 역할이 다른 쿠키이므로 구분해야 해.

CSRF 응답 예시:

```
{
  "data": {
    "headerName":"X-XSRF-TOKEN",
    "parameterName":"_csrf",
    "token":"서버에서 발급한 토큰"
  }
}
```

프론트는 서버가 반환한 `headerName`과 `token`을 메모리에 저장하고 변경 요청에 사용해.

로그인 없이 호출할 수 있는 회원가입·로그인·이메일 인증 API도 POST 요청이면 CSRF 토큰이 필요해. `permitAll()`은 로그인 요구를 없애는 설정이지 CSRF를 해제하는 설정이 아니야.

## 0-4. 공통 성공 응답

대부분의 REST API는 `ApiResponse<T>`를 사용해.

```
{
  "data": {
    "jarId":10,
    "name":"우리의 추억"
  }
}
```

단, 아래 API는 성공 시 HTTP 204를 반환하며 응답 본문이 없어.

```
DELETE /api/v1/jars/{jarId}

DELETE /api/v1/jars/{jarId}/notes/{noteId}/comments/{commentId}
```

WebSocket 이벤트도 REST의 `data`로 감싸지 않고 이벤트 DTO를 직접 전달해.

## 0-5. 공통 에러 응답

예전 초안의 `details`는 현재 코드에 없어.

실제 `ErrorResponse`는 다음 필드를 사용해.

```
{
  "error": {
    "code":"NOT_FOUND",
    "message":"저금통을 찾을 수 없어.",
    "path":"/api/v1/jars/10",
    "traceId":null,
    "timestamp":"2026-09-16T15:00:00"
  }
}
```

위 값은 실제 응답 구조를 보여주기 위한 예시야.

| 필드 | 설명 |
| --- | --- |
| `code` | 오류 종류 |
| `message` | 오류 설명 |
| `path` | 오류가 발생한 요청 경로 |
| `traceId` | 서버 로그 추적 ID. 없으면 null 가능 |
| `timestamp` | 오류가 발생한 시간 |

현재 공통 에러 처리에서 사용하는 대표 코드는 다음과 같아.

| HTTP | code | 의미 |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | 요청값이 올바르지 않음 |
| 401 | `UNAUTHORIZED` | 인증이 필요하거나 유효하지 않음 |
| 403 | `FORBIDDEN` | 접근 권한이 없음 |
| 404 | `NOT_FOUND` | 대상이 존재하지 않음 |
| 500 | `INTERNAL_SERVER_ERROR` | 서버 내부 오류 |

단, 모든 상황이 동일한 에러 메시지를 반환하는 것은 아니야. 실제 Service에서 지정한 메시지가 사용될 수 있어.

현재는 별도의 `JAR_NOT_FOUND` 같은 세부 코드보다는 HTTP 상태에 대응하는 공통 코드가 사용돼.

## 0-6. 공통 Enum

현재 코드에서 실제로 사용하는 값들이야.

| Enum | 값 |
| --- | --- |
| JarTheme | `SPRING`, `SUMMER`, `AUTUMN`, `WINTER`, `LAVENDER`, `DEW`, `SAND`, `MOONLIGHT` |
| JarOpenMode | `ALL_AT_ONCE`, `DAILY_DRAW` |
| JarLockLevel | `HIDDEN`, `META_ONLY`, `TITLE_ONLY` |
| JarRole | `OWNER`, `ADMIN`, `MEMBER` |
| FilePurpose | `NOTE`, `PROFILE`, `JAR` |
| ChatMessageType | `TEXT`, `SYSTEM` |
| NoteReactionEmoji | `LOVE`, `SMILE`, `LAUGH`, `TOUCHING`, `MISS_YOU`, `PROUD`, `CHEER`, `THANKFUL` |

특히 예전 DTO 초안의 `COUPLE`, `FRIEND`, `FAMILY`, `CUSTOM`은 지금의 JarTheme 값이 아니야.

## 0-7. 날짜 및 시간 형식

저금통을 생성하거나 수정할 때 보내는 `openAt`은 오프셋이 없는 `LocalDateTime`이야.

```
{
  "openAt":"2027-02-27T00:00:00"
}
```

서버의 저금통 응답은 KST 오프셋이 포함된 `OffsetDateTime`이야.

```
{
  "openAt":"2027-02-27T00:00:00+09:00"
}
```

모든 응답 날짜가 `OffsetDateTime`인 것은 아니야. 채팅, 알림, 이메일 인증, 온보딩의 일부 시간 필드는 `LocalDateTime`이므로 해당 DTO를 기준으로 처리해야 해.

# 1. Auth / Account — 계정 및 인증

## 1-1. 소셜 로그인

현재 지원하는 소셜 로그인은 네이버, 구글, 카카오야.

```
GET /oauth2/authorization/naver
GET /oauth2/authorization/google
GET /oauth2/authorization/kakao
```

소셜 로그인 과정에서 사용하는 콜백 경로:

```
GET /login/oauth2/code/{registrationId}
```

로그인 흐름:

```
① 프론트에서 소셜 로그인 버튼 클릭
        ↓
② Spring Security OAuth2 인증 시작
        ↓
③ 네이버·구글·카카오에서 사용자 인증
        ↓
④ 서버 OAuth2SuccessHandler 실행
        ↓
⑤ 사용자 조회 또는 가입·연결 처리
        ↓
⑥ Access Token / Refresh Token 쿠키 설정
        ↓
⑦ 프론트 로그인 성공 페이지로 리다이렉트
```

현재 성공 후 이동하는 경로:

```
{app.frontend-url}/login/success
```

운영 기본 설정에서는 다음 주소야.

```
https://www.esjh.shop/login/success
```

이 경로들은 일반적인 JSON REST Controller가 아니라 Spring Security의 OAuth2 인증 흐름이야.

## 1-2. 자체 회원가입 및 로그인

예전 문서에서는 예정 기능이었지만 현재는 구현되어 있어.

| Method | API | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/auth/login-id/availability` | query: `loginId` | LoginIdAvailabilityResponse |
| POST | `/api/v1/auth/email-verifications` | EmailVerificationSendRequest | EmailVerificationSendResponse |
| POST | `/api/v1/auth/email-verifications/confirm` | EmailVerificationConfirmRequest | EmailVerificationConfirmResponse |
| POST | `/api/v1/auth/signup` | LocalSignupRequest | LocalAuthResponse |
| POST | `/api/v1/auth/login` | LocalLoginRequest | LocalAuthResponse |

이 다섯 API는 로그인하지 않아도 호출할 수 있어. POST 요청은 CSRF 보호를 그대로 적용받아.

### 아이디 중복 확인

```
GET /api/v1/auth/login-id/availability?loginId=memoryjar01
```

Response:

```
{
  "data": {
    "loginId":"memoryjar01",
    "available":true
  }
}
```

`available`이 true이면 해당 아이디를 사용할 수 있다는 뜻이야.

### 이메일 인증번호 발송

```
POST /api/v1/auth/email-verifications
```

Request:

```
{
  "email":"user@example.com"
}
```

Response:

```
{
  "data": {
    "email":"user@example.com",
    "expiresAt":"2026-09-16T15:05:00"
  }
}
```

실제 인증번호는 응답에 포함하지 않고 이메일로 발송해.

### 이메일 인증번호 확인

```
POST /api/v1/auth/email-verifications/confirm
```

Request:

```
{
  "email":"user@example.com",
  "code":"123456"
}
```

Response의 주요 필드:

```
{
  "data": {
    "email":"user@example.com",
    "verificationToken":"서버가 발급한 인증 완료 토큰",
    "verificationExpiresAt":"2026-09-16T15:15:00",
    "existingAccount":false,
    "loginMethods": []
  }
}
```

`existingAccount`와 `loginMethods`를 통해 이미 가입된 이메일인지, 어떤 로그인 방법이 연결되어 있는지 확인할 수 있어.

이 정보는 이메일 인증번호 확인에 성공한 뒤 반환돼.

### 자체 회원가입

```
POST /api/v1/auth/signup
```

Request:

```
{
  "loginId":"memoryjar01",
  "password":"Example123!",
  "nickname":"추억이",
  "email":"user@example.com",
  "verificationToken":"이메일 인증 완료 토큰"
}
```

Response:

```
{
  "data": {
    "userId":1,
    "loginId":"memoryjar01",
    "nickname":"추억이",
    "email":"user@example.com"
  }
}
```

회원가입 성공 시 JWT 인증 쿠키가 함께 발급되므로 별도 로그인 없이 로그인 상태가 돼.

현재 주요 입력 규칙은 아이디 4~20자, 비밀번호 8~100자, 영문·숫자·특수문자 각 1개 이상, 닉네임 한글·영문·숫자 허용이야. 닉네임 길이는 추가 정책 검사가 적용돼.

### 자체 로그인

```
POST /api/v1/auth/login
```

Request:

```
{
  "loginId":"memoryjar01",
  "password":"Example123!"
}
```

Response는 회원가입과 동일한 `LocalAuthResponse`야.

성공하면 Access Token과 Refresh Token을 JSON으로 반환하는 대신 HttpOnly Cookie로 설정해.

## 1-3. 아이디 찾기

현재 구현된 아이디 찾기는 이메일 인증을 통해 진행돼.

| 단계 | Method | API | Response |
| --- | --- | --- | --- |
| 인증번호 발송 | POST | `/api/v1/auth/login-id-recovery/email-verifications` | EmailVerificationSendResponse |
| 인증번호 확인 | POST | `/api/v1/auth/login-id-recovery/confirm` | LoginIdRecoveryResponse |

첫 번째 요청:

```
{
  "email":"user@example.com"
}
```

두 번째 요청:

```
{
  "email":"user@example.com",
  "code":"123456"
}
```

최종 Response:

```
{
  "data": {
    "email":"user@example.com",
    "existingAccount":true,
    "loginId":"memoryjar01",
    "loginMethods": ["LOCAL","GOOGLE"]
  }
}
```

위 예시는 자체 로그인과 구글 계정이 함께 연결된 경우야.

소셜 로그인만 사용하는 회원은 `loginId`가 null일 수 있어.

## 1-4. 비밀번호 찾기 및 재설정

현재는 네 단계로 진행돼.

| 단계 | Method | API | Request | Response |
| --- | --- | --- | --- | --- |
| 1. 아이디 확인 | POST | `/api/v1/auth/password-reset/login-id/check` | PasswordResetLoginIdCheckRequest | PasswordResetLoginIdCheckResponse |
| 2. 이메일 발송 | POST | `/api/v1/auth/password-reset/email-verifications` | PasswordResetEmailVerificationSendRequest | EmailVerificationSendResponse |
| 3. 인증번호 확인 | POST | `/api/v1/auth/password-reset/email-verifications/confirm` | PasswordResetEmailVerificationConfirmRequest | PasswordResetEmailVerificationConfirmResponse |
| 4. 비밀번호 변경 | POST | `/api/v1/auth/password-reset` | PasswordResetRequest | PasswordResetResponse |

각 단계의 요청 데이터는 다음과 같아.

```
{
  "loginId":"memoryjar01"
}
```

```
{
  "loginId":"memoryjar01",
  "email":"user@example.com"
}
```

```
{
  "loginId":"memoryjar01",
  "email":"user@example.com",
  "code":"123456"
}
```

인증번호 확인에 성공하면 `passwordResetToken`과 `expiresAt`을 반환해.

마지막 요청:

```
{
  "loginId":"memoryjar01",
  "email":"user@example.com",
  "passwordResetToken":"인증 완료 후 발급받은 토큰",
  "newPassword":"NewExample123!",
  "newPasswordConfirm":"NewExample123!"
}
```

성공 Response:

```
{
  "data": {
    "ok":true
  }
}
```

비밀번호 재설정에 성공하면 새 비밀번호를 저장하고, 해당 사용자의 모든 Refresh Token을 폐기하며, 현재 브라우저의 인증 쿠키도 정리해. 이후 새 비밀번호로 다시 로그인해야 해.

## 1-5. 토큰 재발급과 로그아웃

### 토큰 재발급

```
POST /api/v1/auth/refresh
```

Request Body: 없음

필요한 쿠키: `refreshToken`

동작:

```
Refresh Token 검증
        ↓
기존 Refresh Token 폐기
        ↓
새 Refresh Token 발급
        ↓
새 Access Token 발급
        ↓
두 쿠키를 다시 설정
```

Response:

```
{
  "data": {
    "ok":true
  }
}
```

Refresh Token 쿠키가 없거나 유효하지 않으면 401을 반환해.

### 로그아웃

```
POST /api/v1/auth/logout
```

Request Body: 없음

로그아웃은 Refresh Token 쿠키가 없어도 요청을 처리할 수 있도록 구현되어 있어.

동작:

- Refresh Token이 존재하면 DB에서 폐기 처리
- Access Token, Refresh Token 쿠키 삭제
- 현재 세션 종료 및 SecurityContext 정리
- JSESSIONID 쿠키 삭제

Response:

```
{
  "data": {
    "ok":true
  }
}
```

현재 브라우저의 인증 상태를 정리하는 API이며, 비밀번호 재설정처럼 사용자의 모든 Refresh Token을 폐기하는 기능과는 구분해야 해.

## 1-6. 내 정보

| Method | API | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/me` | 없음 | MeResponse |
| PATCH | `/api/v1/me` | MeUpdateRequest | MeResponse |

GET 응답:

```
{
  "data": {
    "userId":1,
    "email":"user@example.com",
    "name":"추억이",
    "birthyear":null
  }
}
```

PATCH 요청:

```
{
  "nickname":"새로운닉네임"
}
```

닉네임 변경은 자체 로그인 회원뿐 아니라 소셜 로그인 회원도 사용할 수 있어. 서버는 변경 후 최신 사용자 정보를 `MeResponse`로 반환해.

기존 문서의 `PATCH /api/v1/me`는 예정 기능에서 구현 완료로 변경해야 해.

# 2. Jars — 저금통 및 멤버 관리

기본 경로:

```
/api/v1/jars
```

이 영역은 실제 Controller 매핑 13개로 구성되어 있어.

## 2-1. 저금통 생성·조회·수정·삭제

| Method | API | Request | Response | 성공 상태 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/jars` | JarCreateRequest | JarCreateResponse | 201 |
| GET | `/api/v1/jars` | `page`, `size` | JarListResponse | 200 |
| GET | `/api/v1/jars/{jarId}` | 없음 | JarDetailResponse | 200 |
| PATCH | `/api/v1/jars/{jarId}` | JarUpdateRequest | JarUpdateResponse | 200 |
| DELETE | `/api/v1/jars/{jarId}` | 없음 | 본문 없음 | 204 |

### 저금통 생성

```
POST /api/v1/jars
```

Request:

```
{
  "name":"우리 1년 저금통",
  "description":"1년 동안 모아서 열어보자!",
  "theme":"LAVENDER",
  "maxMembers":2,
  "openAt":"2027-02-27T00:00:00",
  "openMode":"DAILY_DRAW",
  "lockLevel":"META_ONLY"
}
```

필수 필드는 `name`, `theme`, `maxMembers`, `openAt`, `openMode`, `lockLevel`이야.

`description`은 선택 사항이고, 저금통 이름은 최대 40자, 설명은 최대 200자, 최대 참여 인원은 2~50명이야.

Response:

```
{
  "data": {
    "jarId":10,
    "name":"우리 1년 저금통",
    "openAt":"2027-02-27T00:00:00+09:00",
    "openMode":"DAILY_DRAW",
    "lockLevel":"META_ONLY",
    "myRole":"OWNER",
    "createdAt":"2026-09-16T15:00:00+09:00"
  }
}
```

저금통 생성 시 `jars`에 저금통을 저장하고, 생성자를 `jar_members`에 OWNER로 함께 저장해.

### 내가 속한 저금통 목록

```
GET /api/v1/jars?page=0&size=20
```

Response 구조:

```
{
  "data": {
    "items": [
      {
        "jarId":10,
        "name":"우리 1년 저금통",
        "theme":"LAVENDER",
        "description":"1년 동안 모아서 열어보자!",
        "memberCount":2,
        "maxMembers":2,
        "openAt":"2027-02-27T00:00:00+09:00",
        "openMode":"DAILY_DRAW",
        "lockLevel":"META_ONLY",
        "isOpen":false,
        "myRole":"OWNER",
        "updatedAt":"2026-09-16T15:00:00+09:00"
      }
    ],
    "page":0,
    "size":20,
    "totalElements":1,
    "totalPages":1
  }
}
```

현재 참여 중인 저금통을 조회하며, `page`의 기본값은 0, `size`의 기본값은 20이야.

### 저금통 상세

```
GET /api/v1/jars/{jarId}
```

Response는 `JarDetailResponse`야.

주요 필드는 다음과 같아.

```
jarId
name
description
theme
ownerId
memberCount
maxMembers
openAt
openMode
lockLevel
isOpen
myRole
createdAt
updatedAt
```

현재 저금통 상세 응답에는 AI 이미지 URL이나 AI 생성 ID가 없어.

### 저금통 수정

```
PATCH /api/v1/jars/{jarId}
```

Request 예시:

```
{
  "name":"우리의 새로운 저금통",
  "theme":"SPRING",
  "maxMembers":5
}
```

수정할 수 있는 필드:

```
name
description
theme
maxMembers
openAt
openMode
lockLevel
```

모든 필드가 선택 사항이므로 필요한 항목만 보내면 돼.

단, 실제 Service에 다음 규칙이 있어.

- OWNER 또는 ADMIN만 수정 가능
- 최대 인원을 현재 참여 인원보다 작게 줄일 수 없음
- 이름에 공백만 입력할 수 없음
- 이미 열린 저금통의 `openAt`, `openMode`, `lockLevel`을 실제로 변경할 수 없음

이미 열린 저금통이라도 일반 설정 변경과 오픈 정책 변경은 구분해서 처리해.

### 저금통 삭제

```
DELETE /api/v1/jars/{jarId}
```

OWNER만 사용할 수 있어.

현재 코드는 저금통을 Soft Delete 처리하고, 활성 멤버들도 나간 상태로 변경해.

Response: HTTP 204, 본문 없음.

## 2-2. 멤버 관리

| Method | API | Request | Response | 권한 |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/jars/{jarId}/members` | 없음 | JarMemberListResponse | 멤버 |
| POST | `/api/v1/jars/{jarId}/leave` | 없음 | JarLeaveResponse | OWNER 제외 |
| POST | `/api/v1/jars/{jarId}/members/{userId}/kick` | 없음 | JarKickResponse | OWNER·ADMIN |
| PATCH | `/api/v1/jars/{jarId}/members/{userId}/role` | JarMemberRoleUpdateRequest | JarMemberRoleUpdateResponse | OWNER |

### 멤버 목록

```
GET /api/v1/jars/{jarId}/members
```

Response:

```
{
  "data": {
    "items": [
      {
        "userId":1,
        "name":"추억이",
        "profileImageUrl":null,
        "role":"OWNER",
        "joinedAt":"2026-09-16T15:00:00+09:00"
      }
    ]
  }
}
```

현재 User 엔티티에는 프로필 이미지 URL 필드가 없어 `profileImageUrl`은 null로 반환하도록 구현되어 있어.

### 저금통 나가기

```
POST /api/v1/jars/{jarId}/leave
```

별도의 Request Body는 없어.

Response:

```
{
  "data": {
    "jarId":10,
    "leftAt":"2026-09-16T16:00:00+09:00"
  }
}
```

OWNER는 현재 나가기 API를 사용할 수 없어. 저금통 소유자와 OWNER 멤버의 정합성을 유지하기 위한 규칙이야.

### 멤버 강퇴

```
POST /api/v1/jars/{jarId}/members/{userId}/kick
```

OWNER·ADMIN이 사용할 수 있어.

자기 자신을 강퇴할 수 없고, OWNER를 강퇴할 수도 없어.

Response:

```
{
  "data": {
    "jarId":10,
    "kickedUserId":2,
    "kickedAt":"2026-09-16T16:00:00+09:00"
  }
}
```

### 멤버 역할 변경

```
PATCH /api/v1/jars/{jarId}/members/{userId}/role
```

Request:

```
{
  "role":"ADMIN"
}
```

OWNER만 사용할 수 있어.

현재는 `ADMIN`과 `MEMBER` 간 역할 변경을 지원하지만 OWNER 역할을 다른 사용자에게 이전하는 기능은 구현되어 있지 않아.

따라서 Request DTO의 Enum에는 OWNER가 존재하더라도, 실제 Service는 OWNER로 변경하는 요청을 거절해.

## 2-3. 초대코드·초대링크

| Method | API | Request | Response | 권한 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/jars/{jarId}/invites` | JarInviteCreateRequest | JarInviteCreateResponse | OWNER·ADMIN |
| GET | `/api/v1/jars/{jarId}/invites` | 없음 | JarInviteListResponse | OWNER·ADMIN |
| POST | `/api/v1/jars/invites/join` | JarInviteJoinRequest | JarInviteJoinResponse | 로그인 사용자 |
| POST | `/api/v1/jars/{jarId}/invites/{inviteId}/revoke` | 없음 | JarInviteRevokeResponse | OWNER·ADMIN |

### 초대코드 생성

```
POST /api/v1/jars/{jarId}/invites
```

Request:

```
{
  "expiresInHours":24,
  "maxUses":5
}
```

두 필드 모두 선택 사항이야.

| 필드 | 제한 | 기본값 |
| --- | --- | --- |
| `expiresInHours` | 1~168시간 | 24시간 |
| `maxUses` | 1~50회 | 1회 |

Response:

```
{
  "data": {
    "inviteId":100,
    "jarId":10,
    "code":"AB12CD",
    "inviteLink":"/invite/AB12CD",
    "expiresAt":"2026-09-17T16:00:00+09:00",
    "maxUses":5,
    "usedCount":0,
    "isActive":true,
    "createdAt":"2026-09-16T16:00:00+09:00"
  }
}
```

현재 `inviteLink`는 전체 URL이 아닌 상대 경로야.

```
/invite/{code}
```

### 초대코드 목록

```
GET /api/v1/jars/{jarId}/invites
```

기존 문서에는 활성 초대코드 목록이라고 되어 있었지만, 실제 코드는 해당 저금통의 초대코드 목록을 조회하고 각 항목의 `isActive`로 사용 가능 여부를 표시해.

즉, 만료되거나 폐기된 초대코드도 목록에 포함될 수 있어.

### 초대코드로 참여

```
POST /api/v1/jars/invites/join
```

Request:

```
{
  "code":"AB12CD"
}
```

성공하면 저금통 정보와 `myRole`, `joinedAt`을 반환해.

서버는 코드 존재 여부, 만료·폐기 여부, 사용 횟수, 정원, 기존 멤버 여부를 검사해.

이미 나갔던 멤버가 다시 참여하면 기존 멤버 기록을 재활성화하고 역할은 MEMBER로 초기화해.

### 초대코드 폐기

```
POST /api/v1/jars/{jarId}/invites/{inviteId}/revoke
```

Request Body: 없음

Response:

```
{
  "data": {
    "inviteId":100,
    "revokedAt":"2026-09-16T16:30:00+09:00"
  }
}
```

폐기된 초대코드는 다시 사용할 수 없어.

# 3. Notes — 추억 쪽지

기본 경로:

```
/api/v1/jars/{jarId}/notes
```

현재는 쪽지 작성·목록·상세, 리액션, 댓글·답글 API가 구현되어 있어. 총 10개의 REST API야.

## 3-1. 쪽지 작성·조회

| Method | API | Request | Response | 성공 상태 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/jars/{jarId}/notes` | NoteCreateRequest | NoteCreateResponse | 201 |
| GET | `/api/v1/jars/{jarId}/notes` | `page`, `size` | NoteListResponse | 200 |
| GET | `/api/v1/jars/{jarId}/notes/{noteId}` | 없음 | NoteDetailResponse | 200 |

### 쪽지 작성

```
POST /api/v1/jars/{jarId}/notes
```

Request:

```
{
  "title":"함께 보낸 하루",
  "content":"오늘 정말 즐거웠어!",
  "noteDate":"2026-09-16",
  "location":"서울",
  "attachments": [
    {
      "s3Key":"notes/2026/09/16/example.png",
      "caption":"함께 찍은 사진"
    }
  ],
  "tags": ["추억","가을"]
}
```

`s3Key`는 예시이며 실제 요청에서는 업로드를 완료한 파일의 키를 사용해야 해.

입력 규칙:

| 필드 | 필수 여부 | 규칙 |
| --- | --- | --- |
| `title` | 필수 | 최대 100자 |
| `content` | 필수 | 공백만 입력 불가 |
| `noteDate` | 선택 | `YYYY-MM-DD` |
| `location` | 선택 | 최대 100자 |
| `attachments` | 선택 | 최대 10개 |
| `tags` | 선택 | 최대 10개, 각 30자 이하 |

첨부파일 하나의 요청 필드:

```
s3Key: 필수
caption: 선택, 최대 200자
```

기존 문서의 `url`, `thumbnailUrl`, `contentType`, `size`는 첨부 생성 Request에서 제거해야 해.

서버는 `s3Key`로 업로드 기록을 조회해 파일 소유자, 업로드 완료 여부 등을 확인한 뒤 쪽지에 연결해.

Response의 주요 필드:

```
noteId
jarId
authorId
title
content
isEncrypted
noteDate
location
tags
createdAt
```

현재 쪽지는 `isEncrypted=false`로 생성돼. 이 필드가 있다고 해서 AES 암호화가 구현된 것은 아니야.

또한 쪽지 작성 API는 현재 활성 멤버 여부를 검사하지만, 오픈 이후 작성 자체를 막는 별도 조건은 확인되지 않았어. 기존 문서의 추억 보존 정책과 실제 구현을 구분해야 해.

### 쪽지 목록

```
GET /api/v1/jars/{jarId}/notes?page=0&size=20
```

현재 지원하는 쿼리 파라미터:

```
page: 기본 0
size: 기본 20, 1~100
```

기존 초안에 있던 아래 검색 파라미터는 현재 구현되어 있지 않아.

```
q
tag
authorId
from
to
```

Response는 `NoteListResponse`이며 각 쪽지는 `NoteListItem`으로 반환돼.

주요 필드:

```
noteId
title
previewContent
noteDate
location
authorId
authorName
isEncrypted
createdAt
tags
attachments
myReaction
reactionCounts
commentCount
```

### 쪽지 상세

```
GET /api/v1/jars/{jarId}/notes/{noteId}
```

Response는 `NoteDetailResponse`야.

목록보다 자세한 `content`, `updatedAt` 등이 포함되고, 첨부파일과 리액션·댓글 개수도 함께 반환해.

다만 오픈 전에는 잠금 정책에 따라 민감한 필드가 마스킹돼.

## 3-2. 오픈 전 잠금 정책

현재 코드의 `JarLockLevel`은 세 가지야.

| 잠금 수준 | 실제 공개 범위 |
| --- | --- |
| HIDDEN | 제목·내용·작성자·날짜·장소 등을 숨김 |
| META_ONLY | 추억 날짜·장소·작성 시간은 노출 가능, 제목·내용·작성자 등은 숨김 |
| TITLE_ONLY | 제목·날짜·장소 등은 노출 가능, 내용과 작성자 등은 숨김 |

세 정책 모두 오픈 전 첨부파일과 리액션 세부 정보는 반환하지 않아.

HIDDEN이어도 쪽지 ID나 댓글 개수 등 일부 정보는 응답에 남아 있어. 따라서 완전히 아무 데이터도 전달하지 않는 방식은 아니야.

오픈 후에는 정상적인 상세 정보와 첨부파일이 공개돼.

## 3-3. 리액션

예전 문서에서는 예정 기능이었지만 현재는 구현되어 있어.

기본 경로:

```
/api/v1/jars/{jarId}/notes/{noteId}/reactions
```

| Method | API | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/v1/jars/{jarId}/notes/{noteId}/reactions` | NoteReactionCreateRequest | NoteReactionSummaryResponse |
| GET | `/api/v1/jars/{jarId}/notes/{noteId}/reactions` | 없음 | NoteReactionSummaryResponse |
| DELETE | `/api/v1/jars/{jarId}/notes/{noteId}/reactions` | 없음 | NoteReactionSummaryResponse |

### 리액션 추가·변경·취소

Request:

```
{
  "emoji":"LOVE"
}
```

동작:

```
리액션이 없다면 → 새로 등록

다른 리액션이 있다면 → 변경

같은 리액션을 다시 누르면 → 취소
```

현재는 사용자 한 명이 쪽지 하나에 리액션 한 개를 가질 수 있어.

Response 예시:

```
{
  "data": {
    "noteId":10,
    "myReaction":"LOVE",
    "counts": [
      {
        "emoji":"LOVE",
        "count":3
      },
      {
        "emoji":"SMILE",
        "count":2
      }
    ]
  }
}
```

DELETE 요청은 `emoji`나 `reactionId`를 전달하지 않아. 서버가 현재 로그인 사용자와 쪽지 ID를 이용해 내 리액션을 제거해.

DELETE 성공 후에도 204가 아니라 200과 최신 리액션 요약 DTO를 반환해.

리액션 API는 활성 멤버 여부와 저금통 오픈 여부를 검사해.

## 3-4. 댓글·답글

기본 경로:

```
/api/v1/jars/{jarId}/notes/{noteId}/comments
```

| Method | API | Request | Response | 성공 상태 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/jars/{jarId}/notes/{noteId}/comments` | NoteCommentCreateRequest | NoteCommentItem | 201 |
| GET | `/api/v1/jars/{jarId}/notes/{noteId}/comments` | 없음 | NoteCommentListResponse | 200 |
| PATCH | `/api/v1/jars/{jarId}/notes/{noteId}/comments/{commentId}` | NoteCommentUpdateRequest | NoteCommentItem | 200 |
| DELETE | `/api/v1/jars/{jarId}/notes/{noteId}/comments/{commentId}` | 없음 | 본문 없음 | 204 |

### 댓글 작성

Request:

```
{
  "content":"너무 좋은 추억이다!",
  "parentCommentId":null
}
```

답글을 작성할 때는 부모 댓글 ID를 전달해.

```
{
  "content":"맞아! 또 가자!",
  "parentCommentId":100
}
```

댓글 내용은 필수이고 최대 1,000자야.

### 댓글 목록

Response는 `NoteCommentListResponse`야.

```
{
  "data": {
    "items": [
      {
        "commentId":100,
        "userId":1,
        "authorName":"추억이",
        "parentCommentId":null,
        "content":"너무 좋은 추억이다!",
        "createdAt":"2026-09-16T16:00:00+09:00",
        "updatedAt":"2026-09-16T16:00:00+09:00",
        "replies": []
      }
    ]
  }
}
```

위 시간은 설명용 예시이며 실제 DTO의 날짜 타입에 따라 직렬화돼.

실제 `NoteCommentItem`은 댓글 안에 `replies` 목록을 담는 구조야.

댓글 수정·삭제는 작성자 본인만 할 수 있어.

현재 댓글 Service는 멤버 여부와 쪽지 소속 여부를 확인하지만, 댓글 목록에 별도의 오픈 상태 검사가 확인되지 않았어. 비공개 쪽지 정책을 엄격하게 적용하려면 이 부분은 추가 검토가 필요해.

# 4. Open — 저금통 오픈 및 잠금

## 4-1. 오픈 관련 공개 API

현재 오픈만을 위한 별도 REST API는 없어.

기존 저금통 API를 사용해.

| 기능 | 실제 API |
| --- | --- |
| 오픈 날짜·방식·잠금 정책 설정 | `POST /api/v1/jars` |
| 오픈 정책 수정 | `PATCH /api/v1/jars/{jarId}` |
| 오픈 상태 조회 | `GET /api/v1/jars/{jarId}` |
| 목록에서 오픈 상태 조회 | `GET /api/v1/jars` |

오픈 상태 조회 시 다음 필드를 사용해.

```
{
  "openAt":"2027-02-27T00:00:00+09:00",
  "openMode":"DAILY_DRAW",
  "lockLevel":"META_ONLY",
  "isOpen":false
}
```

별도의 `open-policy`, `countdown`, `open-events` 공개 API는 없어.

프론트에서는 `openAt`과 현재 시간을 비교해 카운트다운을 표시할 수 있어.

## 4-2. 자동 오픈 처리

실제 코드는 다음 순서로 동작해.

```
저금통 오픈 예정 시간 도달
        ↓
서버 스케줄러 또는 사용자 조회
        ↓
JarOpenProcessor 실행
        ↓
저금통 DB 행 잠금
        ↓
기존 오픈 기록 확인
        ↓
jar_open_events에 기록
        ↓
SYSTEM 채팅 저장
        ↓
트랜잭션 커밋 성공
        ↓
WebSocket 오픈 이벤트 전송
```

현재 스케줄러의 기본 검사 간격은 5초야. 설정값으로 변경할 수 있어.

`jar_open_events` 테이블에 저장된 기록을 기준으로 실제 오픈 여부를 판단해.

오픈 기록의 `openedAt`에는 처리 작업이 실행된 시각이 아니라 원래 예약된 `openAt`을 저장해.

스케줄러와 사용자 조회가 동시에 오픈을 시도하더라도 중복 기록이 생기지 않도록 DB 행 잠금과 UNIQUE 제약을 사용해.

오픈 이유는 다음 두 가지야.

```
SCHEDULED
ACCESS_TRIGGERED
```

현재 자동 오픈 과정에서 WebSocket 이벤트와 SYSTEM 채팅 메시지도 연결돼 있어.

# 5. Daily Draw — 오늘의 추억 한 장

기본 경로:

```
/api/v1/jars/{jarId}/daily-draw
```

| Method | API | Request | Response | 성공 상태 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/jars/{jarId}/daily-draw` | 없음 | DailyDrawResponse | 신규 201 / 기존 200 |
| GET | `/api/v1/jars/{jarId}/daily-draw/today` | 없음 | DailyDrawTodayResponse | 200 |
| GET | `/api/v1/jars/{jarId}/daily-draw/history` | `page`, `size` | DailyDrawHistoryResponse | 200 |

## 5-1. 오늘의 추억 뽑기

```
POST /api/v1/jars/{jarId}/daily-draw
```

별도의 Request Body는 없어.

현재 동작:

```
저금통 오픈 여부 확인
        ↓
오늘 이미 뽑은 추억이 있는가?
        ├─ YES → 기존 카드 반환
        │
        └─ NO → 아직 뽑지 않은 쪽지 중
                 무작위로 1장 선택
                        ↓
                   DB에 결과 저장
                        ↓
                   새 카드 반환
```

Response 예시:

```
{
  "data": {
    "drawId":1,
    "jarId":10,
    "drawDate":"2026-09-16",
    "newlyDrawn":true,
    "note": {
      "noteId":100,
      "jarId":10,
      "authorId":1,
      "authorName":"추억이",
      "title":"함께 보낸 하루",
      "content":"정말 즐거웠어!",
      "isEncrypted":false,
      "noteDate":"2026-09-15",
      "location":"서울",
      "tags": ["추억"],
      "attachments": [],
      "createdAt":"2026-09-15T18:00:00+09:00",
      "updatedAt":"2026-09-15T18:00:00+09:00"
    }
  }
}
```

`newlyDrawn=true`이면 이번 요청에서 새로 뽑은 카드이고 HTTP 201을 반환해.

이미 오늘 뽑은 카드가 있다면 `newlyDrawn=false`로 기존 카드를 반환하고 HTTP 200을 사용해.

### 중복 방지

기존 초안에는 분산락이라고 적혀 있었지만 현재는 저금통 DB 행에 비관적 잠금을 적용해 중복 뽑기를 막고 있어.

한국 날짜를 기준으로 하루에 한 장을 선택하며, 이미 뽑았던 쪽지는 다음 뽑기 후보에서 제외해.

현재 Daily Draw는 오픈된 저금통이라면 `ALL_AT_ONCE`, `DAILY_DRAW` 두 모드 모두 사용할 수 있어.

## 5-2. 오늘 카드 상태 조회

```
GET /api/v1/jars/{jarId}/daily-draw/today
```

Response:

```
{
  "data": {
    "hasTodayDraw":false,
    "dailyDraw":null,
    "hasRemainingNotes":true,
    "remainingCount":8,
    "totalDrawableCount":10,
    "drawnCount":2,
    "message":"아직 오늘 받은 추억이 없어요."
  }
}
```

현재 구현에서는 오늘 뽑은 카드 유무뿐 아니라 남아 있는 추억 수와 전체 뽑기 대상 수까지 함께 반환해.

## 5-3. 뽑기 기록 조회

```
GET /api/v1/jars/{jarId}/daily-draw/history?page=0&size=20
```

Response는 `DailyDrawHistoryResponse`야.

각 기록에는 다음 필드가 포함돼.

```
drawId
jarId
drawDate
noteId
title
authorId
authorName
noteDate
location
```

페이지 번호와 크기, 전체 기록 수 등의 페이징 정보도 반환해.

## 5-4. Daily Draw 실시간 이벤트

```
SUBSCRIBE /topic/jars/{jarId}/daily-draw
```

서버가 새로운 추억을 뽑았을 때 `DailyDrawSocketEventResponse`를 전송해.

이벤트 타입:

```
DAILY_DRAW_REVEALED
```

DB 트랜잭션이 성공적으로 커밋된 뒤 이벤트를 보내도록 구현되어 있어.

# 6. Chat — 저금통 채팅

현재 채팅은 REST와 STOMP WebSocket을 함께 사용해.

WebSocket은 실시간 전송을 담당하고, REST는 메시지 저장·조회·읽음 처리뿐 아니라 실시간 연결을 사용할 수 없을 때의 전송 수단으로도 사용돼.

## 6-1. REST API

기본 경로:

```
/api/v1/jars/{jarId}/chat
```

| Method | API | Request | Response | 성공 상태 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/jars/{jarId}/chat/messages` | ChatMessageSendRequest | ChatMessageResponse | 201 |
| GET | `/api/v1/jars/{jarId}/chat/messages` | `beforeMessageId`, `limit` | ChatMessageListResponse | 200 |
| GET | `/api/v1/jars/{jarId}/chat/messages/new` | `afterMessageId`, `limit` | ChatMessageListResponse | 200 |
| POST | `/api/v1/jars/{jarId}/chat/read` | ChatReadRequest | `{ "ok": true }` | 200 |
| GET | `/api/v1/jars/{jarId}/chat/unread` | 없음 | ChatUnreadResponse | 200 |

### 채팅 메시지 전송

```
POST /api/v1/jars/{jarId}/chat/messages
```

Request:

```
{
  "content":"안녕! 오늘 뭐 해?"
}
```

현재 텍스트 채팅은 최대 1,000자야.

Response:

```
{
  "data": {
    "messageId":100,
    "jarId":10,
    "senderId":1,
    "senderName":"추억이",
    "type":"TEXT",
    "content":"안녕! 오늘 뭐 해?",
    "mine":true,
    "createdAt":"2026-09-16T16:00:00"
  }
}
```

REST API로 저장된 메시지도 WebSocket 구독자에게 방송하도록 구현되어 있어.

### 기존 채팅 조회

```
GET /api/v1/jars/{jarId}/chat/messages?beforeMessageId=100&limit=30
```

| 파라미터 | 역할 |
| --- | --- |
| `beforeMessageId` | 해당 메시지보다 오래된 메시지 조회 |
| `limit` | 한 번에 가져올 메시지 수 |

`limit`의 기본값은 30, 최대값은 100이야.

`beforeMessageId`가 없는 첫 진입에서는 안 읽은 메시지가 있으면 첫 번째 미읽음 메시지부터 보여주는 로직이 구현되어 있어.

Response는 `ChatMessageListResponse`야.

주요 필드:

```
items
hasNext
nextBeforeMessageId
lastReadMessageId
firstUnreadMessageId
```

### 신규 메시지 조회

```
GET /api/v1/jars/{jarId}/chat/messages/new?afterMessageId=100&limit=30
```

Polling용 API야.

`afterMessageId`가 100이라면 100번 이후에 저장된 메시지를 조회해.

### 읽음 처리

```
POST /api/v1/jars/{jarId}/chat/read
```

Request:

```
{
  "lastReadMessageId":100
}
```

Response:

```
{
  "data": {
    "ok":true
  }
}
```

### 읽지 않은 메시지 수

```
GET /api/v1/jars/{jarId}/chat/unread
```

Response:

```
{
  "data": {
    "jarId":10,
    "unreadCount":5
  }
}
```

현재 검색 API인 `/chat/search`는 구현되어 있지 않아.

## 6-2. WebSocket 채팅

WebSocket 연결 주소:

```
로컬: ws://localhost:8080/ws
운영: wss://api.esjh.shop/ws
```

STOMP 설정:

```
CONNECT
/ws

SEND
/app/jars/{jarId}/chat.send

SUBSCRIBE
/topic/jars/{jarId}/chat
```

전송 메시지:

```
{
  "content":"안녕!"
}
```

서버는 `ChatMessageSendRequest`를 받아서 기존 ChatService에 메시지 저장을 맡겨.

이후 구독 중인 사용자에게 `ChatSocketMessageResponse`를 전송해.

```
{
  "messageId":100,
  "jarId":10,
  "senderId":1,
  "senderName":"추억이",
  "type":"TEXT",
  "content":"안녕!",
  "createdAt":"2026-09-16T16:00:00"
}
```

REST 응답의 `mine` 필드는 WebSocket 응답에는 없어.

모든 사용자가 공통 메시지를 받기 때문에 프론트가 현재 로그인한 사용자의 ID와 `senderId`를 비교해 내 메시지인지 판단해.

## 6-3. 채팅 메시지 타입

```
TEXT
SYSTEM
```

현재 `FILE` 타입은 구현되어 있지 않아.

사진·영상을 채팅에서 전송하는 별도의 파일 메시지 API도 아직 없어.

다만 SYSTEM 메시지는 멤버 입장·퇴장·강퇴·역할 변경과 저금통 오픈 등에 사용되고 있어.

## 6-4. WebSocket 인증과 권한

현재 WebSocket 연결에는 로그인된 사용자가 필요해.

STOMP 인터셉터는 다음 명령을 검사해.

```
CONNECT
SUBSCRIBE
SEND
```

다른 사용자의 알림 채널은 구독할 수 없고, 저금통 관련 채널은 해당 저금통의 활성 멤버만 구독할 수 있어.

채팅 전송도 해당 저금통 멤버만 가능해.

# 7. Files — S3 파일 업로드

현재 파일 업로드는 Presigned URL을 사용하는 방식이야.

기존 문서에서 가장 중요하게 수정해야 할 부분은 업로드 완료 처리가 선택 사항이 아니라 실제 첨부 연결을 위한 필수 과정이라는 점이야.

## 7-1. 현재 파일 업로드 API

| Method | API | Request | Response | 성공 상태 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/files/presign` | FilePresignRequest | FilePresignResponse | 200 |
| POST | `/api/v1/files/complete` | FileCompleteRequest | FileCompleteResponse | 200 |

## 7-2. Presigned URL 발급

```
POST /api/v1/files/presign
```

Request:

```
{
  "purpose":"NOTE",
  "fileName":"memory.png",
  "contentType":"image/png",
  "size":102400
}
```

Response:

```
{
  "data": {
    "uploadUrl":"https://S3-업로드용-임시-URL",
    "s3Key":"notes/2026/09/16/example.png",
    "publicUrl":"https://파일-조회용-주소",
    "expiresAt":"2026-09-16T07:05:00Z"
  }
}
```

위 URL과 파일 키는 구조를 보여주는 예시야.

현재 지원하는 `purpose`:

```
NOTE
PROFILE
JAR
```

실제 파일 크기 정책의 기본값:

| 파일 종류 | 최대 크기 |
| --- | --- |
| 이미지 | 10 MiB |
| 영상 | 30 MiB |

기본 허용 MIME 타입:

```
image/jpeg
image/png
image/webp
image/gif

video/mp4
video/quicktime
video/webm
```

위 크기와 MIME 목록은 환경설정에 따라 조정할 수 있어.

현재 `S3PresignService`는 허용된 파일 종류와 크기를 검사하고, 목적별 S3 경로를 만들어 URL을 발급해.

## 7-3. S3에 파일 직접 업로드

Presign 응답으로 받은 `uploadUrl`을 사용해 S3에 파일을 직접 PUT 요청으로 업로드해.

```
React
  ↓ Presign 요청
Spring Boot
  ↓ Presigned URL 발급
React
  ↓ PUT uploadUrl
AWS S3
```

업로드할 때는 Presign 요청에서 사용한 Content-Type과 실제 업로드할 파일을 맞춰야 해.

이 과정에서는 파일 자체를 Spring Boot의 일반 REST 요청 본문으로 전송하지 않아.

## 7-4. 업로드 완료 처리

```
POST /api/v1/files/complete
```

Request:

```
{
  "purpose":"NOTE",
  "s3Key":"notes/2026/09/16/example.png"
}
```

현재 Request에는 다음 필드가 없어.

```
jarId
noteId
messageId
```

서버는 업로드 기록을 확인한 뒤, S3 `HeadObject`를 호출해서 실제 파일이 존재하는지 검사해.

파일 크기와 Content-Type도 발급 당시 기록과 비교해.

Response의 주요 필드:

```
s3Key
purpose
publicUrl
contentType
size
completedAt
```

이 단계에서는 파일의 업로드 완료 상태를 기록하는 것이고, 아직 특정 쪽지의 첨부파일로 연결하는 것은 아니야.

## 7-5. 쪽지에 파일 연결

```
파일 업로드 완료
       ↓
s3Key 확보
       ↓
POST /api/v1/jars/{jarId}/notes
       ↓
attachments에 s3Key 전달
       ↓
서버에서 내 업로드 기록 검증
       ↓
note_attachments에 연결
```

쪽지 작성 Request:

```
{
  "title":"우리 사진",
  "content":"함께 찍은 사진이야!",
  "attachments": [
    {
      "s3Key":"notes/2026/09/16/example.png",
      "caption":"우리의 첫 사진"
    }
  ]
}
```

현재 업로드 상태는 내부적으로 다음과 같이 관리돼.

```
PRESIGNED → COMPLETED → CONSUMED
```

실제 S3 존재 여부 확인과 파일 검증을 DB 트랜잭션 밖에서 수행하도록 분리해 DB 커넥션을 오래 점유하지 않는 구조야.

기존 초안에 있던 썸네일 워커 자동 트리거는 현재 `/complete`의 동작으로 구현되어 있지 않아.

# 8. Notifications — 인앱 알림

기본 경로:

```
/api/v1/notifications
```

현재는 알림 목록 조회·미읽음 개수·개별 읽음·전체 읽음 API가 구현되어 있어.

| Method | API | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/notifications` | `page`, `size` | NotificationListResponse |
| GET | `/api/v1/notifications/unread-count` | 없음 | NotificationUnreadCountResponse |
| POST | `/api/v1/notifications/{notificationId}/read` | 없음 | NotificationReadResponse |
| POST | `/api/v1/notifications/read-all` | 없음 | NotificationReadAllResponse |

## 8-1. 알림 목록

```
GET /api/v1/notifications?page=0&size=10
```

`page` 기본값은 0, `size` 기본값은 10이야.

Response는 `NotificationListResponse`이며, 각 알림은 `NotificationItemResponse`로 반환돼.

주요 필드:

```
notificationId
type
message
isRead
readAt
createdAt
jarId
noteId
commentId
actorUserId
actorName
emoji
```

예를 들어 `jarId`와 `noteId`를 사용하면 프론트에서 알림을 눌렀을 때 해당 저금통과 쪽지로 이동할 수 있어.

## 8-2. 읽지 않은 알림 개수

```
GET /api/v1/notifications/unread-count
```

Response:

```
{
  "data": {
    "unreadCount":5
  }
}
```

## 8-3. 알림 읽음 처리

```
POST /api/v1/notifications/{notificationId}/read
```

Response:

```
{
  "data": {
    "notificationId":100,
    "isRead":true,
    "readAt":"2026-09-16T16:00:00"
  }
}
```

읽음 처리는 본인의 알림에 대해서만 수행해.

## 8-4. 모든 알림 읽음 처리

```
POST /api/v1/notifications/read-all
```

Response:

```
{
  "data": {
    "updatedCount":5,
    "readAt":"2026-09-16T16:00:00"
  }
}
```

`updatedCount`는 이번 요청에서 읽음 처리한 알림 개수야.

## 8-5. 현재 알림 종류

```
NOTE_COMMENTED
COMMENT_REPLIED
NOTE_REACTED
JAR_MEMBER_JOINED
```

현재는 댓글·답글·리액션·멤버 참여 알림이 구현되어 있어.

기존 초안에서 예정했던 `DRAW_READY`, `CHAT_MENTION` 등의 알림 타입은 현재 Enum에 없어.

## 8-6. 알림 WebSocket

```
SUBSCRIBE /topic/users/{userId}/notifications
```

서버는 알림을 DB에 저장한 뒤 해당 사용자의 채널로 `NotificationItemResponse`를 실시간 전송해.

다른 사용자의 알림 채널은 구독할 수 없도록 권한 검사를 적용해.

기존 초안의 푸시 알림·이메일 알림 Worker는 현재 구현된 인앱 알림과 구분해야 해.

# 9. Onboarding — 신규 추가된 API

기존 API 초안에는 없었지만 현재 프로젝트에는 온보딩 기능이 구현되어 있어.

온보딩은 처음 사용하는 회원에게 저금통 생성·상세·초대·Daily Draw 사용 방법 등을 안내하는 튜토리얼이야.

## 9-1. 온보딩 API

| Method | API | Request | Response |
| --- | --- | --- | --- |
| GET | `/api/v1/me/onboarding` | 없음 | OnboardingProgressResponse |
| PUT | `/api/v1/me/onboarding/{tutorialKey}` | OnboardingProgressUpdateRequest | OnboardingProgressItemResponse |

### 진행 상태 조회

```
GET /api/v1/me/onboarding
```

Response 예시:

```
{
  "data": {
    "version":1,
    "items": [
      {
        "tutorialKey":"WELCOME",
        "handled":true,
        "status":"COMPLETED",
        "finishedAt": "2026-09-16T16:00:00"
      }
    ]
  }
}
```

`version`과 `finishedAt`은 실제 서버에 저장된 값에 따라 달라져.

### 진행 상태 변경

```
PUT /api/v1/me/onboarding/{tutorialKey}
```

Request:

```
{
  "status":"COMPLETED"
}
```

현재 사용 가능한 상태:

```
COMPLETED
SKIPPED
```

현재 온보딩 종류:

```
WELCOME
JAR_LIST
JAR_CREATE
JAR_DETAIL
JAR_INVITE
DAILY_DRAW
```

튜토리얼을 완료하거나 건너뛰면 해당 항목의 최신 상태를 `OnboardingProgressItemResponse`로 반환해.

# 10. Security / Moderation — 보안 및 신고

기존 초안의 신고·관리자 API는 현재 코드에 구현되어 있지 않아.

따라서 현재 API 명세와 향후 개발 예정 항목을 구분할게.

## 10-1. 현재 인증 정책

현재 `SecurityConfig`에서 로그인 없이 사용할 수 있도록 허용한 API는 다음과 같아.

| 구분 | API |
| --- | --- |
| CSRF 발급 | `GET /api/v1/csrf` |
| 로그인 아이디 확인 | `GET /api/v1/auth/login-id/availability` |
| 회원가입 이메일 발송 | `POST /api/v1/auth/email-verifications` |
| 회원가입 이메일 확인 | `POST /api/v1/auth/email-verifications/confirm` |
| 회원가입 | `POST /api/v1/auth/signup` |
| 자체 로그인 | `POST /api/v1/auth/login` |
| 아이디 찾기 | `/api/v1/auth/login-id-recovery/**`의 구현된 POST API |
| 비밀번호 찾기 | `/api/v1/auth/password-reset` 관련 구현된 POST API |
| Refresh | `POST /api/v1/auth/refresh` |
| Logout | `POST /api/v1/auth/logout` |

OAuth2 경로도 로그인 전에 접근 가능해.

그 외 `/api/**` 요청에는 인증이 필요해.

단, Refresh는 Security 설정에서 `permitAll()`이더라도 실제 재발급에는 유효한 Refresh Token 쿠키가 필요해.

## 10-2. 저금통 권한 규칙

현재 Service 구현 기준이야.

| 기능 | 권한 |
| --- | --- |
| 저금통 생성 | 로그인 사용자 |
| 내 저금통 목록 | 로그인 사용자 |
| 특정 저금통 상세 | 활성 멤버 |
| 쪽지 작성·조회 | 활성 멤버 |
| 채팅 전송·조회 | 활성 멤버 |
| Daily Draw | 활성 멤버 + 오픈 후 |
| 초대코드 생성·조회·폐기 | OWNER·ADMIN |
| 멤버 강퇴 | OWNER·ADMIN |
| 멤버 역할 변경 | OWNER |
| 저금통 설정 수정 | OWNER·ADMIN |
| 저금통 삭제 | OWNER |

추가 제한도 있어.

- OWNER는 현재 나가기 API를 사용할 수 없어.
- OWNER 역할 이전은 아직 지원하지 않아.
- 이미 열린 저금통의 오픈 정책은 수정할 수 없어.
- 멤버가 아닌 사용자는 저금통 내부 기능에 접근할 수 없어.
- 인증되지 않은 요청은 일반적으로 401, 로그인했지만 권한이 없는 요청은 일반적으로 403이야.

실제 Service가 400이나 404를 사용하는 개별 상황도 있으므로, 모든 권한·상태 오류가 반드시 403이라고 가정하지 않아야 해.

## 10-3. 향후 추가할 신고·관리자 API

기존 초안의 다음 API는 현재 구현되지 않았어.

```
POST /api/v1/reports

GET /api/v1/admin/reports

POST /api/v1/admin/reports/{reportId}/resolve
```

신고, 차단, 관리자 신고 처리 등의 기능은 별도 개발 단계에서 API·DTO·권한을 확정해야 해.

# 11. WebSocket 전체 연결 명세

REST API 외에 현재 실제 코드에서 사용하는 실시간 연결도 한곳에 모아둘게.

## 11-1. 공통 STOMP 설정

```
WebSocket Endpoint
/ws

클라이언트 → 서버
/app

서버 → 구독자
/topic
```

현재 프로젝트는 하나의 `/ws` 연결을 통해 채팅·알림·멤버 변경·오픈·리액션·댓글·Daily Draw 이벤트를 처리해.

## 11-2. 전체 구독 채널

| 구독 주소 | 전달 데이터 |
| --- | --- |
| `/topic/jars/{jarId}/chat` | ChatSocketMessageResponse |
| `/topic/jars/{jarId}/members` | JarMemberSocketEventResponse |
| `/topic/jars/{jarId}/open` | JarOpenSocketEventResponse |
| `/topic/jars/{jarId}/notes` | NoteRealtimeEventResponse |
| `/topic/jars/{jarId}/notes/{noteId}` | NoteRealtimeEventResponse |
| `/topic/jars/{jarId}/daily-draw` | DailyDrawSocketEventResponse |
| `/topic/users/{userId}/notifications` | NotificationItemResponse |

현재 클라이언트가 직접 SEND하는 애플리케이션 목적지는 다음 한 개야.

```
/app/jars/{jarId}/chat.send
```

나머지 이벤트는 서버의 Service에서 상태 변경 후 자동 전송하는 구조야.

### 멤버 변경 이벤트

```
MEMBER_JOINED
MEMBER_LEFT
MEMBER_KICKED
MEMBER_ROLE_CHANGED
```

### 저금통 오픈 이벤트

```
JAR_OPENED
```

### 쪽지 실시간 이벤트

```
COMMENT_CREATED
COMMENT_REPLIED
COMMENT_UPDATED
COMMENT_DELETED
REACTION_CHANGED
```

### Daily Draw 이벤트

```
DAILY_DRAW_REVEALED
```

프론트에서 이벤트를 받은 뒤 필요한 정보를 REST API로 다시 조회할 수 있어.

예를 들어 리액션이 변경되었다는 WebSocket 이벤트를 받았다면, 현재 로그인한 사용자 기준의 `myReaction`을 REST로 다시 조회하는 방식이야.

WebSocket 이벤트는 DB 상태를 변경하는 REST API를 대체하는 것이 아니라, 변경된 사실을 실시간으로 전달하는 역할도 담당해.

# 12. AI 디자인 Draft API

AI 커스텀 디자인은 이미 생성된 Jar를 변경하는 API가 아니라, Jar 생성 전에 사용하는 Draft 흐름이다. 모든 경로는 인증과 CSRF 보호가 필요하며 Draft OWNER만 호출할 수 있다. Draft 상세 응답에는 Private S3 Object Key나 고정 URL을 포함하지 않는다.

| HTTP | 경로 | 현재 동작 |
| --- | --- | --- |
| `POST` | `/api/v1/design-drafts` | multipart `image` 원본을 검증·정규화해 Draft 생성 |
| `GET` | `/api/v1/design-drafts/{draftId}` | Draft 상태·선택·Slot·Generation 메타데이터 조회 |
| `POST` | `/api/v1/design-drafts/{draftId}/generations` | 서버 Catalog 스타일의 AI 후보 생성 시작 |
| `GET` | `/api/v1/design-drafts/{draftId}/original/preview` | 정규화 원본의 짧은 Presigned GET URL 발급 |
| `GET` | `/api/v1/design-drafts/{draftId}/generations/{generationId}/preview` | 성공 후보의 짧은 Presigned GET URL 발급 |
| `PATCH` | `/api/v1/design-drafts/{draftId}/selection` | `ORIGINAL`·`AI`·`DEFAULT` 선택 저장 |
| `PATCH` | `/api/v1/design-drafts/{draftId}/slot` | 커스텀 이미지 Slot의 정규화 위치·크기 저장 |
| `POST` | `/api/v1/design-drafts/{draftId}/finalize` | Draft 선택을 실제 Jar로 한 번만 확정 |

원본은 PNG/JPEG/WebP만 허용하며 서버가 실제 바이트를 검사해 `480×480` PNG로 정규화한다. AI 결과는 `1024×1024` 정사각형을 검증하고, PIXEL은 `64×64 → 24색 → 480×480` 후처리를 거친다. `PROCESSING` Generation이 있으면 Finalize를 `409`로 거절한다.

AI Draft 영역의 기능별 오류는 공통 오류 봉투의 `error.code`로 구분한다. 예를 들어 `DRAFT_NOT_OWNER`는 `403`, `AI_GENERATION_ALREADY_PROCESSING`과 `DRAFT_PROCESSING_FINALIZE_BLOCKED`는 `409`다. 화면은 문구가 아니라 이 코드를 기준으로 동작을 분기해야 한다.

# 13. 현재 미구현 API 및 향후 개발 항목

기존 초안에 있었지만 아직 구현되지 않은 기능과, AI 저금통 개발 과정에서 새로 필요해질 기능을 구분했어.

| 기능 | 현재 상태 |
| --- | --- |
| 회원 탈퇴 `DELETE /api/v1/me` | 미구현 |
| 알림 설정 조회·수정 | 미구현 |
| 쪽지 검색·태그·작성자·기간 필터 | 미구현 |
| 쪽지 수정·삭제 | 미구현 |
| 첨부파일 정렬 공개 API | DTO 및 내부 Service 존재, 공개 API 없음 |
| 채팅 검색 | 미구현 |
| 채팅 파일 전송 | 미구현 |
| Daily Draw 개인별 조회 기록 API | 미구현 |
| 저금통 오픈 히스토리 조회 API | 미구현 |
| 신고·차단·관리자 신고 처리 | 미구현 |
| AI 디자인의 기존 Jar 화면 표시 API | 미구현; Optional `JarDesign` 조회·표시 연결은 별도 작업 |

AI Draft 생성·후보 생성·원본/후보 미리보기·선택·Slot 저장·Finalize API는 구현되어 있다. 다만 Slot Editor와 최종 미리보기 화면, 기존 Jar 목록·상세·확대·오픈 연출의 Optional `JarDesign` 표시는 아직 완료되지 않았다.

# 14. 최종 API 전수 대조

현재 Controller에 선언된 API를 기능별로 다시 집계했어.

## 현재 구현된 API 현황

REST API

# 63개

STOMP 전송 API

# 1개

| Auth / CSRF / Me | 16개 |
| --- | --- |
| Jars / Members / Invites | 13개 |
| Notes / Reactions / Comments | 10개 |
| Daily Draw | 3개 |
| Chat REST | 5개 |
| Files | 2개 |
| Notifications | 4개 |
| Onboarding | 2개 |
| AI 디자인 Draft | 8개 |
| REST 합계 | 63개 |

OAuth2 인증 시작·콜백 경로는 Spring Security가 처리하므로 REST Controller 집계에서 제외했어.

실제 Controller 매핑 목록과 비교했을 때 이번 명세에서 빠진 REST 경로는 없어.

## 이번 개정에서 가장 중요한 결론

예전 문서는 프로젝트를 구현하기 전에 API를 설계했던 초안이었고, 이번 문서는 실제 작성된 코드를 기준으로 다시 구성한 명세서야.

특히 다음 사항을 현재 기준으로 바로잡았어.

- 회원가입·아이디 찾기·비밀번호 재설정·온보딩 등 추가된 API 반영
- 쪽지 리액션·댓글·답글·실시간 알림 구현 상태 반영
- 파일 업로드 완료 및 첨부 연결 과정 분리
- 실제 잠금 정책과 Daily Draw 중복 방지 방식 반영
- 현재 사용하지 않는 API와 구현된 API 구분
- 실제 HTTP 상태와 Response DTO 구분

이번 작업은 API 문서 개정이야. 프로젝트 소스는 수정하지 않았고, API를 실제 호출하는 통합 테스트나 운영 환경 검증은 수행하지 않았어.
