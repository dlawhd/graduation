# Memory Jar ERD — Markdown 문서판

저장할 파일: `docs/ERD.md` 기준: 현재 로컬 프로젝트 · Flyway V1~V33

이번에는 자동으로 그림이 표시되는 Mermaid 대신, 코드 블록 안에 텍스트 관계도를 넣었어. 아래 관계도와 테이블 구조는 일반 Markdown이므로 VS Code, 코덱스, 노션에서 내용을 직접 읽고 수정할 수 있어.

현재 로컬 프로젝트의 Flyway를 기준으로 정리했다. 애플리케이션 테이블은 총 22개이며, 기존 19개에 AI 디자인 Draft용 `jar_design_drafts`, `jar_ai_generations`, `jar_designs` 3개가 추가됐다. 예전 `members`는 `users`로 이름이 변경된 것이므로 별도 테이블로 세지 않아.

## 1. 전체 테이블 관계도

```
users (사용자)
│
├── user_local_credentials
│   └── 자체 로그인 아이디와 비밀번호
│
├── user_oauth_accounts
│   └── NAVER / GOOGLE / KAKAO 계정 연결
│
├── refresh_tokens
│   └── 로그인 유지 및 토큰 재발급
│
├── user_onboarding_progress
│   └── 튜토리얼 완료·건너뛰기 기록
│
├── jars
│   └── 사용자가 소유한 저금통
│       │
│       ├── jar_members
│       │   └── 참여자와 역할
│       │
│       ├── jar_invites
│       │   └── 초대코드와 사용 횟수
│       │
│       ├── jar_open_events
│       │   └── 저금통 오픈 기록
│       │
│       ├── notes
│       │   └── 추억 쪽지
│       │       │
│       │       ├── note_attachments
│       │       │   └── 쪽지 사진·영상
│       │       │
│       │       ├── note_reactions
│       │       │   └── 이모지 반응
│       │       │
│       │       └── note_comments
│       │           └── 댓글·답글
│       │
│       ├── chat_messages
│       │   └── 채팅 메시지
│       │
│       ├── chat_read_state
│       │   └── 사용자별 마지막 읽은 메시지
│       │
│       └── jar_daily_draws
│           └── 날짜별 오늘의 추억
│
├── file_uploads
│   └── S3 파일 업로드 상태
│
├── jar_design_drafts
│   ├── Draft 원본 이미지와 선택·Slot·만료 상태
│   └── jar_ai_generations
│       └── Draft별 AI 후보 생성 기록
│
└── notifications
    └── 사용자별 인앱 알림

email_verifications
└── 이메일 인증번호·인증 완료 토큰
    ※ 회원가입 전에도 사용하므로 users와 FK 없음

jars
└── jar_designs
    └── ORIGINAL 또는 AI 최종 이미지와 Slot Snapshot; 기본 Jar에는 행이 없음
```

위 트리는 이해하기 쉽게 주요 관계를 한 줄기로 그린 것이야. 실제로는 `notes.author_id`, `jar_members.user_id`, `notifications.user_id` 등 여러 테이블에서 `users.id`를 직접 참조해.

따라서 정확한 FK는 아래 관계표를 함께 사용하면 돼.

## 2. 전체 테이블 관계표

### 2-1. 사용자 및 인증

| 부모 테이블 | 자식 테이블 | 관계 |
| --- | --- | --- |
| users | user_local_credentials | 1 : 0~1 |
| users | user_oauth_accounts | 1 : N |
| users | refresh_tokens | 1 : N |
| users | user_onboarding_progress | 1 : N |

`email_verifications`는 별도의 FK 없이 이메일 주소와 인증 목적을 기준으로 관리해.

### 2-2. 저금통

| 부모 테이블 | 자식 테이블 | 관계 |
| --- | --- | --- |
| users | jars | 1 : N |
| users | jar_members | 1 : N |
| jars | jar_members | 1 : N |
| users | jar_invites | 1 : N |
| jars | jar_invites | 1 : N |
| jars | jar_open_events | 1 : 0~1 |

사용자와 저금통은 `jar_members`를 통해 N:M 관계를 형성해.

```
사용자 1명 → 여러 저금통 참여 가능

저금통 1개 → 여러 사용자 참여 가능

users N : M jars
        │
        └── jar_members가 연결
```

### 2-3. 쪽지

| 부모 테이블 | 자식 테이블 | 관계 |
| --- | --- | --- |
| jars | notes | 1 : N |
| users | notes | 1 : N |
| notes | note_attachments | 1 : N |
| notes | note_reactions | 1 : N |
| users | note_reactions | 1 : N |
| notes | note_comments | 1 : N |
| users | note_comments | 1 : N |
| note_comments | note_comments | 부모 댓글 1 : 답글 N |

### 2-4. 채팅·Daily Draw·알림·파일

