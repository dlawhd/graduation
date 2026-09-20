# 각 API의 Request/Response DTO

현재 구현 기준

노션 복사용

## 0. 공통 규칙

### 0-1. DTO란?

DTO(Data Transfer Object)는 프론트엔드와 백엔드가 데이터를 주고받을 때 사용하는 데이터 상자야.

예를 들어 저금통을 생성할 때는 다음 순서로 동작해.

```
React에서 저금통 정보 입력
        ↓
JarCreateRequest
        ↓
Spring Boot에서 검증 및 저장
        ↓
JarCreateResponse
        ↓
React에서 생성 결과 표시
```

Request는 서버에 보내는 데이터, Response는 서버가 돌려주는 데이터야.

아래 Java 코드는 실제 DTO의 필드와 검증 조건을 기준으로 작성한 명세용 코드야. 읽기 편하게 반복되는 `package`와 `import`는 생략했으며, 중요한 로직과 검증 조건은 설명할게.

### 0-2. 공통 성공 응답

실제 프로젝트에서는 `ApiResponse<T>`를 사용해.

```
/***API응답을 data 안에 담아 일관된 형태로 전달한다.
 *
 * T는 실제로 반환할 데이터의 타입이다.
 */publicrecordApiResponse<T>(Tdata
) {// 실제 코드에서는 응답 생성 편의 메서드도 제공한다.
}
```

예를 들어 저금통 생성에 성공하면 다음과 같은 JSON이 반환돼.

```
{
  "data": {
    "jarId":10,
    "name":"우리의 추억",
    "openAt":"2027-02-27T00:00:00+09:00",
    "openMode":"DAILY_DRAW",
    "lockLevel":"META_ONLY",
    "myRole":"OWNER",
    "createdAt": "2026-09-16T15:00:00+09:00"
  }
}
```

### 0-3. 공통 오류 응답

기존 초안의 `details`는 현재 코드에 없어. 실제 오류 응답은 아래 다섯 가지 필드로 구성돼.

```
/**
 * API 처리 중 오류가 발생했을 때 전달하는 정보.
 */publicrecordErrorResponse(Stringcode,// 오류 종류Stringmessage,// 사용자에게 보여줄 설명Stringpath,// 오류가 발생한 요청 경로StringtraceId,// 로그 추적 번호LocalDateTimetimestamp// 오류 발생 시간
) {}
```

실제 응답은 `ErrorEnvelope`가 `error`로 감싸.

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

위 날짜와 ID는 구조를 보여주기 위한 예시야.

### 0-4. 공통 Enum

| Enum | 실제 사용 값 |
| --- | --- |
| JarOpenMode | `ALL_AT_ONCE`, `DAILY_DRAW` |
| JarLockLevel | `HIDDEN`, `META_ONLY`, `TITLE_ONLY` |
| JarRole | `OWNER`, `ADMIN`, `MEMBER` |
| JarTheme | `SPRING`, `SUMMER`, `AUTUMN`, `WINTER`, `LAVENDER`, `DEW`, `SAND`, `MOONLIGHT` |
| FilePurpose | `NOTE`, `PROFILE`, `JAR` |
| ChatMessageType | `TEXT`, `SYSTEM` |
| JarDraftStatus | `ACTIVE`, `FINALIZED`, `ABANDONED`, `EXPIRED` |
| JarDraftDesignType | `ORIGINAL`, `AI`, `DEFAULT` |
| JarAiStyle | `CUTE_2D`, `SOFT_25D`, `WATERCOLOR`, `HAND_DRAWN`, `WEIRDO`, `PIXEL` |
| JarAiGenerationStatus | `PROCESSING`, `SUCCEEDED`, `FAILED` |

AI Draft의 Prompt·Prompt Version·S3 Key는 클라이언트 DTO로 받지 않는다. 서버 Catalog와 Service가 결정하며, 조회 DTO에도 Private S3 Key는 포함하지 않는다.

### 0-5. 날짜와 시간

현재 프로젝트는 요청과 응답에서 두 종류의 날짜 타입을 사용해.

```
// 사용자가 선택한 날짜와 시간.// UTC 오프셋을 포함하지 않는다.LocalDateTimeopenAt;// 서버가 반환하는 저금통 오픈 시간.// +09:00과 같은 UTC 오프셋이 포함된다.OffsetDateTimeopenAt;
```

두 타입을 혼동하지 않는 것이 중요해. 모든 DTO가 같은 시간 타입을 사용하는 것은 아니야.

# 1. Jars API DTO

## A. 저금통 생성

`POST /api/v1/jars`

201 Created

### Request — JarCreateRequest

```
/*** 새로운 저금통을 만들 때 프론트엔드가 보내는 요청.
 */publicrecordJarCreateRequest(// 저금통 이름: 필수, 최대 40자
        @NotBlank
        @Size(max=40)Stringname,// 저금통 설명: 선택, 최대 200자
        @Size(max=200)Stringdescription,// 저금통 테마: 8종 중 하나
        @NotNullJarThemetheme,// 참여 가능 인원: 2~50명
        @NotNull
        @Min(2)
        @Max(50)IntegermaxMembers,// 저금통이 열리는 날짜와 시간
        @NotNullLocalDateTimeopenAt,// 전체 공개 또는 하루 한 장
        @NotNullJarOpenModeopenMode,// 오픈 전 쪽지 공개 범위
        @NotNullJarLockLevellockLevel

) {}
```

요청 JSON:

```
{
  "name": "우리1년 저금통",
  "description":"1년 동안 모아서 열어보자!",
  "theme":"LAVENDER",
  "maxMembers":2,
  "openAt":"2027-02-27T00:00:00",
  "openMode":"DAILY_DRAW",
  "lockLevel":"META_ONLY"
}
```

### Response — JarCreateResponse

```
/*** 저금통 생성이 완료되었을 때 반환하는 결과.
 */publicrecordJarCreateResponse(LongjarId,// 생성된 저금통 IDStringname,// 저금통 이름OffsetDateTimeopenAt,// 오픈 예정 시간JarOpenModeopenMode,// 오픈 방식JarLockLevellockLevel,// 잠금 정책JarRolemyRole,// 생성자의 역할: OWNEROffsetDateTimecreatedAt// 생성 시간
) {}
```

수정 사항: 기존 초안의 `COUPLE`을 실제 테마인 `LAVENDER` 등으로 바꾸고, 요청의 `openAt` 타입을 `LocalDateTime`으로 수정했어.

## B. 내가 속한 저금통 목록

`GET /api/v1/jars?page=0&size=20`

200 OK

### Response — JarListItem

```
/*** 저금통 목록 화면에서 저금통 하나를 표현한다.
 */publicrecordJarListItem(LongjarId,// 저금통 IDStringname,// 이름JarThemetheme,// 테마Stringdescription,// 설명intmemberCount,// 현재 참여 인원intmaxMembers,// 최대 인원OffsetDateTimeopenAt,// 오픈 예정 시간JarOpenModeopenMode,// 오픈 방식JarLockLevellockLevel,// 잠금 수준booleanisOpen,// 실제로 열렸는지 여부JarRolemyRole,// 내 역할OffsetDateTimeupdatedAt// 마지막 수정 시간
) {}
```

### Response — JarListResponse

```
/**
 * 저금통 목록과 페이지 정보를 함께 반환한다.
 */publicrecordJarListResponse(List<JarListItem>items,// 저금통 목록intpage,// 현재 페이지 번호intsize,// 페이지 크기longtotalElements,// 전체 저금통 수inttotalPages// 전체 페이지 수
) {}
```

예를 들어 저금통이 43개이고 한 페이지에 20개씩 보여주면 `totalPages`는 3이야.

## C. 저금통 상세 조회

`GET /api/v1/jars/{jarId}`

### Response — JarDetailResponse

```
/*** 저금통 상세 화면에 필요한 정보를 반환한다.
 */publicrecordJarDetailResponse(LongjarId,Stringname,Stringdescription,JarThemetheme,LongownerId,// 저금통 소유자 IDintmemberCount,intmaxMembers,OffsetDateTimeopenAt,JarOpenModeopenMode,JarLockLevellockLevel,booleanisOpen,JarRolemyRole,OffsetDateTimecreatedAt,OffsetDateTimeupdatedAt
) {}
```

현재 코드에는 `customJarImageUrl`이나 `activeAiGenerationId`가 없어. AI 기능을 실제로 개발할 때 추가할 필드야.

## D. 저금통 수정

`PATCH /api/v1/jars/{jarId}`

### Request — JarUpdateRequest

```
/*** 기존 저금통의 설정을 일부 변경한다.**PATCH요청이므로모든필드는 선택 사항이다.
 */publicrecordJarUpdateRequest(// 변경할 이름
        @Size(max=40)Stringname,// 변경할 설명
        @Size(max=200)Stringdescription,// 변경할 테마JarThemetheme,// 변경할 최대 인원
        @Min(2)
        @Max(50)IntegermaxMembers,// 변경할 오픈 시간LocalDateTimeopenAt,// 변경할 오픈 방식JarOpenModeopenMode,// 변경할 잠금 정책JarLockLevellockLevel

) {}
```

요청 예시:

```
{
  "name":"우리의 새로운 저금통",
  "theme":"SPRING",
  "maxMembers":5
}
```

위처럼 일부 필드만 보내면 나머지 설정을 유지하면서 변경할 수 있어.

### Response — JarUpdateResponse

```
/*** 저금통 설정 변경 결과를 반환한다.
 */publicrecordJarUpdateResponse(LongjarId,OffsetDateTimeupdatedAt
) {}
```

참고로 `@Size(max = 40)`은 글자 수를 제한하지만, 그 자체로 빈 문자열을 금지하는 것은 아니야. 실제 수정 가능 여부는 Service의 추가 검사까지 확인해야 해.

## E. 저금통 삭제

`DELETE /api/v1/jars/{jarId}`

204 No Content

Request DTO와 Response DTO가 모두 없어.

```
DELETE /api/v1/jars/10
        ↓
저금통 삭제 처리
        ↓
HTTP 204
응답 본문 없음
```

기존 초안의 방향을 그대로 유지하면 돼.

## F. 저금통 멤버 목록

`GET /api/v1/jars/{jarId}/members`

### Response — JarMemberItem

```
/**
 * 저금통에 참여 중인 멤버 한 명의 정보.
 */publicrecordJarMemberItem(LonguserId,Stringname,StringprofileImageUrl,JarRolerole,OffsetDateTimejoinedAt
) {}
```

### Response — JarMemberListResponse

```
/*** 저금통에 참여 중인 멤버들의 목록.
 */publicrecordJarMemberListResponse(List<JarMemberItem>items
) {}
```

## G. 저금통 나가기

`POST /api/v1/jars/{jarId}/leave`

요청 본문은 없어.

### Response — JarLeaveResponse

```
/**
 * 저금통에서 나간 결과를 반환한다.
 */publicrecordJarLeaveResponse(LongjarId,OffsetDateTimeleftAt
) {}
```

## H. 멤버 강퇴

`POST /api/v1/jars/{jarId}/members/{userId}/kick`

OWNER 또는 ADMIN이 사용할 수 있는 API야. 별도의 Request DTO는 없어.

### Response — JarKickResponse

```
/**
 * 멤버를 강퇴한 결과를 반환한다.
 */publicrecordJarKickResponse(LongjarId,LongkickedUserId,OffsetDateTimekickedAt
) {}
```

## I. 멤버 역할 변경

`PATCH /api/v1/jars/{jarId}/members/{userId}/role`

OWNER가 사용할 수 있는 API야.

### Request — JarMemberRoleUpdateRequest

```
/*** 특정 멤버에게 새로운 역할을 지정한다.
 */publicrecordJarMemberRoleUpdateRequest(// OWNER, ADMIN, MEMBER 중 하나
        @NotNullJarRolerole

) {}
```

### Response — JarMemberRoleUpdateResponse

```
/**
 * 멤버 역할 변경 결과를 반환한다.
 */publicrecordJarMemberRoleUpdateResponse(LongjarId,LonguserId,JarRolerole,OffsetDateTimeupdatedAt
) {}
```

## J. 초대코드 생성

`POST /api/v1/jars/{jarId}/invites`

201 Created

### Request — JarInviteCreateRequest

```
/**
 * 저금통에 참여할 수 있는 초대코드를 발급한다.
 */publicrecordJarInviteCreateRequest(// 유효 시간: 1~168시간
        @Min(1)
        @Max(168)IntegerexpiresInHours,// 최대 사용 횟수: 1~50회
        @Min(1)
        @Max(50)IntegermaxUses

) {}
```

두 필드를 생략하면 서비스 기본값인 24시간, 1회가 사용돼.

### Response — JarInviteCreateResponse

```
/*** 새로 발급한 초대코드의 정보를 반환한다.
 */publicrecordJarInviteCreateResponse(LonginviteId,LongjarId,Stringcode,StringinviteLink,OffsetDateTimeexpiresAt,IntegermaxUses,IntegerusedCount,booleanisActive,OffsetDateTimecreatedAt
) {}
```

현재 초대 링크는 다음과 같은 상대 경로야.

```
/invite/AB12CD
```

기존 초안의 `/join?code=AB12CD`와 다르므로 수정해야 해.

## K. 초대코드 목록

`GET /api/v1/jars/{jarId}/invites`

### Response — JarInviteItem

```
/*** 초대코드 하나의 사용 현황을 보여준다.
 */publicrecordJarInviteItem(LonginviteId,Stringcode,OffsetDateTimeexpiresAt,OffsetDateTimerevokedAt,IntegermaxUses,IntegerusedCount,booleanisActive,LongcreatedBy,OffsetDateTimecreatedAt
) {}
```

### Response — JarInviteListResponse

```
/**
 * 저금통에서 발급한 초대코드 목록.
 */publicrecordJarInviteListResponse(List<JarInviteItem>items
) {}
```

## L. 초대코드로 저금통 참여

`POST /api/v1/jars/invites/join`

### Request — JarInviteJoinRequest

```
/**
 * 초대코드를 이용해 저금통에 참여한다.
 */publicrecordJarInviteJoinRequest(

        @NotBlank
        @Size(min=4,max=20)Stringcode

) {}
```

### Response — JarInviteJoinResponse

```
/**
 * 저금통 참여에 성공했을 때 반환하는 결과.
 */publicrecordJarInviteJoinResponse(LongjarId,Stringname,JarRolemyRole,OffsetDateTimejoinedAt
) {}
```

## M. 초대코드 폐기

`POST /api/v1/jars/{jarId}/invites/{inviteId}/revoke`

별도의 Request DTO는 없어.

### Response — JarInviteRevokeResponse

```
/**
 * 초대코드를 사용 불가능하게 만든 결과.
 */publicrecordJarInviteRevokeResponse(LonginviteId,OffsetDateTimerevokedAt
) {}
```

여기까지가 예전 초안의 A~M에 대응하는 저금통·멤버·초대 DTO야. 각 필드와 검증 조건은 현재 작업 폴더의 실제 DTO 선언을 기준으로 했어.

# 2. Notes API DTO

이 부분은 예전 초안과 실제 코드의 차이가 커. 특히 첨부파일을 연결하는 방식과 리액션·댓글 관련 응답을 정확하게 수정해야 해.

## N. 쪽지 작성

`POST /api/v1/jars/{jarId}/notes`

201 Created

### Request — NoteCreateRequest

```
/*** 저금통에 새로운 추억 쪽지를 넣는 요청.
 */publicrecordNoteCreateRequest(// 쪽지 제목: 필수, 최대 100자
        @NotBlank
        @Size(max=100)Stringtitle,// 쪽지 내용: 필수
        @NotBlankStringcontent,// 추억이 있었던 날짜: 선택LocalDatenoteDate,// 추억의 장소: 선택, 최대 100자
        @Size(max=100)Stringlocation,// 사진·영상 첨부: 최대 10개
        @Valid
        @Size(max=NoteAttachmentPolicy.MAX_ATTACHMENTS_PER_NOTE,message="첨부파일은 최대 10개까지 넣을 수 있어."
        )List<NoteAttachmentCreateRequest>attachments,// 태그: 최대 10개, 각 태그 최대 30자
        @Size(max=10)List<@NotBlank @Size(max=30)String>tags

) {}
```

### Request — NoteAttachmentCreateRequest

```
/*** 쪽지를 작성하면서 이미 업로드한 파일을 연결한다.
 *
 * 파일 정보는 서버가 S3 업로드 기록에서 확인하므로,
 * 프론트는 s3Key와 선택적인 설명만 전달한다.
 */publicrecordNoteAttachmentCreateRequest(

        @NotBlank(message="s3Key는 비어 있을 수 없어.")Strings3Key,

        @Size(max=200,message= "첨부 설명은 최대200자까지 입력할 수 있어."
        )Stringcaption

) {// 파일 설명 없이 첨부할 때 사용하는 편의 생성자publicNoteAttachmentCreateRequest(Strings3Key) {this(s3Key,null);
    }
}
```

기존 초안에서 삭제할 요청 필드: `url`, `thumbnailUrl`, `contentType`, `size`

이 값들은 서버가 관리하는 파일 정보이므로 프론트엔드가 쪽지 작성 요청에서 다시 전달할 필요가 없어.

요청 예시:

```
{
  "title":"함께 보낸 하루",
  "content":"정말 즐거웠어!",
  "noteDate":"2026-09-16",
  "location":"서울",
  "attachments": [
    {
      "s3Key":"notes/example.png",
      "caption":"함께 찍은 사진"
    }
  ],
  "tags": ["추억","가을"]
}
```

`s3Key`는 설명용 예시야. 실제로는 내 계정으로 업로드를 완료한 파일의 키를 사용해야 해.

### Response — NoteCreateResponse

```
/**
 * 추억 쪽지 작성이 완료되었을 때 반환하는 결과.
 */publicrecordNoteCreateResponse(LongnoteId,LongjarId,LongauthorId,Stringtitle,Stringcontent,booleanisEncrypted,LocalDatenoteDate,Stringlocation,List<String>tags,OffsetDateTimecreatedAt
) {}
```

현재 코드에서는 쪽지를 생성할 때 `isEncrypted`가 `false`로 설정돼. `isEncrypted` 필드가 있다는 이유만으로 암호화 기능까지 구현됐다고 판단하면 안 돼.

또한 생성 응답에는 첨부파일 목록이 없어. 첨부파일 목록은 쪽지 조회 DTO에서 반환해.

## O. 쪽지 목록 조회

`GET /api/v1/jars/{jarId}/notes?page=0&size=20`

### Response — NoteListItem

```
/*** 쪽지 목록 화면에서 추억 카드 하나를 표현한다.
 */publicrecordNoteListItem(LongnoteId,Stringtitle,StringpreviewContent,// 목록에 표시할 미리보기LocalDatenoteDate,Stringlocation,LongauthorId,StringauthorName,booleanisEncrypted,OffsetDateTimecreatedAt,List<String>tags,List<NoteAttachmentResponse>attachments,// 현재 로그인한 사용자가 누른 리액션NoteReactionEmojimyReaction,// 리액션 종류별 개수List<NoteReactionCountItem>reactionCounts,// 댓글 및 답글 개수longcommentCount
) {}
```