| 부모 테이블 | 자식 테이블 | 관계 |
| --- | --- | --- |
| jars | chat_messages | 1 : N |
| users | chat_messages | 1 : N, 시스템 메시지는 작성자 없음 |
| jars | chat_read_state | 1 : N |
| users | chat_read_state | 1 : N |
| chat_messages | chat_read_state | 1 : N, 마지막 읽은 메시지 |
| jars | jar_daily_draws | 1 : N |
| notes | jar_daily_draws | FK 기준 1 : N |
| users | notifications | 1 : N |
| jars | notifications | 1 : N, 저금통 연결은 선택 |
| users | file_uploads | 1 : N |

`jar_daily_draws`는 서비스에서 같은 쪽지를 다시 뽑지 않도록 관리하지만, DB의 UNIQUE는 `(jar_id, note_id)` 조합이므로 `note_id` 단독으로 유일한 것은 아니야.

# 3. ERD 공통 규칙

## 3-1. PK, FK, UNIQUE란?

| 용어 | 의미 |
| --- | --- |
| PK | 행 하나를 식별하는 고유 번호 |
| FK | 다른 테이블을 가리키는 연결 값 |
| UNIQUE | 중복 저장을 금지하는 제약 |
| NOT NULL | 반드시 값이 있어야 함 |
| NULL | 값이 없어도 됨 |
| CHECK | DB가 저장 가능한 값의 조건을 검사 |
| INDEX | 조회할 데이터를 더 빠르게 찾도록 돕는 구조 |

## 3-2. 공통 시간 컬럼

현재 대부분의 테이블은 다음 시간 컬럼을 사용해.

```
-- 데이터를 처음 저장한 시간
created_at DATETIME(6)NOTNULL-- 데이터를 마지막으로 수정한 시간
updated_at DATETIME(6)NOTNULL-- 삭제 처리한 시간-- NULL이면 삭제 처리되지 않은 상태
deleted_at DATETIME(6)NULL
```

앞으로 아래 테이블 명세에서는 반복을 줄이기 위해 다음 표기를 사용할게.

```
[BASE]
created_at  DATETIME(6) NOT NULL
updated_at  DATETIME(6) NOT NULL
deleted_at  DATETIME(6) NULL
```

`[BASE]`는 설명용 약어야. 실제 SQL 문법이나 컬럼 이름은 아니야.

예외도 있어.

- `jar_invites`: `deleted_at` 없음
- `note_reactions`: `deleted_at` 없음
- `email_verifications`: `deleted_at` 없음

시간 컬럼이 있다고 해서 모든 테이블이 자동으로 Soft Delete되는 것은 아니야. 실제 삭제 동작은 Service에서 결정해.

# 4. 사용자·인증 ERD

## 4-1. users — 사용자

역할: Memory Jar에 가입한 사람의 기본 정보를 저장해.

```
TABLE: users

id           BIGINT       PK, AUTO_INCREMENT
email        VARCHAR(255) NULL
name         VARCHAR(50)  NULL
birthyear    VARCHAR(10)  NULL
provider     VARCHAR(20)  NULL
provider_id  VARCHAR(100) NULL

[BASE]
```

### 제약조건

```
-- 사용자 ID는 중복될 수 없다.PRIMARYKEY (id)-- 동일한 이메일의 중복 저장 방지UNIQUE (email)-- 동일한 소셜 계정의 중복 저장 방지UNIQUE (provider, provider_id)
```

`email`은 NULL을 허용하지만, 실제 이메일 값이 존재하면 UNIQUE 제약이 적용돼.

`provider`, `provider_id`는 기존 소셜 로그인 구조와의 호환을 위해 남아 있는 컬럼이야.

현재 소셜 계정 연결의 기준은 별도 `user_oauth_accounts` 테이블이야.

현재 존재하지 않는 컬럼: `status`, `profile_image_url`, `oauth_provider`

## 4-2. user_local_credentials — 자체 로그인

역할: 사용자의 로그인 아이디와 비밀번호 해시를 저장해.

```
TABLE: user_local_credentials

local_credential_id  BIGINT       PK, AUTO_INCREMENT
user_id              BIGINT       FK → users.id
login_id             VARCHAR(20)  NOT NULL
password_hash        VARCHAR(255) NOT NULL
password_changed_at  DATETIME(6)  NOT NULL

[BASE]
```

### 제약조건

```
-- 한 사용자는 자체 로그인 정보 하나만 가질 수 있다.UNIQUE (user_id)-- 같은 로그인 아이디를 중복 사용할 수 없다.UNIQUE (login_id)-- 로그인 아이디: 영문 소문자·숫자·밑줄, 4~20자CHECK (login_id REGEXP'^[a-z0-9_]{4,20}$')-- 비밀번호 해시가 비어 있으면 안 된다.CHECK (CHAR_LENGTH(TRIM(password_hash))>0)
```

### 관계

```
users.id = 1
    │
    └── user_local_credentials
        user_id = 1
        login_id = memoryjar01
```

비밀번호 원문은 DB에 저장하지 않고, PasswordEncoder가 생성한 해시를 저장해.

## 4-3. user_oauth_accounts — 소셜 로그인 연결

역할: 한 사용자가 네이버·구글·카카오 계정을 연결할 수 있게 해.

```
TABLE: user_oauth_accounts

oauth_account_id  BIGINT       PK, AUTO_INCREMENT
user_id           BIGINT       FK → users.id
provider          VARCHAR(20)  NOT NULL
provider_id       VARCHAR(100) NOT NULL

[BASE]
```