### Response — NoteListResponse

```
/**
 * 쪽지 목록과 페이지 정보를 함께 반환한다.
 */publicrecordNoteListResponse(List<NoteListItem>items,intpage,intsize,longtotalElements,inttotalPages
) {}
```

### Response — NoteAttachmentResponse

```
/*** 저장된 사진·영상의 정보와 설명을 반환한다.
 */publicrecordNoteAttachmentResponse(LongattachmentId,IntegersortOrder,Strings3Key,Stringurl,StringthumbnailUrl,StringcontentType,Longsize,Stringcaption
) {}
```

예전 초안의 첨부파일 DTO에는 `caption`이 없었는데, 현재 코드에서는 사진과 함께 작성한 추억 설명을 반환해.

또한 기존 API 초안에 있던 `q`, `tag`, `authorId`, `from`, `to` 검색 파라미터는 현재 공개된 쪽지 목록 Controller에 구현되어 있지 않아. 현재 명세에는 `page`, `size`만 작성하는 게 정확해.

## P. 쪽지 상세 조회

`GET /api/v1/jars/{jarId}/notes/{noteId}`

### Response — NoteDetailResponse

```
/*** 추억 쪽지 상세 화면에 필요한 전체 정보를 반환한다.
 */publicrecordNoteDetailResponse(LongnoteId,LongjarId,LongauthorId,StringauthorName,Stringtitle,Stringcontent,booleanisEncrypted,LocalDatenoteDate,Stringlocation,OffsetDateTimecreatedAt,OffsetDateTimeupdatedAt,List<String>tags,List<NoteAttachmentResponse>attachments,// 내가 누른 리액션. 없다면 nullNoteReactionEmojimyReaction,// 이모지별 리액션 개수List<NoteReactionCountItem>reactionCounts,// 댓글 및 답글의 전체 개수longcommentCount
) {}
```

저금통이 오픈되기 전에는 잠금 정책에 따라 내용이 마스킹될 수 있어. DTO에 `content`가 있다고 해서 누구나 언제든 내용을 읽을 수 있다는 뜻은 아니야.

## P-1. 쪽지 리액션

이 부분은 예전 DTO 초안에 없었지만 현재 코드에는 구현되어 있어.

사용하는 API는 다음과 같아.

| Method | 경로 | 역할 |
| --- | --- | --- |
| POST | `/api/v1/jars/{jarId}/notes/{noteId}/reactions` | 리액션 추가·변경·취소 |
| GET | 동일 경로 | 리액션 요약 조회 |
| DELETE | 동일 경로 | 내 리액션 제거 |

### Request — NoteReactionCreateRequest

```
/*** 사용자가 쪽지에 누른 리액션을 전달한다.
 */publicrecordNoteReactionCreateRequest(

        @NotNull(message="emoji는 필수야.")NoteReactionEmojiemoji

) {}
```

현재 사용 가능한 리액션은 총 8종이야.

```
publicenumNoteReactionEmoji {LOVE,SMILE,LAUGH,TOUCHING,MISS_YOU,PROUD,CHEER,THANKFUL
}
```

### Response — NoteReactionCountItem

```
/*** 특정 이모지가 몇 번 눌렸는지 나타낸다.
 */publicrecordNoteReactionCountItem(NoteReactionEmojiemoji,longcount
) {}
```

### Response — NoteReactionSummaryResponse

```
/**
 * 쪽지 하나의 리액션 상태를 반환한다.
 */publicrecordNoteReactionSummaryResponse(LongnoteId,NoteReactionEmojimyReaction,List<NoteReactionCountItem>counts
) {}
```

동일한 이모지를 다시 누르면 해당 리액션을 취소하는 토글 방식이야. DELETE 요청도 별도 요청 본문 없이 내 리액션을 제거하고, HTTP 200과 함께 위 요약 DTO를 반환해.

## P-2. 쪽지 댓글·답글

현재 코드에는 댓글 생성, 조회, 수정, 삭제와 대댓글이 구현되어 있어.

### Request — NoteCommentCreateRequest

```
/**
 * 쪽지에 댓글 또는 답글을 작성한다.
 */publicrecordNoteCommentCreateRequest(

        @NotBlank(message="content는 비어 있을 수 없어.")
        @Size(max=1000,message="댓글은 1000자 이하로 입력해줘.")Stringcontent,// 일반 댓글이면 null, 답글이면 부모 댓글 IDLongparentCommentId

) {}
```

### Request — NoteCommentUpdateRequest

```
/*** 작성한 댓글의 내용을 수정한다.
 */publicrecordNoteCommentUpdateRequest(

        @NotBlank(message="content는 비어 있을 수 없어.")
        @Size(max=1000,message="댓글은 1000자 이하로 입력해줘.")Stringcontent

) {}
```

### Response — NoteCommentItem

```
/**
 * 댓글 한 개와 그 아래에 달린 답글을 표현한다.
 */publicrecordNoteCommentItem(LongcommentId,LonguserId,StringauthorName,LongparentCommentId,Stringcontent,OffsetDateTimecreatedAt,OffsetDateTimeupdatedAt,// 해당 댓글에 달린 답글 목록List<NoteCommentItem>replies
) {}
```

### Response — NoteCommentListResponse

```
/**
 * 쪽지에 달린 댓글 목록을 반환한다.
 */publicrecordNoteCommentListResponse(List<NoteCommentItem>items
) {}
```

| API | 요청 DTO | 응답 DTO |
| --- | --- | --- |
| POST `/comments` | NoteCommentCreateRequest | NoteCommentItem, 201 |
| GET `/comments` | 없음 | NoteCommentListResponse |
| PATCH `/comments/{commentId}` | NoteCommentUpdateRequest | NoteCommentItem |
| DELETE `/comments/{commentId}` | 없음 | 본문 없음, 204 |

위 경로는 `/api/v1/jars/{jarId}/notes/{noteId}` 뒤에 이어지는 상대 경로야.

### 내부 DTO — NoteAttachmentSortUpdateRequest

```
/*** 첨부파일의 표시 순서를 변경할 때 사용하는 DTO.
 *
 * DTO와 내부 Service는 존재하지만
 * 공개 REST 엔드포인트는 아직 연결되어 있지 않다.
 */publicrecordNoteAttachmentSortUpdateRequest(

        @NotNull(message="attachmentId는 필수야.")LongattachmentId,

        @NotNull(message="sortOrder는 필수야.")
        @PositiveOrZero(message="sortOrder는 0 이상이어야 해.")IntegersortOrder

) {}
```

예전 초안에는 추후 추가할 DTO라고 되어 있었지만, 실제로는 이미 존재하는 DTO야. 다만 외부에서 호출할 수 있는 별도의 정렬 API는 없어.

# 3. Files API DTO

## Q. S3 Presigned URL 파일 업로드

현재 파일 업로드는 네 단계로 진행돼.

```
① Presigned URL 발급
          ↓
② 프론트에서 S3로 파일 직접 업로드
          ↓
③ 서버에 업로드 완료 알림
          ↓
④ 쪽지 작성 시 s3Key 연결
```

## Q-1. 업로드 URL 발급

`POST /api/v1/files/presign`

### Request — FilePresignRequest

```
/***S3에파일을업로드할수 있는 URL을 요청한다.
 */publicrecordFilePresignRequest(

        @NotNull(message="파일 목적은 필수")FilePurposepurpose,

        @NotBlank(message="파일 이름은 비어 있을 수 없어.")StringfileName,

        @NotBlank(message="contentType은 필수야.")StringcontentType,

        @NotNull(message="파일 크기는 필수야.")
        @Positive(message="파일 크기는 0보다 커야 해.")Longsize

) {}
```

### Response — FilePresignResponse

```
/**
 * 프론트가 S3에 직접 업로드할 때 사용할 정보를 반환한다.
 */publicrecordFilePresignResponse(StringuploadUrl,Strings3Key,StringpublicUrl,OffsetDateTimeexpiresAt
) {}
```

## Q-2. 업로드 완료 처리

`POST /api/v1/files/complete`

### Request — FileCompleteRequest

```
/**
 * 파일 업로드가 완료되었음을 서버에 알린다.
 *
 * 서버는 업로드 기록과 실제 S3 파일을 확인한다.
 */publicrecordFileCompleteRequest(

        @NotNull(message="파일 목적은 필수야.")FilePurposepurpose,

        @NotBlank(message="s3Key는 비어 있을 수 없어.")Strings3Key

) {}
```

### Response — FileCompleteResponse

```
/*** 서버가 S3 파일을 확인한 뒤 반환하는 파일 정보.
 */publicrecordFileCompleteResponse(Strings3Key,FilePurposepurpose,StringpublicUrl,StringcontentType,Longsize,OffsetDateTimecompletedAt
) {}
```

이전 초안의 완료 요청에는 `jarId`, `noteId`, `messageId` 등이 있었지만, 현재 `FileCompleteRequest`에는 이 필드들이 없어.

파일 업로드 완료 처리와 쪽지에 파일을 연결하는 처리가 분리되어 있기 때문이야.

# 4. Auth / Account DTO

기존 초안에는 자체 로그인, 회원가입, 이메일 인증, 계정 복구 DTO가 없었어. 현재 구현에 맞춰 모두 추가할게.

먼저 앞의 공통 오류 DTO를 한 가지 정확히 정정할게. `ErrorResponse`는 설명을 위해 단순한 `record`처럼 표시했지만, 실제 코드는 Lombok을 사용하는 클래스야. 실제 구조는 다음과 같아.

```
/**
 * API 오류 정보를 만드는 실제 ErrorResponse 구조.
 */
@Getter
@Builder
@AllArgsConstructor(access=AccessLevel.PRIVATE)publicclassErrorResponse {privatefinalStringcode;privatefinalStringmessage;privatefinalStringpath;privatefinalStringtraceId;privatefinalLocalDateTimetimestamp;// 오류 코드, 메시지, 요청 경로를 받아 응답을 생성한다.publicstaticErrorResponseof(Stringcode,Stringmessage,Stringpath
    ) {returnErrorResponse.builder().code(code).message(message).path(path).traceId(MDC.get("traceId")).timestamp(LocalDateTime.now()).build();
    }
}
```

실제 필드 다섯 가지는 앞에서 설명한 것과 동일해.

## 4-1. 로그인 아이디 중복 확인

`GET /api/v1/auth/login-id/availability?loginId=...`

### Response — LoginIdAvailabilityResponse

```
/*** 입력한 로그인 아이디를 사용할 수 있는지 반환한다.
 */publicrecordLoginIdAvailabilityResponse(StringloginId,// 서버에서 정규화한 아이디booleanavailable// true면 사용 가능
) {}
```

이 API의 `loginId`는 JSON Request DTO가 아니라 URL의 쿼리 파라미터로 전달해.

## 4-2. 이메일 인증번호 발송

`POST /api/v1/auth/email-verifications`

### Request — EmailVerificationSendRequest

```
/**
 * 인증번호를 받을 이메일 주소를 전달한다.
 */publicrecordEmailVerificationSendRequest(

        @NotBlank(message="이메일을 입력해 주세요.")
        @Email(message="이메일 형식을 확인해 주세요.")
        @Size(max=255,message="이메일은 255자 이하로 입력해 주세요.")Stringemail

) {}
```

### Response — EmailVerificationSendResponse

```
/*** 인증메일 발송 결과를 반환한다.** 실제6자리 인증번호는 응답에 포함하지 않는다.
 */publicrecordEmailVerificationSendResponse(Stringemail,LocalDateTimeexpiresAt
) {}
```

## 4-3. 이메일 인증번호 확인

`POST /api/v1/auth/email-verifications/confirm`

### Request — EmailVerificationConfirmRequest

```
/**
 * 이메일로 받은 숫자 6자리 인증번호를 확인한다.
 */publicrecordEmailVerificationConfirmRequest(

        @NotBlank(message="이메일을 입력해 주세요.")
        @Email(message="이메일 형식을 확인해 주세요.")
        @Size(max=255,message="이메일은 255자 이하로 입력해 주세요.")Stringemail,

        @NotBlank(message="인증번호를 입력해 주세요.")
        @Pattern(regexp="^\\d{6}$",message="인증번호는 숫자 6자리여야 해요."
        )Stringcode

) {}
```

### Response — EmailVerificationConfirmResponse

```
/**
 * 이메일 인증에 성공한 뒤 회원가입에 필요한 정보를 반환한다.
 */publicrecordEmailVerificationConfirmResponse(Stringemail,// 회원가입에 사용할 1회성 인증 완료 토큰StringverificationToken,// 인증 완료 토큰 만료 시간LocalDateTimeverificationExpiresAt,// 이미 등록된 이메일인지 여부booleanexistingAccount,// 기존 계정의 로그인 방법List<String>loginMethods

) {// null이 아닌 빈 목록을 반환하도록 정리한다.publicEmailVerificationConfirmResponse {loginMethods=loginMethods==null?List.of()
                :List.copyOf(loginMethods);
    }
}
```

예를 들어 인증한 이메일이 이미 구글 로그인에 연결되어 있다면 `loginMethods`에 `GOOGLE`이 포함될 수 있어.

로그인 방법 정보는 인증번호 확인에 성공한 이후 반환하는 구조야.

## 4-4. 자체 회원가입

`POST /api/v1/auth/signup`

### Request — LocalSignupRequest

```
/**
 * Memory Jar 자체 회원가입에 필요한 정보를 전달한다.
 */publicrecordLocalSignupRequest(// 로그인 아이디: 영문·숫자·밑줄, 4~20자
        @NotBlank(message="아이디를 입력해 주세요.")
        @Size(min=4,max=20,message="아이디는 4~20자로 입력해 주세요."
        )
        @Pattern(regexp="^[A-Za-z0-9_]+$",message="아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
        )StringloginId,// 비밀번호: 8~100자, 영문·숫자·특수문자 각 1개 이상
        @NotBlank(message="비밀번호를 입력해 주세요.")
        @Size(min=8,max=100,message="비밀번호는 8~100자로 입력해 주세요."
        )
        @Pattern(regexp="^(?=.*[A-Za-z])"+"(?=.*[0-9])"+
                        "(?=.*[\\x21-\\x2F\\x3A-\\x40\\x5B-\\x60\\x7B-\\x7E]).+$",message="비밀번호는 영문, 숫자, 특수문자를 각각 1자 이상 포함해 주세요."
        )Stringpassword,// 닉네임: 한글·영문·숫자만 허용
        @NotBlank(message="닉네임을 입력해 주세요.")
        @Size(max=16,message="닉네임 길이를 확인해 주세요.")
        @Pattern(regexp="^[가-힣A-Za-z0-9]+$",message= "닉네임은 한글, 영문, 숫자만 사용할 수 있어요."
        )Stringnickname,// 이메일 인증을 완료한 주소
        @NotBlank(message="이메일을 입력해 주세요.")
        @Email(message="이메일 형식을 확인해 주세요.")
        @Size(max=255)Stringemail,// 인증번호 확인 후 서버가 발급한 토큰
        @NotBlank(message="이메일 인증을 완료해 주세요.")
        @Size(max=200)StringverificationToken

) {}
```

닉네임은 Service의 `NicknamePolicy`에서도 추가 검증해. 위 DTO의 최대 16자만으로 한글·영문에 대한 실제 길이 규칙을 전부 표현한 것은 아니야.

### Response — LocalAuthResponse

```
/**
 * 자체 회원가입 또는 자체 로그인에 성공한 사용자 정보.
 */publicrecordLocalAuthResponse(LonguserId,StringloginId,Stringnickname,Stringemail
) {}
```

회원가입에 성공하면 인증 쿠키가 설정돼. JWT 자체를 위 Response DTO에 담아 반환하는 방식은 아니야.

## 4-5. 자체 로그인

`POST /api/v1/auth/login`

### Request — LocalLoginRequest

```
/**
 * 로그인 아이디와 비밀번호를 전달한다.
 */publicrecordLocalLoginRequest(

        @NotBlank(message="아이디를 입력해 주세요.")
        @Size(max=20,message="아이디는 4~20자로 입력해 주세요."
        )
        @Pattern(regexp="^\\s*$|^.{4,20}$",message="아이디는 4~20자로 입력해 주세요."
        )StringloginId,

        @NotBlank(message="비밀번호를 입력해 주세요.")
        @Size(max=100,message="비밀번호는 100자 이하로 입력해 주세요."
        )Stringpassword

) {}
```

Response는 회원가입과 동일한 `LocalAuthResponse`를 재사용해.

### 인증 관련 공통 API

| API | 요청 | 응답 |
| --- | --- | --- |
| POST `/api/v1/auth/refresh` | 본문 없음 | `{ "data": { "ok": true } }` |
| POST `/api/v1/auth/logout` | 본문 없음 | `{ "data": { "ok": true } }` |
| GET `/api/v1/csrf` | 없음 | CsrfResponse |

Refresh와 Logout의 `{ok:true}`는 별도의 Java record가 아니라 Map으로 구성하는 응답이야.

### Response — CsrfResponse

```
/*** 클라이언트가 변경 요청에 사용할 CSRF 토큰 정보를 반환한다.
 */publicrecordCsrfResponse(StringheaderName,// 토큰을 넣어 보낼 HTTP 헤더 이름StringparameterName,// CSRF 파라미터 이름Stringtoken// 실제 CSRF 토큰
) {}
```

## 4-6. 아이디 찾기

현재 아이디 찾기는 이메일 인증을 거친 후 결과를 반환해.

| 단계 | API | 요청 DTO |
| --- | --- | --- |
| 인증번호 발송 | POST `/api/v1/auth/login-id-recovery/email-verifications` | EmailVerificationSendRequest |
| 인증번호 확인 | POST `/api/v1/auth/login-id-recovery/confirm` | EmailVerificationConfirmRequest |

위 두 Request DTO는 앞에서 정의한 것을 그대로 재사용해.

### Response — LoginIdRecoveryResponse

```
/**
 * 이메일 본인 확인이 끝난 사용자에게 아이디 찾기 결과를 반환한다.
 */publicrecordLoginIdRecoveryResponse(Stringemail,booleanexistingAccount,// LOCAL 계정이 없으면 nullStringloginId,// LOCAL, NAVER, GOOGLE, KAKAO 등의 로그인 방법List<String>loginMethods

) {// 로그인 방법 목록이 null이면 빈 배열로 통일한다.publicLoginIdRecoveryResponse {loginMethods=loginMethods==null?List.of()
                :List.copyOf(loginMethods);
    }
}
```

## 4-7. 비밀번호 찾기 및 재설정

현재 코드는 아이디 확인 → 이메일 인증 → 재설정 토큰 발급 → 비밀번호 변경 순서야.

### ① 아이디 확인

`POST /api/v1/auth/password-reset/login-id/check`

Request — PasswordResetLoginIdCheckRequest