### 제약조건

```
-- 동일한 소셜 계정을 두 사용자에게 연결할 수 없다.UNIQUE (provider, provider_id)-- 한 사용자는 같은 제공자의 계정을 최대 하나 연결한다.UNIQUE (user_id, provider)-- 실제 지원하는 소셜 로그인CHECK (providerIN ('NAVER','GOOGLE','KAKAO'))
```

### 관계 예시

```
users.id = 1
    │
    ├── NAVER  / naver-123
    ├── GOOGLE / google-456
    └── KAKAO  / kakao-789
```

이 세 계정은 하나의 Memory Jar 사용자에게 연결된 로그인 수단이야.

## 4-4. refresh_tokens — 로그인 유지

역할: Refresh Token의 해시, 만료 및 폐기 상태를 관리해.

```
TABLE: refresh_tokens

token_id    BIGINT      PK, AUTO_INCREMENT
user_id     BIGINT      FK → users.id
token_hash  CHAR(64)    NOT NULL
expires_at  DATETIME(6) NOT NULL
revoked_at  DATETIME(6) NULL

[BASE]
```

### 제약조건과 인덱스

```
UNIQUE:
- token_hash

INDEX:
- idx_refresh_tokens_user_id(user_id)
- idx_refresh_tokens_expires_at(expires_at)
```

### 동작 흐름

```
로그인
  ↓
Refresh Token 발급
  ↓
token_hash 저장
  ↓
토큰 재발급
  ↓
기존 토큰 revoked_at 설정
  ↓
새 토큰 저장
```

`revoked_at`이 NULL이더라도 만료 시간이 지났다면 유효하지 않은 토큰이야.

## 4-5. email_verifications — 이메일 인증

역할: 회원가입, 아이디 찾기, 비밀번호 재설정용 인증번호와 인증 완료 토큰을 관리해.

```
TABLE: email_verifications

verification_id         BIGINT       PK, AUTO_INCREMENT
email                   VARCHAR(255) NOT NULL
purpose                 VARCHAR(30)  NOT NULL
code_hash               CHAR(64)     NOT NULL
code_expires_at          DATETIME(6)  NOT NULL
verified_at             DATETIME(6)  NULL
verification_token_hash CHAR(64)     NULL
verification_expires_at DATETIME(6)  NULL
consumed_at             DATETIME(6)  NULL
attempt_count           INT          NOT NULL, DEFAULT 0
last_sent_at            DATETIME(6)  NOT NULL
created_at              DATETIME(6)  NOT NULL
updated_at              DATETIME(6)  NOT NULL
```

이 테이블에는 `deleted_at`이 없어.

### 제약조건

```
-- 이메일과 인증 목적의 조합은 하나만 저장한다.UNIQUE (email, purpose)-- 지원하는 인증 목적CHECK (
    purposeIN ('SIGNUP','LOGIN_ID_RECOVERY','PASSWORD_RESET'
    )
)-- 인증 실패 횟수는 음수가 될 수 없다.CHECK (attempt_count>=0)
```

추가로 다음 상태를 검사해.

```
인증 전:
verified_at             = NULL
verification_token_hash = NULL
verification_expires_at = NULL

인증 성공 후:
위 세 컬럼 모두 값 존재

consumed_at이 있다면:
verified_at도 반드시 존재
```

### 인덱스

```
idx_email_verifications_code_expires_at
    (code_expires_at)

idx_email_verifications_verification_expires_at
    (verification_expires_at)
```

### users와 연결하지 않은 이유

```
이메일 입력
    ↓
email_verifications에 인증 기록
    ↓
인증 성공
    ↓
회원가입
    ↓
users에 회원 생성
```

회원가입 전에 사용자 ID가 없을 수 있어서 `user_id` FK가 없어.

## 4-6. user_onboarding_progress — 온보딩 진행 기록

역할: 사용자별 튜토리얼 완료·건너뛰기 상태를 저장해.

```
TABLE: user_onboarding_progress

onboarding_progress_id  BIGINT      PK, AUTO_INCREMENT
user_id                 BIGINT      FK → users.id
tutorial_key            VARCHAR(30) NOT NULL
tutorial_version        INT         NOT NULL
status                  VARCHAR(20) NOT NULL
finished_at             DATETIME(6) NOT NULL

[BASE]
```

### 제약조건

```
-- 같은 사용자가 같은 버전의 튜토리얼을-- 중복 저장하지 못하도록 한다.UNIQUE (user_id, tutorial_key, tutorial_version)CHECK (tutorial_version>=1)CHECK (statusIN ('COMPLETED','SKIPPED'))
```

현재 튜토리얼 종류:

```
WELCOME
JAR_LIST
JAR_CREATE
JAR_DETAIL
JAR_INVITE
DAILY_DRAW
```

### 인덱스

```
idx_user_onboarding_progress_user_version_deleted
    (user_id, tutorial_version, deleted_at)
```