```
/*** 비밀번호를 재설정할LOCAL로그인아이디를 확인한다.
 */publicrecordPasswordResetLoginIdCheckRequest(

        @NotBlank(message="아이디를 입력해 주세요.")
        @Pattern(regexp="^\\s*$|^[A-Za-z0-9_]{4,20}$",message="아이디는 4~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
        )StringloginId

) {}
```

Response — PasswordResetLoginIdCheckResponse

```
/**
 * 입력한 LOCAL 로그인 아이디가 유효한지 반환한다.
 */publicrecordPasswordResetLoginIdCheckResponse(StringloginId,booleanvalid
) {}
```

### ② 계정에 연결된 이메일 인증번호 발송

`POST /api/v1/auth/password-reset/email-verifications`

Request — PasswordResetEmailVerificationSendRequest

```
/**
 * 로그인 아이디와 이메일이 같은 계정에 속하는지 확인하고
 * 비밀번호 재설정용 인증메일 발송을 요청한다.
 */publicrecordPasswordResetEmailVerificationSendRequest(

        @NotBlank(message="아이디를 입력해 주세요.")
        @Pattern(regexp="^\\s*$|^[A-Za-z0-9_]{4,20}$",message= "아이디는 4~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
        )StringloginId,

        @NotBlank(message="이메일을 입력해 주세요.")
        @Email(message="이메일 형식을 확인해 주세요.")
        @Size(max=255,message="이메일은 255자 이하로 입력해 주세요."
        )Stringemail

) {}
```

Response는 `EmailVerificationSendResponse`를 재사용해.

### ③ 이메일 인증번호 확인

`POST /api/v1/auth/password-reset/email-verifications/confirm`

Request — PasswordResetEmailVerificationConfirmRequest

```
/*** 비밀번호 재설정용 이메일 인증번호를 확인한다.
 */publicrecordPasswordResetEmailVerificationConfirmRequest(

        @NotBlank(message="아이디를 입력해 주세요.")
        @Pattern(regexp="^\\s*$|^[A-Za-z0-9_]{4,20}$",message="아이디는 4~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
        )StringloginId,

        @NotBlank(message="이메일을 입력해 주세요.")
        @Email(message="이메일 형식을 확인해 주세요.")
        @Size(max=255)Stringemail,

        @NotBlank(message="인증번호를 입력해 주세요.")
        @Pattern(regexp="^\\d{6}$",message="인증번호는 숫자 6자리여야 해요."
        )Stringcode

) {}
```

Response — PasswordResetEmailVerificationConfirmResponse

```
/**
 * 인증에 성공한 사용자에게 비밀번호 재설정용 토큰을 발급한다.
 */publicrecordPasswordResetEmailVerificationConfirmResponse(// 새 비밀번호 저장 요청에 사용할 일회용 토큰StringpasswordResetToken,// 토큰 만료 시간LocalDateTimeexpiresAt

) {}
```

### ④ 새 비밀번호 저장

`POST /api/v1/auth/password-reset`

Request — PasswordResetRequest

```
/**
 * 이메일 인증을 완료한 사용자가 새 비밀번호를 저장한다.
 */publicrecordPasswordResetRequest(

        @NotBlank(message="아이디를 입력해 주세요.")
        @Pattern(regexp="^\\s*$|^[A-Za-z0-9_]{4,20}$",message= "아이디는4~20자의 영문, 숫자, 밑줄(_)만 사용할 수 있어요."
        )StringloginId,

        @NotBlank(message="이메일을 입력해 주세요.")
        @Email(message="이메일 형식을 확인해 주세요.")
        @Size(max=255)Stringemail,// 인증 확인 후 발급받은 일회용 토큰
        @NotBlank(message="이메일 인증을 완료해 주세요.")
        @Size(max=200)StringpasswordResetToken,// 새 비밀번호
        @NotBlank(message="새 비밀번호를 입력해 주세요.")
        @Size(max=100,message="비밀번호는 100자 이하로 입력해 주세요."
        )StringnewPassword,// 새 비밀번호를 한 번 더 입력한 값
        @NotBlank(message= "새 비밀번호를 한 번 더 입력해 주세요.")
        @Size(max=100)StringnewPasswordConfirm

) {}
```

Response — PasswordResetResponse

```
/**
 * 비밀번호 변경이 완료되었음을 반환한다.
 */publicrecordPasswordResetResponse(booleanok
) {}
```

여기서 중요한 점은 DTO의 `newPassword`에는 최대 길이 제한만 선언되어 있고, 추가 비밀번호 정책과 확인값 일치 여부는 Service에서 검사한다는 거야.

비밀번호가 변경되면 기존 Refresh Token도 폐기하는 흐름이 구현되어 있어.

## 4-8. 내 정보 조회 및 수정

### 내 정보 조회

`GET /api/v1/me`

Response — MeResponse

```
/**
 * 로그인한 사용자의 기본 정보를 반환한다.
 */publicrecordMeResponse(ObjectuserId,Stringemail,Stringname,Stringbirthyear
) {}
```

실제 Java 선언에서 `userId` 타입은 `Object`야. 현재 명세에서는 임의로 `Long`으로 변경하지 않았어.

### 내 정보 수정

`PATCH /api/v1/me`

Request — MeUpdateRequest

```
/**
 * 로그인한 사용자의 닉네임을 변경한다.
 */publicrecordMeUpdateRequest(

        @NotBlank(message="닉네임을 입력해 주세요.")
        @Size(max=16,message="닉네임 길이를 확인해 주세요.")
        @Pattern(regexp= "^[가-힣A-Za-z0-9]+$",message="닉네임은 한글, 영문, 숫자만 사용할 수 있어요."
        )Stringnickname

) {}
```

Response는 앞에서 정의한 `MeResponse`를 재사용해.

# 5. Chat DTO

현재 채팅은 REST와 WebSocket을 함께 사용해. 두 방식이 서로 다른 응답 DTO를 사용한다는 점이 중요해.

## 5-1. 채팅 메시지 전송

`POST /api/v1/jars/{jarId}/chat/messages`

201 Created

### Request — ChatMessageSendRequest

```
/**
 * 사용자가 채팅방에 텍스트 메시지를 보낼 때 사용한다.
 */publicrecordChatMessageSendRequest(

        @NotBlank(message="채팅 내용은 비어 있을 수 없어요.")
        @Size(max=1000,message="채팅 내용은 1000자 이하로 입력해 주세요."
        )Stringcontent

) {}
```

### Response — ChatMessageResponse

```
/**
 * REST API에서 채팅 메시지 한 개를 반환한다.
 */publicrecordChatMessageResponse(LongmessageId,LongjarId,LongsenderId,// 시스템 메시지는 null 가능StringsenderName,// 시스템 메시지는 null 가능ChatMessageTypetype,Stringcontent,// 현재 로그인한 사용자가 보낸 메시지인지booleanmine,LocalDateTimecreatedAt
) {}
```

현재 메시지 타입은 `TEXT`, `SYSTEM`이야. 기존 초안에 있던 `FILE` 타입과 채팅 전용 파일 첨부 DTO는 구현되어 있지 않아.

## 5-2. 채팅 목록 조회

사용하는 API는 두 가지야.

```
GET /api/v1/jars/{jarId}/chat/messages
GET /api/v1/jars/{jarId}/chat/messages/new
```

첫 번째 API는 이전 메시지 조회, 두 번째 API는 Polling 방식의 신규 메시지 조회에 사용돼.

### Response — ChatMessageListResponse

```
/*** 채팅 메시지 목록과 읽음 위치 정보를 반환한다.
 */publicrecordChatMessageListResponse(// 조회된 메시지 목록List<ChatMessageResponse>items,// 더 이전 메시지가 존재하는지booleanhasNext,// 다음 과거 메시지 조회에 사용할 IDLongnextBeforeMessageId,// 내가 마지막으로 읽은 메시지 IDLonglastReadMessageId,// 첫 번째 안 읽은 메시지 IDLongfirstUnreadMessageId

) {// 읽음 위치 정보가 필요 없는 목록을 만들 때 사용한다.publicstaticChatMessageListResponseof(List<ChatMessageResponse>items,booleanhasNext,LongnextBeforeMessageId
    ) {returnnewChatMessageListResponse(items,hasNext,nextBeforeMessageId,null,null
        );
    }// 채팅방 입장 시 읽음 위치까지 포함한 목록을 만든다.publicstaticChatMessageListResponseof(List<ChatMessageResponse>items,booleanhasNext,LongnextBeforeMessageId,LonglastReadMessageId,LongfirstUnreadMessageId
    ) {returnnewChatMessageListResponse(items,hasNext,nextBeforeMessageId,lastReadMessageId,firstUnreadMessageId
        );
    }
}
```

과거 메시지 조회에는 `beforeMessageId`, 신규 메시지 조회에는 `afterMessageId`를 쿼리 파라미터로 전달해. `limit`의 서비스 기본값은 30, 최대값은 100이야.

## 5-3. 채팅 읽음 처리

`POST /api/v1/jars/{jarId}/chat/read`

### Request — ChatReadRequest

```
/**
 * 사용자가 마지막으로 읽은 채팅 메시지를 서버에 알려준다.
 */publicrecordChatReadRequest(

        @NotNull(message="마지막으로 읽은 메시지 ID는 필수예요.")
        @Positive(message="마지막으로 읽은 메시지 ID는 1 이상이어야 해요.")LonglastReadMessageId

) {}
```

성공하면 다음 응답을 반환해.

```
{
  "data": {
    "ok":true
  }
}
```

별도의 `ChatReadResponse` 클래스는 없어.

## 5-4. 읽지 않은 메시지 개수

`GET /api/v1/jars/{jarId}/chat/unread`

### Response — ChatUnreadResponse

```
/**
 * 특정 저금통 채팅방에서 읽지 않은 메시지 개수를 반환한다.
 */publicrecordChatUnreadResponse(LongjarId,longunreadCount
) {}
```

## 5-5. WebSocket 채팅

현재 메시지 전송 경로는 다음과 같아.

```
SEND
/app/jars/{jarId}/chat.send

SUBSCRIBE
/topic/jars/{jarId}/chat
```

전송 요청에는 앞에서 정의한 `ChatMessageSendRequest`를 재사용해.

### Response — ChatSocketMessageResponse

```
/*** 모든 채팅방 구독자에게 실시간으로 전달할 메시지.**REST와 달리 mine 필드를 포함하지 않는다.
 */publicrecordChatSocketMessageResponse(LongmessageId,LongjarId,LongsenderId,StringsenderName,ChatMessageTypetype,Stringcontent,LocalDateTimecreatedAt
) {// 기존 REST 응답을 실시간 전송용 DTO로 변환한다.publicstaticChatSocketMessageResponsefrom(ChatMessageResponseresponse
    ) {returnnewChatSocketMessageResponse(response.messageId(),response.jarId(),response.senderId(),response.senderName(),response.type(),response.content(),response.createdAt()
        );
    }
}
```

WebSocket에서는 여러 사람이 같은 메시지를 받기 때문에 `mine`을 서버가 공통으로 결정해서 보내지 않아.

프론트엔드에서 다음과 같이 판단하는 구조야.

```
// 메시지 작성자와 현재 로그인한 사용자가 같으면 내 메시지다.constmine=message.senderId===currentUserId;
```

STOMP 메시지는 REST API와 달리 `{ "data": ... }` 형태로 감싸지 않는다는 점도 구분해야 해.

# 6. Daily Draw DTO

오늘의 추억 한 장 기능에 사용하는 DTO야.

## 6-1. 오늘의 추억 뽑기

`POST /api/v1/jars/{jarId}/daily-draw`

별도의 Request DTO는 없어.

새로운 추억을 뽑으면 201, 이미 뽑힌 추억을 반환하면 200이야.

### Response — DailyDrawResponse

```
/**
 * 오늘의 추억 한 장 뽑기 결과를 반환한다.
 */publicrecordDailyDrawResponse(LongdrawId,LongjarId,LocalDatedrawDate,// 이번 요청에서 새로 뽑았다면 truebooleannewlyDrawn,// 뽑힌 추억 쪽지의 상세 정보DailyDrawNoteResponsenote
) {}
```

### Response — DailyDrawNoteResponse

```
/**
 * Daily Draw로 공개된 추억 쪽지의 상세 정보.
 */publicrecordDailyDrawNoteResponse(LongnoteId,LongjarId,LongauthorId,StringauthorName,Stringtitle,Stringcontent,booleanisEncrypted,LocalDatenoteDate,Stringlocation,List<String>tags,List<NoteAttachmentResponse>attachments,OffsetDateTimecreatedAt,OffsetDateTimeupdatedAt
) {}
```

## 6-2. 오늘의 추억 상태 조회

`GET /api/v1/jars/{jarId}/daily-draw/today`

### Response — DailyDrawTodayResponse

```
/**
 * 오늘의 추억이 이미 뽑혔는지와
 * 아직 남아 있는 추억의 수를 반환한다.
 */publicrecordDailyDrawTodayResponse(booleanhasTodayDraw,// 오늘 아직 뽑지 않았다면 nullDailyDrawResponsedailyDraw,booleanhasRemainingNotes,longremainingCount,longtotalDrawableCount,longdrawnCount,// 현재 상태에 맞는 안내 문구Stringmessage

) {// 오늘의 추억이 이미 존재할 때 사용한다.publicstaticDailyDrawTodayResponsefound(DailyDrawResponsedailyDraw,longremainingCount,longtotalDrawableCount,longdrawnCount
    ) {returnnewDailyDrawTodayResponse(true,dailyDraw,remainingCount>0,remainingCount,totalDrawableCount,drawnCount,"오늘의 추억 한 장이 공개되었어요."
        );
    }// 오늘 아직 추억을 뽑지 않았을 때 사용한다.publicstaticDailyDrawTodayResponseempty(longremainingCount,longtotalDrawableCount,longdrawnCount
    ) {returnnewDailyDrawTodayResponse(false,null,remainingCount>0,remainingCount,totalDrawableCount,drawnCount,resolveEmptyMessage(remainingCount,totalDrawableCount,drawnCount
                )
        );
    }// 남아 있는 추억의 상태에 따라 안내 문구를 선택한다.privatestaticStringresolveEmptyMessage(longremainingCount,longtotalDrawableCount,longdrawnCount
    ) {if (totalDrawableCount<=0) {return"담긴 추억 쪽지가 없어요.";
        }if (remainingCount<=0&&drawnCount>0) {return"모든 추억을 다 열어봤어요.";
        }return"아직 오늘 받은 추억이 없어요.";
    }
}
```

## 6-3. Daily Draw 히스토리

`GET /api/v1/jars/{jarId}/daily-draw/history?page=0&size=20`

### Response — DailyDrawHistoryItem

```
/*** 이전에 뽑았던 추억 한 장의 기록.
 */publicrecordDailyDrawHistoryItem(LongdrawId,LongjarId,LocalDatedrawDate,LongnoteId,Stringtitle,LongauthorId,StringauthorName,LocalDatenoteDate,Stringlocation
) {}
```

### Response — DailyDrawHistoryResponse

```
/**
 * Daily Draw 기록 목록과 페이지 정보를 반환한다.
 */publicrecordDailyDrawHistoryResponse(List<DailyDrawHistoryItem>items,intpage,intsize,longtotalElements,inttotalPages
) {}
```

## 6-4. Daily Draw 실시간 이벤트

### Response — DailyDrawSocketEventResponse

```
/**
 * 새로운 Daily Draw 결과가 공개되었음을
 * WebSocket으로 알려주는 이벤트 DTO.
 */publicrecordDailyDrawSocketEventResponse(LongjarId,StringeventType,LongdrawId,LocalDatedrawDate,LongnoteId,Stringmessage
) {}
```

현재 실제 전송 코드에서 사용하는 `eventType` 값은 `DAILY_DRAW_REVEALED`야. DTO의 Java 타입 자체는 `String`이야.

# 7. Notifications DTO

현재 인앱 알림은 조회, 미읽음 개수 확인, 개별 읽음 처리, 전체 읽음 처리를 지원해.

## 7-1. 알림 목록 조회

`GET /api/v1/notifications?page=0&size=10`

### Response — NotificationItemResponse

```
/**
 * 사용자에게 보여줄 알림 한 개의 정보.
 */publicrecordNotificationItemResponse(LongnotificationId,NotificationTypetype,Stringmessage,// 읽음 여부와 읽은 시간booleanisRead,LocalDateTimereadAt,LocalDateTimecreatedAt,// 어떤 화면으로 이동할지 판단하기 위한 정보LongjarId,LongnoteId,LongcommentId,// 알림을 발생시킨 사용자LongactorUserId,StringactorName,// 리액션 알림인 경우 이모지 정보Stringemoji
) {}
```

현재 `NotificationType`은 다음 네 가지야.

```
publicenumNotificationType {NOTE_COMMENTED,COMMENT_REPLIED,NOTE_REACTED,JAR_MEMBER_JOINED
}
```

### Response — NotificationListResponse

```
/**
 * 알림 목록과 페이지 정보를 반환한다.
 */publicrecordNotificationListResponse(List<NotificationItemResponse>items,intpage,intsize,longtotalElements,inttotalPages
) {}
```

## 7-2. 읽지 않은 알림 개수

`GET /api/v1/notifications/unread-count`

### Response — NotificationUnreadCountResponse

```
/**
 * 현재 사용자가 읽지 않은 알림의 총개수.
 */publicrecordNotificationUnreadCountResponse(longunreadCount
) {}
```

## 7-3. 알림 한 개 읽음 처리

`POST /api/v1/notifications/{notificationId}/read`

### Response — NotificationReadResponse

```
/**
 * 특정 알림을 읽음 처리한 결과.
 */publicrecordNotificationReadResponse(LongnotificationId,booleanisRead,LocalDateTimereadAt
) {}
```

## 7-4. 모든 알림 읽음 처리

`POST /api/v1/notifications/read-all`

### Response — NotificationReadAllResponse

```
/**
 * 읽지 않은 알림을 모두 읽음 처리한 결과.
 */publicrecordNotificationReadAllResponse(intupdatedCount,LocalDateTimereadAt
) {}
```

알림 읽음 처리 API 두 개 모두 별도의 Request DTO는 없어.

# 8. Onboarding DTO

온보딩은 처음 서비스를 사용하는 사용자에게 기능을 안내하는 튜토리얼이야.

현재 코드에서는 사용자별로 튜토리얼을 완료했는지, 건너뛰었는지를 기록해.

## 8-1. 온보딩 진행 상태 조회

`GET /api/v1/me/onboarding`

### Response — OnboardingProgressItemResponse

```
/**
 * 튜토리얼 한 종류의 진행 상태.
 */publicrecordOnboardingProgressItemResponse(// 어떤 튜토리얼인지OnboardingTutorialKeytutorialKey,// 완료하거나 건너뛴 기록이 있는지booleanhandled,// 아직 처리하지 않았다면 nullOnboardingStatusstatus,// 아직 처리하지 않았다면 nullLocalDateTimefinishedAt

) {}
```

### Response — OnboardingProgressResponse

```
/**
 * 현재 사용자의 모든 온보딩 진행 상태를 반환한다.
 */publicrecordOnboardingProgressResponse(// 현재 서버의 온보딩 버전intversion,// 튜토리얼 종류별 진행 상태List<OnboardingProgressItemResponse>items

) {}
```