여기까지가 사용자·인증 영역의 6개 테이블이야. 실제 자체 로그인·이메일 인증 테이블은 V30에서 생성했고, 아이디 찾기 인증 목적은 V31에서 추가했어.

# 5. 저금통·멤버·초대 ERD

## 5-1. jars — 저금통

역할: 저금통의 기본 정보, 소유자, 오픈 날짜 및 공개 정책을 저장해.

```
TABLE: jars

jar_id       BIGINT       PK, AUTO_INCREMENT
owner_id     BIGINT       FK → users.id
name         VARCHAR(100) NOT NULL
description  VARCHAR(255) NULL
theme        VARCHAR(30)  NOT NULL
max_members  INT          NOT NULL
open_at      DATETIME(6)  NOT NULL
open_mode    VARCHAR(30)  NOT NULL
lock_level   VARCHAR(30)  NOT NULL

[BASE]
```

### 제약조건과 인덱스

```
-- 저금통의 소유자는 실제 사용자여야 한다.FOREIGNKEY (owner_id)REFERENCES users(id)-- 최대 인원은 양수여야 한다.CHECK (max_members>0)
```

```
INDEX:
- idx_jars_owner_id(owner_id)
- idx_jars_open_at(open_at)
```

### 실제 Enum

```
theme:
SPRING, SUMMER, AUTUMN, WINTER,
LAVENDER, DEW, SAND, MOONLIGHT

open_mode:
ALL_AT_ONCE, DAILY_DRAW

lock_level:
HIDDEN, META_ONLY, TITLE_ONLY
```

### API와 DB의 차이

| 항목 | DB | 생성 API |
| --- | --- | --- |
| 이름 | VARCHAR(100) | 최대 40자 |
| 설명 | VARCHAR(255) | 최대 200자 |
| 최대 인원 | 1 이상 | 2~50명 |

DB와 API의 제한이 완전히 같지는 않아. 사용자가 일반 API를 통해 생성할 때는 더 엄격한 검증을 적용해.

### 현재 주의사항

V8에서 설정한 `theme` 컬럼의 DB 기본값은 `CUSTOM`이야.

V23에서 기존 데이터의 테마를 변경했지만 컬럼 기본값은 변경하지 않았어. 따라서 현재 Java Enum과 DB 기본값이 일치하지 않아.

현재 저금통 생성 Service는 테마를 명시적으로 저장하지만, 이후 마이그레이션에서 기본값을 정리할 필요가 있어.

## 5-2. jar_members — 저금통 멤버

역할: 누가 어떤 저금통에 참여 중인지와 멤버의 권한을 저장해.

```
TABLE: jar_members

jar_member_id BIGINT      PK, AUTO_INCREMENT
jar_id        BIGINT      FK → jars.jar_id
user_id       BIGINT      FK → users.id
role          VARCHAR(20) NOT NULL
joined_at     DATETIME(6) NOT NULL
left_at       DATETIME(6) NULL

[BASE]
```

### 제약조건

```
-- 같은 사용자의 동일 저금통 중복 가입 방지UNIQUE (jar_id, user_id)-- 허용되는 역할CHECK (roleIN ('OWNER','ADMIN','MEMBER'))
```

### 인덱스

```
idx_jar_members_user_id
    (user_id)

idx_jar_members_jar_id_deleted_at
    (jar_id, deleted_at)
```

### 참여·퇴장·재참여

```
[처음 참여]

joined_at  = 참여 시각
left_at    = NULL
deleted_at = NULL

[나가기]

left_at    = 나간 시각
deleted_at = 삭제 시각

[재참여]

기존 행을 다시 활성화

joined_at  = 재참여 시각
left_at    = NULL
deleted_at = NULL
```

한 사용자가 같은 저금통에 다시 참여할 때 기존 행을 재활성화해.

저금통 소유자는 `jars.owner_id`에도 저장되고 `jar_members`에도 OWNER로 등록돼. 이 두 정보의 일관성은 현재 Service에서 유지해.

## 5-3. jar_invites — 초대코드

역할: 저금통 초대코드의 만료 시간, 사용 횟수 및 폐기 상태를 관리해.

```
TABLE: jar_invites

invite_id  BIGINT      PK, AUTO_INCREMENT
jar_id     BIGINT      FK → jars.jar_id
created_by BIGINT      FK → users.id
code       VARCHAR(50) NOT NULL
expires_at DATETIME(6) NOT NULL
revoked_at DATETIME(6) NULL
max_uses   INT         NOT NULL, DEFAULT 1
used_count INT         NOT NULL, DEFAULT 0
created_at DATETIME(6) NOT NULL
updated_at DATETIME(6) NOT NULL
```

`deleted_at`은 없어.

### 제약조건

```
-- 초대코드 중복 방지UNIQUE (code)-- 사용 횟수 검증CHECK (max_uses>0)CHECK (used_count>=0)CHECK (used_count<= max_uses)
```

### 인덱스

```
idx_jar_invites_jar_id(jar_id)
idx_jar_invites_created_by(created_by)
idx_jar_invites_expires_at(expires_at)
```

### 사용 가능 조건