현재 확인한 튜토리얼 키는 다음 여섯 가지야.

```
publicenumOnboardingTutorialKey {WELCOME,JAR_LIST,JAR_CREATE,JAR_DETAIL,JAR_INVITE,DAILY_DRAW
}
```

## 8-2. 온보딩 상태 변경

`PUT /api/v1/me/onboarding/{tutorialKey}`

### Request — OnboardingProgressUpdateRequest

```
/**
 * 사용자가 튜토리얼을 완료하거나 건너뛴 결과를 전달한다.
 */publicrecordOnboardingProgressUpdateRequest(

        @NotBlank(message="온보딩 상태는 필수예요.")Stringstatus

) {}
```

현재 처리 가능한 상태는 `COMPLETED`와 `SKIPPED`야.

DTO의 `status` 필드 자체는 `String`이고, 실제로 허용하는 값은 서버에서 `OnboardingStatus`로 변환하면서 검사해.

Response는 앞에서 정의한 `OnboardingProgressItemResponse`를 재사용해.

# 9. 기타 WebSocket 이벤트 DTO

일반 REST API의 Request·Response뿐 아니라, 서버가 사용자에게 실시간으로 전달하는 DTO도 빠뜨리지 않고 정리할게.

## 9-1. 저금통 멤버 변경 이벤트

### Response — JarMemberSocketEventResponse

```
/*** 저금통의 멤버 구성이나 역할이 달라졌을 때
 * 프론트엔드에 실시간으로 전달한다.
 */publicrecordJarMemberSocketEventResponse(LongjarId,// 참여·퇴장·강퇴·역할 변경 중 하나JarMemberEventTypetype,// 행동을 수행한 사용자LongactorUserId,StringactorName,// 변경 대상이 된 사용자LongtargetUserId,StringtargetUserName,// 변경 대상 사용자의 역할JarRoletargetRole,// 이벤트 발생 시간OffsetDateTimeoccurredAt

) {// 실제 클래스에는 KST 시간대 상수가 선언되어 있다.privatestaticfinalZoneIdKST=ZoneId.of("Asia/Seoul");/*
     * 실제 구현에서는 아래 네 가지 정적 생성 메서드로
     * 이벤트의 종류와 사용자 정보를 구성한다.
     *
     * memberJoined       → MEMBER_JOINED
     * memberLeft         → MEMBER_LEFT
     * memberKicked       → MEMBER_KICKED
     * memberRoleChanged  → MEMBER_ROLE_CHANGED
     */
}
```

현재 구현된 이벤트 종류는 다음 네 가지야.

```
publicenumJarMemberEventType {MEMBER_JOINED,MEMBER_LEFT,MEMBER_KICKED,MEMBER_ROLE_CHANGED
}
```

각 정적 메서드는 이벤트 종류에 맞춰 행동자와 대상자 정보를 설정하고, `OffsetDateTime.now(KST)`로 발생 시간을 기록해.

실시간 구독 경로:

```
/topic/jars/{jarId}/members
```

## 9-2. 저금통 오픈 이벤트

### Response — JarOpenSocketEventResponse

```
/**
 * 저금통이 열렸음을 프론트엔드에 알려준다.
 */publicrecordJarOpenSocketEventResponse(LongjarId,StringeventType,booleanisOpen,OffsetDateTimeopenedAt,Stringmessage
) {// 오픈 이벤트를 일관된 형식으로 생성한다.publicstaticJarOpenSocketEventResponsejarOpened(LongjarId,OffsetDateTimeopenedAt
    ) {returnnewJarOpenSocketEventResponse(jarId,"JAR_OPENED",true,openedAt,"저금통이 열렸어요."
        );
    }
}
```

실시간 구독 경로:

```
/topic/jars/{jarId}/open
```

## 9-3. 쪽지 댓글·리액션 이벤트

### Response — NoteRealtimeEventResponse

```
/*** 쪽지의 댓글·답글·리액션에 변화가 생기면* 다른 사용자에게 실시간으로 알려준다.
 */publicrecordNoteRealtimeEventResponse(LongjarId,LongnoteId,// 댓글 작성·답글·수정·삭제·리액션 변경NoteRealtimeEventTypetype,// 변경을 발생시킨 사용자LongactorUserId,StringactorName,// 댓글 관련 이벤트에서 사용하는 IDLongcommentId,LongparentCommentId,// 댓글 작성·답글·삭제 후의 최신 개수// 댓글 수정과 리액션 변경에서는 nullLongcommentCount,OffsetDateTimeoccurredAt

) {privatestaticfinalZoneIdKST=ZoneId.of("Asia/Seoul");/** 실제 클래스는 이벤트별 정적 생성 메서드 다섯 개를 제공한다.**commentCreated→ COMMENT_CREATED*commentReplied→COMMENT_REPLIED*commentUpdated  → COMMENT_UPDATED
     * commentDeleted  → COMMENT_DELETED
     * reactionChanged → REACTION_CHANGED
     */
}
```

현재 이벤트 종류:

```
publicenumNoteRealtimeEventType {COMMENT_CREATED,COMMENT_REPLIED,COMMENT_UPDATED,COMMENT_DELETED,REACTION_CHANGED
}
```

실시간 구독 경로:

```
/topic/jars/{jarId}/notes
/topic/jars/{jarId}/notes/{noteId}
```

여기서는 `myReaction`을 공통 WebSocket 이벤트에 넣지 않아. 사용자마다 자신이 누른 리액션이 다르기 때문에, 이벤트를 받은 뒤 필요한 경우 REST API로 본인의 리액션 상태를 다시 조회하는 구조야.

## 9-4. 알림 실시간 이벤트

현재 알림 전송에서는 별도의 `NotificationSocketEventResponse`를 만들지 않고, 앞에서 정의한 `NotificationItemResponse`를 그대로 사용해.

```
/topic/users/{userId}/notifications
```

실제 알림 서비스는 DB 트랜잭션이 성공적으로 완료된 이후에 WebSocket 알림을 전송하도록 구성되어 있어.

## 9-5. 실시간 DTO의 이벤트 생성 메서드

앞에서는 실시간 DTO의 필드를 중심으로 설명했어. 실제 코드에서 이벤트를 만드는 정적 메서드도 중요한 부분이므로 여기에 보충할게.

다음 메서드들은 앞에서 정의한 각 record의 본문 안에 들어 있는 메서드야. 새로운 DTO를 추가하는 코드는 아니야.

### JarMemberSocketEventResponse의 생성 메서드

```
// 멤버가 새로 참여했을 때publicstaticJarMemberSocketEventResponsememberJoined(LongjarId,LonguserId,StringuserName,JarRolerole
) {returnnewJarMemberSocketEventResponse(jarId,JarMemberEventType.MEMBER_JOINED,userId,userName,userId,userName,role,OffsetDateTime.now(KST)
    );
}// 멤버가 직접 나갔을 때publicstaticJarMemberSocketEventResponsememberLeft(LongjarId,LonguserId,StringuserName,JarRolerole
) {returnnewJarMemberSocketEventResponse(jarId,JarMemberEventType.MEMBER_LEFT,userId,userName,userId,userName,role,OffsetDateTime.now(KST)
    );
}// 관리자가 다른 멤버를 강퇴했을 때publicstaticJarMemberSocketEventResponsememberKicked(LongjarId,LongactorUserId,StringactorName,LongtargetUserId,StringtargetUserName,JarRoletargetRole
) {returnnewJarMemberSocketEventResponse(jarId,JarMemberEventType.MEMBER_KICKED,actorUserId,actorName,targetUserId,targetUserName,targetRole,OffsetDateTime.now(KST)
    );
}// 관리자가 멤버의 역할을 변경했을 때publicstaticJarMemberSocketEventResponsememberRoleChanged(LongjarId,LongactorUserId,StringactorName,LongtargetUserId,StringtargetUserName,JarRoletargetRole
) {returnnewJarMemberSocketEventResponse(jarId,JarMemberEventType.MEMBER_ROLE_CHANGED,actorUserId,actorName,targetUserId,targetUserName,targetRole,OffsetDateTime.now(KST)
    );
}
```

### NoteRealtimeEventResponse의 생성 메서드

```
// 일반 댓글이 새로 작성되었을 때publicstaticNoteRealtimeEventResponsecommentCreated(LongjarId,LongnoteId,LongactorUserId,StringactorName,LongcommentId,longcommentCount
) {returnnewNoteRealtimeEventResponse(jarId,noteId,NoteRealtimeEventType.COMMENT_CREATED,actorUserId,actorName,commentId,null,commentCount,OffsetDateTime.now(KST)
    );
}// 기존 댓글에 답글이 작성되었을 때publicstaticNoteRealtimeEventResponsecommentReplied(LongjarId,LongnoteId,LongactorUserId,StringactorName,LongcommentId,LongparentCommentId,longcommentCount
) {returnnewNoteRealtimeEventResponse(jarId,noteId,NoteRealtimeEventType.COMMENT_REPLIED,actorUserId,actorName,commentId,parentCommentId,commentCount,OffsetDateTime.now(KST)
    );
}// 댓글의 내용이 수정되었을 때publicstaticNoteRealtimeEventResponsecommentUpdated(LongjarId,LongnoteId,LongactorUserId,StringactorName,LongcommentId,LongparentCommentId
) {returnnewNoteRealtimeEventResponse(jarId,noteId,NoteRealtimeEventType.COMMENT_UPDATED,actorUserId,actorName,commentId,parentCommentId,null,OffsetDateTime.now(KST)
    );
}// 댓글이 삭제되었을 때publicstaticNoteRealtimeEventResponsecommentDeleted(LongjarId,LongnoteId,LongactorUserId,StringactorName,LongcommentId,LongparentCommentId,longcommentCount
) {returnnewNoteRealtimeEventResponse(jarId,noteId,NoteRealtimeEventType.COMMENT_DELETED,actorUserId,actorName,commentId,parentCommentId,commentCount,OffsetDateTime.now(KST)
    );
}// 리액션이 추가·변경·취소되었을 때publicstaticNoteRealtimeEventResponsereactionChanged(LongjarId,LongnoteId,LongactorUserId,StringactorName
) {returnnewNoteRealtimeEventResponse(jarId,noteId,NoteRealtimeEventType.REACTION_CHANGED,actorUserId,actorName,null,null,null,OffsetDateTime.now(KST)
    );
}
```

이렇게 나누면 프론트엔드에서 어떤 데이터가 변경되었는지 구분할 수 있고, 모든 이벤트를 같은 DTO 구조로 처리할 수 있어.

# 10. 공통 DTO와 내부 Enum 보충

마지막으로 공통 응답의 실제 편의 메서드와 내부에서 사용하는 Enum을 정리할게.

### ApiResponse — 실제 코드

```
/*** 모든 일반 REST API의 성공 데이터를 감싸는 공통 응답.
 */publicrecordApiResponse<T>(Tdata) {// 전달받은 데이터를 data 필드에 담아 반환한다.publicstatic <T>ApiResponse<T>of(T data) {returnnewApiResponse<>(data);
    }
}
```

### ErrorEnvelope — 실제 코드

```
/**
 * 오류 응답을 error 필드로 감싸는 공통 DTO.
 */publicrecordErrorEnvelope(ErrorResponseerror) {// 생성한 오류 정보를 error 필드에 담는다.publicstaticErrorEnvelopeof(ErrorResponseerror) {returnnewErrorEnvelope(error);
    }
}
```

### 내부 상태 Enum

기존 DTO 초안에는 없었지만 현재 구조를 이해할 때 필요한 값들이야.

```
/**
 * 파일 업로드의 진행 상태.
 */publicenumFileUploadStatus {PRESIGNED,// 업로드 URL을 발급한 상태COMPLETED,// 실제 S3 업로드까지 확인한 상태CONSUMED// 쪽지 등의 실제 데이터에 연결한 상태
}
```

```
/**
 * 저금통이 어떤 이유로 열렸는지 구분한다.
 */publicenumJarOpenReason {SCHEDULED,// 예약 시간이 되어 자동으로 열림ACCESS_TRIGGERED// 조회 시점에 오픈 시간 경과를 확인하고 열림
}
```

위 값들은 실제 코드에 존재하지만, 프론트엔드가 모든 API 요청에서 직접 보내는 값은 아니야.

# 11. AI 디자인 Draft DTO

AI 디자인은 Jar 생성 전에 Draft 단위로 다룬다. 다음 DTO는 모두 실제 코드에 존재하며, 이미 생성한 Jar에 디자인을 적용하는 요청 DTO는 만들지 않는다.

| DTO | 방향 | 필드/검증 |
| --- | --- | --- |
| `JarAiGenerationCreateRequest` | Request | `style` 필수, `seed` 선택. Prompt·버전은 받지 않음 |
| `JarDesignSelectionRequest` | Request | `designType` 필수, `AI`일 때 `generationId` 필요 |
| `JarDesignSlotRequest` | Request | `centerX`, `centerY`, `sizeRatio` 모두 필수. 값 범위·선택 상태는 Service가 검증 |
| `JarDesignDraftCreateResponse` | Response | `draftId`, `expiresAt` |
| `JarDesignDraftDetailResponse` | Response | Draft 상태·선택·Slot·만료·최종 Jar·Generation 메타데이터. S3 Key/URL 제외 |
| `JarAiGenerationPreviewResponse` | Response | OWNER 검증 뒤의 짧은 `previewUrl`, `expiresAt` |
| `JarDesignFinalizeResponse` | Response | 생성된 `jarId`, 최종 `designType` |

`JarDesignDraftDetailResponse.GenerationItem`은 `generationId`, `style`, `status`, `errorCode`, `completedAt`만 반환한다. 후보 이미지의 URL은 원본 또는 성공 후보 미리보기 API를 별도로 호출해 받는다.

# 12. 최종 DTO 전수 대조 결과

실제 작업 폴더의 `dto` 디렉터리와 이번 명세를 대조한 결과야.

| 영역 | 활성 DTO |
| --- | --- |
| 공통 Request / Response | 6개 |
| 저금통·멤버·초대 | 22개 |
| 쪽지·첨부·댓글·리액션 | 16개 |
| 파일 업로드 | 4개 |
| 계정·인증 | 16개 |
| 채팅 | 6개 |
| Daily Draw | 6개 |
| 알림 | 5개 |
| 온보딩 | 3개 |
| AI 디자인 Draft | 7개 |
| 합계 | 92개 |

실제 Java 파일은 93개다. 이 중 `RedisChatMessageEvent.java`는 파일 전체가 주석 처리된 비활성 초안이므로 활성 DTO 92개에 포함하지 않았다.

## 12-1. 전체 DTO 이름 대조표

빠뜨린 DTO가 없는지 확인할 수 있도록 실제 클래스 이름도 모두 기록해 둘게.

## 공통 DTO · 6개

dto/response · dto/request

ApiResponse
CsrfResponse
ErrorEnvelope
ErrorResponse
MeResponse
MeUpdateRequest

## 저금통 DTO · 22개

dto/jar

JarCreateRequest
JarCreateResponse
JarDetailResponse
JarInviteCreateRequest
JarInviteCreateResponse
JarInviteItem
JarInviteJoinRequest
JarInviteJoinResponse
JarInviteListResponse
JarInviteRevokeResponse
JarKickResponse
JarLeaveResponse
JarListItem
JarListResponse
JarMemberItem
JarMemberListResponse
JarMemberRoleUpdateRequest
JarMemberRoleUpdateResponse
JarMemberSocketEventResponse
JarOpenSocketEventResponse
JarUpdateRequest
JarUpdateResponse

## 쪽지 DTO · 16개

dto/note

NoteAttachmentCreateRequest
NoteAttachmentResponse
NoteAttachmentSortUpdateRequest
NoteCommentCreateRequest
NoteCommentItem
NoteCommentListResponse
NoteCommentUpdateRequest
NoteCreateRequest
NoteCreateResponse
NoteDetailResponse
NoteListItem
NoteListResponse
NoteReactionCountItem
NoteReactionCreateRequest
NoteReactionSummaryResponse
NoteRealtimeEventResponse

## 파일 DTO · 4개

dto/file

FileCompleteRequest
FileCompleteResponse
FilePresignRequest
FilePresignResponse

## 계정·인증 DTO · 16개

dto/auth

EmailVerificationConfirmRequest
EmailVerificationConfirmResponse
EmailVerificationSendRequest
EmailVerificationSendResponse
LocalAuthResponse
LocalLoginRequest
LocalSignupRequest
LoginIdAvailabilityResponse
LoginIdRecoveryResponse
PasswordResetEmailVerificationConfirmRequest
PasswordResetEmailVerificationConfirmResponse
PasswordResetEmailVerificationSendRequest
PasswordResetLoginIdCheckRequest
PasswordResetLoginIdCheckResponse
PasswordResetRequest
PasswordResetResponse

## 채팅 DTO · 6개

dto/chat

ChatMessageListResponse
ChatMessageResponse
ChatMessageSendRequest
ChatReadRequest
ChatSocketMessageResponse
ChatUnreadResponse

## Daily Draw DTO · 6개

dto/dailydraw

DailyDrawHistoryItem
DailyDrawHistoryResponse
DailyDrawNoteResponse
DailyDrawResponse
DailyDrawSocketEventResponse
DailyDrawTodayResponse

## 알림 DTO · 5개

dto/notification

NotificationItemResponse
NotificationListResponse
NotificationReadAllResponse
NotificationReadResponse
NotificationUnreadCountResponse

## 온보딩 DTO · 3개

dto/onboarding

OnboardingProgressItemResponse
OnboardingProgressResponse
OnboardingProgressUpdateRequest

## AI 디자인 Draft DTO · 7개

dto/ai

JarAiGenerationCreateRequest
JarDesignSelectionRequest
JarDesignSlotRequest
JarDesignDraftCreateResponse
JarDesignDraftDetailResponse
JarAiGenerationPreviewResponse
JarDesignFinalizeResponse

## 12-2. 현재 미구현 기능과 구분

이번 DTO 명세에는 실제로 구현되지 않은 API를 현재 기능처럼 추가하지 않았어.

| 기능 | 현재 상태 |
| --- | --- |
| 기존 Jar 화면용 Optional `JarDesign` 응답 DTO | 미구현 |
| AI 이미지 URL을 포함한 Jar 응답 | 미구현 |
| 쪽지 수정·삭제 API | 미구현 |
| 쪽지 검색·태그 필터 API | 미구현 |
| 채팅 파일 전송 DTO | 미구현 |
| 알림 설정 조회·수정 API | 미구현 |
| 회원 탈퇴 API | 미구현 |
| 첨부파일 정렬 공개 API | DTO와 내부 Service만 존재 |

최종 정리: 활성 DTO는 92개이며, AI Draft DTO 7개를 포함한다. 실제 Controller의 REST 63개와 STOMP 메시지 1개에 대응한다. Slot Editor·최종 미리보기 UX·기존 Jar의 Optional `JarDesign` 조회/표시는 아직 완료로 표현하지 않는다.