```
초대코드 존재
    ↓
현재 시간이 expires_at 이전
    ↓
revoked_at = NULL
    ↓
used_count < max_uses
    ↓
저금통 정원 등 Service 조건 확인
    ↓
참여 성공
```

## 5-4. jar_open_events — 오픈 기록

역할: 저금통이 오픈되었다는 사실을 기록해.

```
TABLE: jar_open_events

event_id   BIGINT      PK, AUTO_INCREMENT
jar_id     BIGINT      FK → jars.jar_id
opened_at  DATETIME(6) NOT NULL
reason     VARCHAR(30) NOT NULL

[BASE]
```

### 제약조건

```
-- 한 저금통에 오픈 기록은 최대 하나만 저장한다.UNIQUE (jar_id)
```

### 인덱스

```
idx_jar_open_events_opened_at(opened_at)
```

### 오픈 이유

```
SCHEDULED
    예약 시간에 스케줄러가 오픈 처리

ACCESS_TRIGGERED
    사용자가 조회할 때 오픈 시간을 확인하고 보정
```

### 오픈 시간의 의미

```
jars.open_at
    = 원래 열기로 예약한 시간

jar_open_events.opened_at
    = 실제 코드에서 기록하는 예약 오픈 시각

jar_open_events.created_at
    = 오픈 기록을 DB에 저장한 시각
```

`jars`에는 `is_open`이라는 별도 DB 컬럼이 없어.

현재 API의 `isOpen`은 오픈 기록을 기준으로 판단한 결과야.

# 6. 추억 쪽지 ERD

## 6-1. notes — 추억 쪽지

역할: 저금통에 넣은 추억 쪽지의 본문과 작성자 정보를 저장해.

```
TABLE: notes

note_id      BIGINT       PK, AUTO_INCREMENT
jar_id       BIGINT       FK → jars.jar_id
author_id    BIGINT       FK → users.id
title        VARCHAR(100) NOT NULL
content      LONGTEXT     NOT NULL
is_encrypted TINYINT(1)   NOT NULL, DEFAULT 0
note_date    DATE         NULL
location     VARCHAR(100) NULL
tags_json    TEXT         NULL

[BASE]
```

### 제약조건

```
-- 암호화 여부는 0 또는 1만 허용한다.CHECK (is_encryptedIN (0,1))
```

### 인덱스

```
idx_notes_jar_id
    (jar_id)

idx_notes_author_id
    (author_id)

idx_notes_jar_id_deleted_at_created_at
    (jar_id, deleted_at, created_at)

idx_notes_note_date
    (note_date)
```

### 태그 저장 방식

```
tags_json = '["여행", "생일", "추억"]'
```

현재는 별도의 `note_tags` 테이블 없이 `TEXT` 컬럼에 JSON 문자열을 저장해.

`is_encrypted`는 암호화 여부를 기록하는 컬럼이지만, 현재 쪽지 생성 시에는 false를 사용해. AES 암호화 기능이 완성되었다는 의미는 아니야.

## 6-2. note_attachments — 쪽지 첨부파일

역할: 쪽지에 첨부된 사진·영상의 S3 위치와 표시 정보를 저장해.

```
TABLE: note_attachments

attachment_id BIGINT        PK, AUTO_INCREMENT
note_id       BIGINT        FK → notes.note_id
sort_order    INT           NOT NULL, DEFAULT 0
s3_key        VARCHAR(500)  NOT NULL
url           VARCHAR(1000) NOT NULL
thumbnail_url VARCHAR(1000) NULL
content_type  VARCHAR(100)  NOT NULL
size          BIGINT        NOT NULL
caption       VARCHAR(200)  NULL

[BASE]
```

### 제약조건

```
-- 동일한 S3 파일 경로 중복 방지UNIQUE (s3_key)-- 같은 쪽지에 같은 정렬 순서 중복 방지UNIQUE (note_id, sort_order)CHECK (size>=0)CHECK (sort_order>=0)
```

### 인덱스

```
idx_note_attachments_note_id
    (note_id)

idx_note_attachments_note_id_deleted_at_sort_order
    (note_id, deleted_at, sort_order)

idx_note_attachments_content_type
    (content_type)
```

### 예시

```
notes.note_id = 100
    │
    ├── attachment_id = 1
    │   sort_order = 0
    │   caption = 첫 번째 사진
    │
    └── attachment_id = 2
        sort_order = 1
        caption = 두 번째 사진
```

실제 파일 자체는 AWS S3에 있고, 이 테이블에는 파일을 찾기 위한 정보가 저장돼.

## 6-3. note_reactions — 쪽지 리액션

역할: 누가 어떤 쪽지에 어떤 리액션을 눌렀는지 저장해.

```
TABLE: note_reactions

reaction_id BIGINT      PK, AUTO_INCREMENT
note_id     BIGINT      FK → notes.note_id
user_id     BIGINT      FK → users.id
emoji       VARCHAR(30) NOT NULL
created_at  DATETIME(6) NOT NULL
updated_at  DATETIME(6) NOT NULL
```

`deleted_at`은 없어.

### 제약조건

```
-- 사용자 한 명당 쪽지 하나에 리액션 하나UNIQUE (note_id, user_id)CHECK (
    emojiIN ('LOVE','SMILE','LAUGH','TOUCHING','MISS_YOU','PROUD','CHEER','THANKFUL'
    )
)
```

### 인덱스

```
idx_note_reactions_note_id
    (note_id)

idx_note_reactions_note_id_emoji
    (note_id, emoji)

idx_note_reactions_user_id
    (user_id)
```

### 동작 방식

```
LOVE 누르기
    → INSERT

SMILE로 변경
    → UPDATE

SMILE 다시 누르기
    → DELETE
```

기존 초안의 `(note_id, user_id, emoji)`가 아니라 `(note_id, user_id)`가 UNIQUE야.

## 6-4. note_comments — 댓글·답글

역할: 쪽지에 달린 댓글과 답글을 함께 저장해.

```
TABLE: note_comments

comment_id        BIGINT      PK, AUTO_INCREMENT
note_id           BIGINT      FK → notes.note_id
parent_comment_id BIGINT      FK → note_comments.comment_id, NULL
user_id           BIGINT      FK → users.id
content           TEXT        NOT NULL

[BASE]
```

### 제약조건

```
-- 완전히 빈 댓글 저장 방지CHECK (CHAR_LENGTH(content)>0)
```

### 인덱스

```
idx_note_comments_note_id
    (note_id)

idx_note_comments_note_id_deleted_at_created_at_comment_id
    (note_id, deleted_at, created_at, comment_id)

idx_note_comments_user_id
    (user_id)

idx_note_comments_note_parent_created
    (note_id, parent_comment_id,
     deleted_at, created_at, comment_id)
```

### 댓글과 답글 관계

```
comment_id = 100
parent_comment_id = NULL

    │
    ├── comment_id = 101
    │   parent_comment_id = 100
    │
    └── comment_id = 102
        parent_comment_id = 100
```

`parent_comment_id`가 NULL이면 일반 댓글이야.

값이 있으면 해당 댓글에 달린 답글이야.

DB의 자기참조 FK는 부모 댓글의 존재를 보장하고, 부모 댓글이 같은 쪽지에 속하는지는 Service에서 추가로 확인해.

# 7. 파일 업로드 ERD

## 7-1. file_uploads — S3 업로드 기록

역할: 파일 업로드 URL 발급부터 실제 첨부파일 연결까지의 상태를 관리해.

```
TABLE: file_uploads

upload_id    BIGINT        PK, AUTO_INCREMENT
user_id      BIGINT        FK → users.id
purpose      VARCHAR(30)   NOT NULL
status       VARCHAR(30)   NOT NULL
s3_key       VARCHAR(500)  NOT NULL
public_url   VARCHAR(1000) NOT NULL
content_type VARCHAR(100)  NOT NULL
size         BIGINT        NOT NULL
completed_at DATETIME(6)   NULL
consumed_at  DATETIME(6)   NULL

[BASE]
```

### 제약조건

```
-- 같은 S3 파일을 중복 등록하지 않는다.UNIQUE (s3_key)
```

### 인덱스

```
idx_file_uploads_user_id
    (user_id)

idx_file_uploads_status
    (status)

idx_file_uploads_purpose_status
    (purpose, status)
```

### 업로드 목적

```
NOTE
PROFILE
JAR
```

### 상태

```
PRESIGNED
    업로드 URL 발급

COMPLETED
    실제 S3 업로드 확인

CONSUMED
    쪽지 등 실제 데이터에 연결
```

### 실제 업로드 흐름

```
React
    │
    ▼
Spring Boot
POST /api/v1/files/presign
    │
    ▼
file_uploads
status = PRESIGNED
    │
    ▼
React → AWS S3
파일 직접 업로드
    │
    ▼
POST /api/v1/files/complete
    │
    ▼
file_uploads
status = COMPLETED
    │
    ▼
쪽지 작성 요청
attachments[].s3Key 전달
    │
    ▼
note_attachments에 연결
    │
    ▼
file_uploads
status = CONSUMED
```

### note_attachments와의 관계

```
file_uploads.s3_key
        │
        │ Service가 같은 키로 업로드 기록 확인
        ▼
note_attachments.s3_key
```

두 컬럼 사이에 DB FK는 없어.

이 관계는 서버의 파일 업로드 Service가 검증하는 업무상 연결이야.

# 8. 채팅 ERD

## 8-1. chat_messages — 채팅 메시지

역할: 저금통 안에서 주고받은 일반 채팅과 시스템 메시지를 저장해.

```
TABLE: chat_messages

message_id BIGINT      PK, AUTO_INCREMENT
jar_id     BIGINT      FK → jars.jar_id
sender_id  BIGINT      FK → users.id, NULL
type       VARCHAR(30) NOT NULL
content    TEXT        NOT NULL

[BASE]
```

### 제약조건

```
-- 현재 지원하는 메시지 타입CHECK (typeIN ('TEXT','SYSTEM'))-- 빈 문자열 저장 방지CHECK (CHAR_LENGTH(content)>0)-- 일반 메시지는 작성자가 있어야 한다.-- 시스템 메시지는 작성자가 없어야 한다.CHECK (
    (type='TEXT'AND sender_idISNOTNULL)OR
    (type='SYSTEM'AND sender_idISNULL)
)
```

### 인덱스

```
idx_chat_messages_jar_deleted_message
    (jar_id, deleted_at, message_id)

idx_chat_messages_sender_id
    (sender_id)
```

현재 채팅 타입:

```
TEXT   : 일반 사용자 메시지
SYSTEM : 입장·퇴장·오픈 등의 시스템 메시지
```

`FILE` 타입은 현재 구현되어 있지 않아.

## 8-2. chat_read_state — 채팅 읽음 위치

역할: 사용자별로 저금통 채팅을 어디까지 읽었는지 기록해.

```
TABLE: chat_read_state

chat_read_state_id   BIGINT      PK, AUTO_INCREMENT
jar_id               BIGINT      FK → jars.jar_id
user_id              BIGINT      FK → users.id
last_read_message_id BIGINT      FK → chat_messages.message_id, NULL

[BASE]
```

### 제약조건

```
-- 같은 사용자와 저금통 조합은 한 개만 존재UNIQUE (jar_id, user_id)
```

### 인덱스

```
idx_chat_read_state_user_deleted
    (user_id, deleted_at)

idx_chat_read_state_jar_deleted
    (jar_id, deleted_at)
```

### 예시

```
채팅 메시지 목록

message_id = 100
message_id = 101
message_id = 102
message_id = 103

사용자의 읽음 기록

jar_id = 10
user_id = 1
last_read_message_id = 101
```

101번까지 읽었다는 뜻이야.

102번과 103번은 읽음 위치 이후의 메시지야.

실제 미읽음 개수를 계산할 때는 자신이 보낸 메시지를 제외하는 등 추가 조건을 적용해.

`last_read_message_id`가 실제로 해당 저금통의 메시지인지는 Service에서 확인해.

# 9. Daily Draw ERD

## 9-1. jar_daily_draws — 오늘의 추억 한 장

역할: 저금통에서 날짜별로 뽑은 추억 쪽지의 결과를 저장해.

```
TABLE: jar_daily_draws

draw_id    BIGINT      PK, AUTO_INCREMENT
jar_id     BIGINT      FK → jars.jar_id
note_id    BIGINT      FK → notes.note_id
draw_date  DATE        NOT NULL

[BASE]
```

### 제약조건

```
-- 같은 날짜에 두 장을 뽑지 못하도록 한다.UNIQUE (jar_id, draw_date)-- 동일한 저금통에서 같은 쪽지를 다시 뽑지 못하도록 한다.UNIQUE (jar_id, note_id)
```

### 인덱스

```
idx_jar_daily_draws_jar_deleted_date
    (jar_id, deleted_at, draw_date)

idx_jar_daily_draws_note_id
    (note_id)
```

### 동작 방식

```
저금통 오픈
    ↓
오늘의 추억 뽑기 요청
    ↓
오늘 이미 뽑은 기록 확인
    │
    ├── 있음 → 기존 결과 반환
    │
    └── 없음 → 아직 뽑지 않은 쪽지 선택
                  ↓
              결과 저장
```

실제 동시성 제어는 Redis 분산락이 아니라 저금통 DB 행 잠금을 사용해.

# 10. 알림 ERD

## 10-1. notifications — 인앱 알림

역할: 사용자에게 보여줄 알림과 읽음 상태를 저장해.

```
TABLE: notifications

notification_id BIGINT      PK, AUTO_INCREMENT
user_id         BIGINT      FK → users.id
jar_id          BIGINT      FK → jars.jar_id, NULL
type            VARCHAR(50) NOT NULL
payload_json    LONGTEXT    NOT NULL
is_read         BOOLEAN     NOT NULL, DEFAULT FALSE
read_at         DATETIME(6) NULL

[BASE]
```

### 알림 종류

```
NOTE_COMMENTED
COMMENT_REPLIED
NOTE_REACTED
JAR_MEMBER_JOINED
```

### 제약조건

```
-- 읽지 않은 알림은 읽은 시간이 없어야 한다.-- 읽은 알림은 읽은 시간이 있어야 한다.CHECK (
    (is_read=FALSEAND read_atISNULL)OR
    (is_read=TRUEAND read_atISNOTNULL)
)-- 올바른 JSON 문서인지 확인한다.CHECK (JSON_VALID(payload_json))-- JSON의 최상위 구조는 객체여야 한다.CHECK (JSON_TYPE(payload_json)='OBJECT')
```

알림 타입도 실제 DB에서 위 네 가지 값만 허용하는 CHECK 제약을 가지고 있어.

### 인덱스

```
idx_notifications_user_deleted_created_notification
    (user_id, deleted_at,
     created_at, notification_id)

idx_notifications_user_deleted_is_read_created
    (user_id, deleted_at, is_read,
     created_at, notification_id)

idx_notifications_jar_id
    (jar_id)
```

### payload_json 예시

```
{
  "jarId":10,
  "noteId":100,
  "commentId":200,
  "actorUserId":2,
  "actorName":"친구",
  "emoji":"LOVE"
}
```

이 JSON은 알림 화면에 필요한 부가 정보를 저장해.

`payload_json` 안에 있는 ID는 실제 DB FK가 아니야.

DB에서 직접 연결하는 FK는 다음 두 개야.

```
notifications.user_id → users.id

notifications.jar_id → jars.jar_id
```

# 11. 전체 22개 테이블 최종 요약

| 번호 | 테이블 | 주요 역할 | PK |
| --- | --- | --- | --- |
| 1 | users | 사용자 기본 정보 | id |
| 2 | user_local_credentials | 자체 로그인 | local_credential_id |
| 3 | user_oauth_accounts | 소셜 계정 연결 | oauth_account_id |
| 4 | refresh_tokens | 로그인 유지 토큰 | token_id |
| 5 | email_verifications | 이메일 인증 | verification_id |
| 6 | user_onboarding_progress | 튜토리얼 기록 | onboarding_progress_id |
| 7 | jars | 저금통 | jar_id |
| 8 | jar_members | 저금통 참여자 | jar_member_id |
| 9 | jar_invites | 초대코드 | invite_id |
| 10 | jar_open_events | 오픈 기록 | event_id |
| 11 | notes | 추억 쪽지 | note_id |
| 12 | note_attachments | 쪽지 첨부파일 | attachment_id |
| 13 | note_reactions | 쪽지 리액션 | reaction_id |
| 14 | note_comments | 댓글·답글 | comment_id |
| 15 | file_uploads | S3 업로드 기록 | upload_id |
| 16 | chat_messages | 채팅 메시지 | message_id |
| 17 | chat_read_state | 채팅 읽음 위치 | chat_read_state_id |
| 18 | jar_daily_draws | 오늘의 추억 | draw_id |
| 19 | notifications | 인앱 알림 | notification_id |
| 20 | jar_design_drafts | Jar 생성 전 원본·선택·Slot·만료 상태 | draft_id |
| 21 | jar_ai_generations | Draft별 AI 후보·상태·오류·임시 S3 정리 이력 | generation_id |
| 22 | jar_designs | 최종 커스텀 이미지와 Slot Snapshot | jar_design_id |

# 12. 현재 구현되지 않은 테이블

예전 ERD 설계에는 있었지만 현재 작업 폴더에는 없는 테이블이야.

| 테이블 | 향후 용도 |
| --- | --- |
| chat_attachments | 채팅 사진·영상 첨부 |
| notification_settings | 알림 수신 설정 |
| jar_secrets | 저금통별 AES 암호화 키 |
| reports | 사용자 신고 |
| admin_notices | 운영 공지사항 |
| audit_logs | 운영 감사 로그 |
| note_tags | 태그 별도 관리. 현재는 tags_json 사용 |

AI 커스텀 디자인은 V32/V33으로 이미 반영됐다. `jars.active_ai_generation_id`는 추가하지 않았고, 디자인은 Jar 생성 전 Draft에서 선택한 뒤 커스텀 디자인일 때만 `jar_designs` 한 행으로 연결한다. 상세 컬럼·CHECK·FK·INDEX 계약은 [AI_ERD.md](ai/AI_ERD.md)를 기준으로 한다.

# 13. 이후 코드 작업에서 주의할 사항

## 13-1. DB 제약과 Service 검증은 다르다

예를 들어 다음 두 컬럼은 각각 올바른 데이터를 가리키더라도 서로 같은 저금통에 속한다는 사실이 자동으로 보장되지는 않아.

```
jar_daily_draws.jar_id
    → jars.jar_id

jar_daily_draws.note_id
    → notes.note_id
```

현재 Service가 해당 저금통의 쪽지를 뽑는 방식으로 정합성을 유지해.

같은 방식으로 다음 관계도 Service의 추가 검증이 중요해.

```
jars.owner_id
    ↔ jar_members의 OWNER

chat_read_state.jar_id
    ↔ 마지막으로 읽은 메시지의 jar_id

note_comments.note_id
    ↔ 부모 댓글의 note_id

file_uploads.s3_key
    ↔ note_attachments.s3_key
```

## 13-2. Soft Delete와 UNIQUE 제약

`deleted_at`에 값이 들어가도 기존 UNIQUE 제약은 사라지지 않아.

예를 들어:

```
users.email = user@example.com
deleted_at = 삭제 시각
```

이렇게 탈퇴 처리된 계정이 있어도, 기존 이메일 값이 남아 있다면 동일한 이메일을 새 사용자에게 INSERT할 때 UNIQUE 충돌이 발생할 수 있어.

회원 재가입, 계정 복구, 첨부파일 교체 기능을 확장할 때 확인해야 할 부분이야.

## 13-3. 기존 Flyway 파일은 수정하지 않는다

현재 마이그레이션은 V33까지 존재해.

```
V1  ~ V31 : 기존 구조와 변경 이력
V32 : AI Draft·Generation·최종 Design 테이블
V33 : Draft 원본 S3 삭제 완료 시각 및 정리 인덱스
```

이미 적용된 V1~V33을 수정하면 Flyway 체크섬이 달라질 수 있으므로 이후 변경은 새 Migration으로 추가해야 한다.
