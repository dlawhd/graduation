# 보관함·제작 이어 만들기·비공개 쪽지 초안 변경 및 테스트 안내

- 작성일: 2026-11-19
- 최종 정리일: 2026-11-20 (한국 시간)
- 프로젝트: `C:/Users/whdgu/Desktop/graduation`
- 변경 기준: 최초 구현 `5645fc6`, 초안·쪽지 화면 보완 및 크기 조정 `421f714180c83856e32739d710df4eaa650c602e`
- 기록 범위: 실제 구현, 로컬 자동 검사, 시험용 API를 이용한 브라우저 확인, GitHub Actions의 검사·백엔드 배포 결과
- GitHub Actions 성공과 실제 운영 화면의 수동 검증은 구분한다. 운영 프론트 반영·실제 계정의 화면 동작·300명 동시 부하 시험은 이번 정리에서 새로 확인하지 않았다.

## 0. 현재 최종 상태 요약

### 제작 초안 보관함

| 항목 | 최종 동작 |
| --- | --- |
| 표시 개수 | 본인의 유효한 서버 초안을 최근 수정순으로 한 페이지에 최대 2개 표시한다. |
| 저금통 미리보기 | 실제 본체·사진 배치·입구를 56×56px로 보여준다. 64×64px 영역 안에 넣고 이름·현재 작업 단계 옆에 배치한다. |
| 작업 단계 | 실제 저장된 선택·배치와 같은 계정·초안 번호의 저장 상태로 이어갈 단계를 표시한다. 5단계 진행 표시를 유지한다. |
| 시각 표시 | `생성 시간 :`, `보관 기한 :`을 한국 시간으로 표시하되 두 줄의 `(KST)` 접미사는 생략한다. |
| 카드 버튼 | 화살표 없는 `이어서 만들기`, 별도 `삭제하기`를 제공한다. 삭제 확인과 취소를 구분한다. |
| 페이지 이동 | `이전 1 다음` 형태로 표시한다. 버튼 높이 32px, 글씨 12px, 요소 간격 8px이다. 페이지 번호는 숫자만 보이고 화면 낭독기에는 페이지 의미를 전달한다. |
| 삭제 후 보정 | 마지막 페이지의 초안을 모두 삭제하면 비어 있는 페이지에 머물지 않고 이전 페이지를 조회한다. |
| 새 제작 | 이전 본체를 자동으로 불러오지 않고 빈 캔버스·선택 없음 상태에서 시작한다. 별도 `직접 만들던 저금통 본체` 카드는 제거했다. |
| 이어 만들기 | 서버에 저장된 초안의 `이어서 만들기`로 디자인을 복구한다. 같은 브라우저에 저장된 이름·날짜 등 미제출 입력도 계정·초안별로 복구한다. |
| 보관함 안내 | 초안이 남아 있으면 새 저금통 만들기 아래에 `만들고 있던 저금통이 있어요.`와 이어 만들기 링크를 표시한다. |

페이지 버튼 축소는 초안 카드의 `이어서 만들기`·`삭제하기` 버튼 크기에는 영향을 주지 않는다. 읽을 정보와 버튼의 역할을 유지하면서 큰 미리보기와 여백을 줄인 변경이다.

### 쪽지 확인과 비공개 규칙

- 상세 화면의 바깥 진입 버튼은 `쪽지 확인` 하나로 통합했다.
- 열린 저금통에서는 같은 창 안에서 `전체 쪽지`와 `내가 넣은 쪽지`를 전환한다. 검색·태그·페이지는 선택한 범위에 적용한다.
- **오픈 전에는 서버가 로그인한 작성자 본인의 쪽지만 반환한다.** 전체 쪽지 탭은 없고 타인의 내용·장수·검색 결과·작성 여부는 공개하지 않는다. 다른 작성자의 상세 번호를 요청해도 404를 반환한다.
- 오픈 전 본인 쪽지 상세는 읽기 전용으로 보여주고 댓글·리액션 영역과 댓글 조회 요청은 숨긴다. 열린 뒤에는 기존 댓글·리액션 기능을 사용한다.
- 범위 변경 시 이전 목록을 지우고 늦게 도착한 이전 요청을 무시한다. Tab 이동·Escape 닫기·원래 요소로 초점 복귀를 적용했다.
- 기존 비공개 쪽지 초안 복구, 추억 날짜순 정렬, 첨부 원본 확대·사진 탐색은 유지한다.

### 성능·보안 및 호환성

- 목록은 두 개씩 조회하고, 화면에 보이는 카드만 기존 소유자 전용 preview API로 짧은 이미지 주소를 받는다. 목록 응답에는 S3 키·이미지 바이트·서명 주소를 넣지 않는다.
- 삭제는 로그인·CSRF·소유권을 검사하고 최종화와 같은 초안 행 잠금을 사용한다. 삭제 재시도는 같은 성공 결과를 반환하고 완성된 저금통의 삭제는 거부한다.
- 삭제된 초안은 `ABANDONED`로 종료한다. 파일은 기존 종료 초안 정리 작업이 처리하며 완성된 저금통·쪽지 데이터는 직접 삭제하지 않는다.
- 보완 커밋 `421f714`에는 새 DB 마이그레이션이나 의존성이 없다. 최초 기능 구현의 V62는 그대로 유지한다.

### 검증·커밋·푸시·배포 상태

| 구분 | 확인한 결과 |
| --- | --- |
| 로컬 자동 검사 | 관련 백엔드 테스트 351건, 프론트 Node 테스트 337건 통과. 전체 프로젝트 테스트나 부하 시험을 모두 실행했다는 의미는 아니다. |
| 빌드 | 백엔드 `bootJar`, 프론트 Vite 빌드 성공. 56px 미리보기와 32px 페이지 버튼 조정 후에도 프론트 빌드와 Git 공백 검사를 통과했다. 기존 큰 번들 경고는 남아 있다. |
| 브라우저 확인 | 시험 API와 실제 React 빌드로 2개씩 조회·삭제 후 페이지 보정·새 제작 초기화·초안 복구·전체/내 쪽지 전환·키보드 복귀를 확인했다. 56px 실제 표시 크기도 확인했다. |
| 모바일 범위 | 390px 프레임에서 카드·쪽지 창의 가로 넘침이 없음을 확인했다. 마지막으로 축소한 페이지 버튼의 실제 모바일 기기 터치감은 아직 확인하지 않았다. |
| 커밋·푸시 | [421f714 — 제작 초안 보관함과 쪽지 확인 화면 개선](https://github.com/dlawhd/graduation/commit/421f714180c83856e32739d710df4eaa650c602e). 28개 소스·테스트·문서 파일을 `origin/main`에 푸시하고 원격 일치를 확인했다. 빌드 산출물·설치 폴더는 제외했다. |
| GitHub 보안 검사 | [Security analysis](https://github.com/dlawhd/graduation/actions/runs/44526446394): 같은 커밋에서 완료·성공. 2026-11-20 다시 조회해 확인했다. |
| 이미지 게시 | [Publish Docker image to GHCR](https://github.com/dlawhd/graduation/actions/runs/44526446558): 같은 커밋에서 완료·성공. |
| 백엔드 배포 작업 | [deploy](https://github.com/dlawhd/graduation/actions/runs/44527865020): 같은 커밋에서 완료·성공. 실제 운영 프론트 화면의 수동 확인과는 별개다. |

자동 검사 수치는 기능 보완 당시 실행 로그를 다시 확인한 결과다. 2026-11-20의 문서 정리에서는 코드를 수정하거나 테스트·배포를 새로 실행하지 않았다. 캘린더 앱의 실제 가져오기, 운영 두 계정 간 비공개 동작, 페이지 버튼의 휴대폰 조작은 아래 체크리스트로 추가 확인한다.

## 1. 이번에 바뀐 기능

| 기능 | 이전 동작 | 변경한 동작 |
| --- | --- | --- |
| 보관함 검색·필터·즐겨찾기 | 페이지를 넘기며 저금통을 찾았다. 개인 즐겨찾기가 없었다. | 저금통 이름 검색, 전체/잠긴/열린 필터, 즐겨찾기만 보기를 추가했다. 내 보관함 전체에 조건을 적용한 뒤 페이지를 나눈다. 별 표시는 계정별 DB에 저장한다. |
| 제작 이어 만들기 | 저장한 제작 초안을 보관함에서 다시 찾기 어려웠다. | 만들기 선택 화면에 본인의 유효한 서버 초안을 최근 수정순으로 표시한다. 저장한 사진 배치·후보·입구를 다시 열고, 같은 브라우저에서는 입력한 이름·설명·인원·날짜도 복구한다. 서버에 저장된 초안에서만 이어 만들고, 새 제작은 빈 틀에서 시작한다. |
| 상세 버튼·오픈 약속 | 쪽지 읽기와 다시 보기 버튼이 흩어져 있었다. | 상세의 `쪽지 확인` 버튼에서 같은 창의 전체·내 쪽지를 선택한다. 다시 보기와 오픈 약속을 가까이 두고 캘린더 파일 내려받기를 추가했다. |
| 비공개 쪽지 초안 | 새로고침이나 상세 화면 이탈 후 작성 내용을 복구하기 어려웠다. | 계정·저금통별로 글·날짜·장소·태그·첨부 원본·첨부 설명을 브라우저에 저장한다. 이어서 쓰기·작성 내용 지우기·미완료 첨부 재시도를 제공한다. |
| 쪽지 표시 순서 | 작성 시각 내림차순으로 조회했다. | 추억 날짜 오름차순으로 표시하고 날짜 없는 쪽지는 마지막에 둔다. 날짜가 같으면 작성 시각, 그 시각도 같으면 쪽지 번호 오름차순으로 고정한다. 전체·본인·검색 목록에 동일하게 적용한다. |

**오늘의 질문은 구현하지 않았다.** 초대 관리와 분리해 상세 화면의 `새 쪽지 쓰기` 바로 위에 독립 카드로 두는 방향을 제안한 상태다.

## 2. 주요 수정 파일과 변경 이유

| 파일 | 역할·이유 |
| --- | --- |
| [JarsPage.jsx](../frontend/src/pages/JarsPage.jsx), [jarShelfApi.js](../frontend/src/api/jarShelfApi.js) | 검색·필터·즐겨찾기 화면과 요청을 연결한다. 즐겨찾기 버튼 중복 전송을 막고 오래된 검색 응답을 무시한다. |
| [JarService.java](../src/main/java/shop/esjh/memoryjar/service/jar/JarService.java), [JarRepository.java](../src/main/java/shop/esjh/memoryjar/repository/jar/JarRepository.java), [JarMemberRepository.java](../src/main/java/shop/esjh/memoryjar/repository/jar/JarMemberRepository.java) | 검색을 페이지 조회 전 DB에서 처리하고, 현재 멤버 본인의 즐겨찾기만 잠금 안에서 변경한다. 역할·즐겨찾기는 함께 일괄 조회한다. |
| [JarController.java](../src/main/java/shop/esjh/memoryjar/controller/jar/JarController.java), [JarMember.java](../src/main/java/shop/esjh/memoryjar/entity/jar/JarMember.java), [JarListItem.java](../src/main/java/shop/esjh/memoryjar/dto/jar/response/JarListItem.java) | 검색 조건·즐겨찾기 API, 개인 설정 저장 필드, 목록 응답의 `favorite`을 추가한다. |
| [UserStateRealtimeService.java](../src/main/java/shop/esjh/memoryjar/service/UserStateRealtimeService.java) | 즐겨찾기는 저장 확정 후 본인의 다른 탭에만 목록 재조회 신호를 보낸다. 다른 멤버에게 개인 설정을 전송하지 않는다. |
| [DesignDraftShelf.jsx](../frontend/src/features/jarDesign/components/DesignDraftShelf.jsx), [CreationChoices.jsx](../frontend/src/features/jarDesign/components/CreationChoices.jsx), [designResume.mjs](../frontend/src/features/jarDesign/designResume.mjs) | 작업 목록과 이어 만들기를 제공하고 이름·날짜 등 미제출 입력을 계정·디자인 번호별로 보관한다. |
| [AiCandidateGallery.jsx](../frontend/src/features/jarDesign/components/AiCandidateGallery.jsx), [JarDesignFinalizePanel.jsx](../frontend/src/features/jarDesign/components/JarDesignFinalizePanel.jsx) | 저장한 선택·입구와 편집 단계를 복구하고, 이름·최대 인원 등의 입력을 새로고침 후 유지한다. |
| [JarDesignDraftService.java](../src/main/java/shop/esjh/memoryjar/service/ai/JarDesignDraftService.java), [JarDesignDraftRepository.java](../src/main/java/shop/esjh/memoryjar/repository/ai/JarDesignDraftRepository.java) | 본인 소유의 ACTIVE·미만료 초안을 2개씩 조회한다. 목록에는 사진 원본·S3 키·후보 전체를 싣지 않는다. |
| [JarDetailPage.jsx](../frontend/src/pages/JarDetailPage.jsx), [JarVisual.jsx](../frontend/src/features/jarDetail/components/JarVisual.jsx), [OpeningPromise.jsx](../frontend/src/features/jarDetail/components/OpeningPromise.jsx), [openPromise.mjs](../frontend/src/features/jarDetail/utils/openPromise.mjs) | 버튼 배치를 정리하고 한국 시간 기준으로 같은 순간을 가리키는 `.ics` 달력 파일을 만든다. |
| [NoteSection.jsx](../frontend/src/pages/NoteSection.jsx), [usePrivateNoteDraft.js](../frontend/src/features/note/usePrivateNoteDraft.js), [noteDraftStore.mjs](../frontend/src/features/note/noteDraftStore.mjs) | 비공개 초안과 원본 첨부를 IndexedDB(브라우저 내부 저장소)에 보관한다. 같은 파일을 글자 입력 때마다 다시 저장하지 않고, 다중 탭 충돌을 검사한다. |
| [NoteRepository.java](../src/main/java/shop/esjh/memoryjar/repository/note/NoteRepository.java) | 추억 날짜순 정렬을 DB 페이지 조회 전에 적용한다. 다른 페이지에 더 이른 추억이 밀리는 일을 막는다. |
| [V62 마이그레이션](../src/main/resources/db/migration/V62__personal_shelf_and_design_resume.sql) | `jar_members.favorite` 기본값 false와 보관함·디자인 초안 조회용 인덱스를 추가한다. 과거 마이그레이션은 변경하지 않았다. |

화면 연결을 위해 `App.jsx`, `JarsNewPage.jsx`, `JarDesignNewPage.jsx`, 관련 API·요청/응답 DTO와 문서도 함께 수정했다. 새 라이브러리는 추가하지 않았다.

## 3. 저장 범위와 공개 규칙

| 저장 대상 | 저장 위치·복구 범위 |
| --- | --- |
| 즐겨찾기 | 서버 DB의 본인 멤버 행. 다른 멤버의 별 표시와 별개다. |
| 업로드 후 제작 상태 | 서버 디자인 초안. 본인 소유이고 유효 기간 안인 초안만 목록에 나타난다. |
| 제작 이름·날짜·인원·확정 단계 | 계정·초안 번호별 같은 브라우저의 localStorage. |
| 업로드 전 직접 만든 본체 | 현재 제작 화면의 메모리. 새 제작에 다시 진입하면 빈 상태로 시작하며 이전 본체를 sessionStorage에서 자동 복구하지 않는다. 서버 초안으로 저장한 뒤에는 해당 초안에서 이어 만든다. |
| 작성 중인 쪽지·첨부 원본 | 계정·저금통별 같은 브라우저의 IndexedDB. 다른 기기·브라우저·사이트 주소와 공유하지 않는다. |

- `localhost:3000`, `127.0.0.1:3000`, 운영 사이트는 서로 다른 저장 공간이다. 테스트하는 동안 주소를 통일한다.
- 브라우저 사이트 데이터를 삭제하거나 시크릿 창을 닫으면 초안을 복구하지 못할 수 있다.
- 초안 저장만으로 다른 멤버에게 작성 여부나 내용을 알리지 않는다.
- 오픈 전에는 기존과 같이 본인 쪽지만 볼 수 있다. 다른 멤버의 쪽지·작성 여부를 공개하지 않는다.
- 응답이 끊긴 동일 제출은 저장한 요청 번호를 복구해 재시도한다. 글·첨부가 바뀌면 새 제출로 구분한다.
- 같은 초안을 다른 탭이 먼저 저장했다면 덮어쓰지 않고 재조회 안내를 표시한다.
- 미완료 첨부는 보관한 원본으로 다시 올릴 수 있다. 오래된 미사용 완료 첨부도 복구 때 재업로드할 수 있지만, 결과가 불확실한 기존 제출은 먼저 원래 파일 키와 요청 번호를 유지한다.

## 4. 로컬 실제 기능 테스트 준비

### 실행 전

1. 운영 데이터와 분리한 로컬 DB를 사용한다. 현재 `application-local.yml`의 DB 주소는 로컬 호스트이고, 프론트 `.env.local`의 API·WebSocket도 `localhost:8080`을 가리키는 것을 확인했다.
2. 기존 로컬 DB/Docker와 개발용 환경변수를 준비한다. 사진·제작 원본을 올릴 때는 **S3도 시험용 대상인지 확인**한다. 로컬 화면이어도 S3·메일·AI 대상은 각각의 설정에 따라 실제 서비스일 수 있다.
3. 기능을 넣은 최신 백엔드와 프론트를 모두 사용한다. 프론트만 새로 띄우고 백엔드가 이전 코드면 새 API를 사용할 수 없다.
4. 로컬 테스트 계정 두 개, 열린 저금통 하나, 오픈 시간이 미래인 잠긴 저금통 하나, 작은 시험 사진 한 장을 준비한다. 쪽지 초안만 확인할 때는 제출하지 않아도 된다.

### 백엔드 재시작

IntelliJ에서 기존 실행 설정의 `local` 프로필로 재시작해도 된다. 터미널을 쓰려면 기존 개발용 환경변수가 준비된 PowerShell에서:

```powershell
Set-Location 'C:/Users/whdgu/Desktop/graduation'
.\gradlew.bat bootRun --args="--spring.profiles.active=local"
```

기존 백엔드가 8080 포트를 사용 중이면 먼저 정상 종료한다. 시작 시 Flyway(DB 변경 이력 적용 도구)가 **V62까지 적용**되고 애플리케이션 시작이 완료됐는지 확인한다. 이미 V62가 적용된 DB는 다시 SQL을 수동 실행하지 않는다.

### 프론트 재시작

다른 PowerShell에서:

```powershell
Set-Location 'C:/Users/whdgu/Desktop/graduation/frontend'
npm.cmd run dev
```

브라우저에서 `http://localhost:3000/jars`를 열고 로컬 계정으로 로그인한다. 변경 화면이 안 보이면 한 번 `Ctrl+Shift+R`로 새 파일을 읽는다. 이 프로젝트의 개발 실행 명령은 `npm run dev`다.

## 5. 직접 테스트할 순서와 정상 기준

### A. 보관함 검색·필터·즐겨찾기

- [ ] 내 저금통 목록에 이름 검색과 `전체 / 잠긴 / 열린 / ☆ 즐겨찾기`가 보인다.
- [ ] 첫 페이지에 없는 저금통의 이름을 검색해도 찾을 수 있다. 보관함은 페이지당 9개이므로 10개 이상이면 쉽게 확인할 수 있다.
- [ ] 잠긴 필터에는 미래 오픈 저금통, 열린 필터에는 열린 저금통이 나타난다.
- [ ] 카드의 별을 눌러도 상세 화면으로 이동하지 않는다. 별 상태가 바뀐다.
- [ ] 새로고침 후에도 별이 유지되고, 즐겨찾기 필터에는 별을 켠 저금통만 나온다.
- [ ] 즐겨찾기 필터에서 마지막 별을 해제하면 빈 결과 안내가 나온다. 검색 조건의 `초기화`로 원래 목록에 돌아갈 수 있다.
- [ ] 같은 저금통에 참여한 다른 계정으로 로그인해도 첫 계정의 별 표시가 자동 공유되지 않는다.

### B. 제작 이어 만들기

1. `새 저금통 만들기 → 직접 만들기`에서 본체와 시험용 사진·그림을 준비한다.
2. 사진 업로드 후 배치를 저장한다. AI는 호출하지 않고 원본으로도 확인할 수 있다.
3. 가능하면 후보 선택·입구 저장까지 진행하고, 이름·설명·최대 인원·오픈 날짜를 입력한다. 아직 최종 생성은 누르지 않는다.
4. `만들기 방식 다시 선택`으로 돌아가 `내 작업 이어 만들기`의 해당 초안을 연다.

정상 기준:

- [ ] 저장한 사진 배치·선택·입구 상태가 유지된다.
- [ ] 같은 브라우저에서 이름·설명·인원·날짜가 복구된다. 최대 인원을 8명으로 바꾼 뒤 새로고침해도 8명이다.
- [ ] 별도 `본체 이어 만들기` 카드는 없고, 새 직접 만들기는 아무 틀도 선택하지 않은 상태로 시작한다.
- [ ] 다른 계정의 작업은 목록에 보이지 않는다.
- [ ] 유효한 초안이 없으면 서버 초안 목록이 나타나지 않는 것이 정상이다. 최종 생성·만료된 초안도 재개 목록에서 제외한다.

### C. 상세 버튼·오픈 약속

- [ ] 상세에는 `쪽지 확인` 버튼 하나가 있고 열린 저금통의 창 안에서 `전체 쪽지`와 `내가 넣은 쪽지`를 전환한다.
- [ ] `추억 열기 다시 보기`가 기존 오픈 연출을 실행한다.
- [ ] 잠긴 저금통에서는 `내가 넣은 쪽지`를 볼 수 있고, 전체 쪽지 읽기 버튼으로 타인 내용을 공개하지 않는다.
- [ ] `우리의 오픈 약속`에 설정한 날짜·시간과 한국 시간(KST) 표시가 나온다.
- [ ] `캘린더에 추가`를 누르면 `memoryjar-번호-opening.ics`가 내려받아진다. 캘린더 앱에서 열어 실제 오픈 순간과 일치하는지 확인한다. 기기 시간대가 해외라면 그 지역 시각으로 변환되어 보일 수 있다.

### D. 비공개 쪽지 초안

1. `새 쪽지 쓰기`에서 제목·내용과 사진을 넣고 첨부 설명을 작성한다. 날짜·장소·태그도 입력한다.
2. `작성 내용을 저장했어요` 표시를 확인하고 **제출하지 않은 채** 새로고침한다.
3. 같은 저금통에서 다시 `새 쪽지 쓰기 → 이어서 쓰기`를 누른다.

정상 기준:

- [ ] 제목·내용·날짜·장소·태그·사진·첨부 설명이 복구된다.
- [ ] 모달을 닫거나 다른 저금통에 다녀와도 원래 저금통의 초안을 찾을 수 있다.
- [ ] 다른 저금통·다른 계정에는 이 초안이 나타나지 않는다.
- [ ] 아직 복구 여부를 고르지 않은 화면은 입력이 잠겨 있다. 먼저 `이어서 쓰기`나 `작성 내용 지우기`를 선택한다.
- [ ] `작성 내용 지우기`에서 확인하면 해당 초안이 지워진다. 새로고침 후 다시 나타나지 않고 이미 제출한 쪽지는 유지된다.
- [ ] 시험 쪽지를 정상 제출한 뒤에는 초안이 정리되어 다음 작성창이 비어 있다.
- [ ] 업로드에 실패한 첨부가 남으면 `미완료 첨부 다시 시도`로 복구할 수 있다. 일부러 운영 저장소 장애를 만들 필요는 없다.

다중 탭 확인:

1. 같은 계정·같은 저금통을 탭 두 개에 연다.
2. 양쪽에서 작성창을 먼저 연 뒤 A 탭에 내용을 적어 저장한다.
3. B 탭에서도 입력한다.
4. B 탭에는 다른 탭에서 변경됐다는 안내가 나와야 한다. `저장한 초안 다시 불러오기 → 이어서 쓰기`로 A의 내용을 읽을 수 있어야 한다.

### E. 추억 날짜순 정렬

시험 저금통에 아래 순서로 쪽지를 넣는다. 실제 쪽지는 수정·삭제할 수 없으므로 테스트용 저금통을 사용한다.

| 작성 순서 | 제목 예시 | 추억 날짜 |
| --- | --- | --- |
| 1 | 날짜 없음 A | 지정하지 않음 |
| 2 | 3월의 기억 | 2026-03-01 |
| 3 | 2월의 기억 A | 2026-02-01 |
| 4 | 2월의 기억 B | 2026-02-01 |
| 5 | 날짜 없음 B | 지정하지 않음 |

기대 순서는 **2월 A → 2월 B → 3월 → 날짜 없음 A → 날짜 없음 B**다.

- [ ] 열린 저금통의 전체 쪽지와 내가 넣은 쪽지가 이 순서를 따른다.
- [ ] 검색 결과에도 같은 정렬 기준이 적용된다.
- [ ] 현재 화면의 페이지 크기보다 쪽지를 많이 넣으면 페이지를 넘겨도 이른 날짜부터 이어진다.
- [ ] 잠긴 저금통에서는 본인 쪽지에만 같은 정렬을 적용하고 타인 쪽지는 계속 숨긴다.

## 6. 운영 자원을 쓰지 않는 화면 시험

실제 DB·S3를 쓰지 않고 화면·저장소부터 보고 싶다면 [로컬 UI 검증 도구](../tools/ui/README.md)를 사용한다.

- 주소: `http://127.0.0.1:18962/jars`
- 시험 계정·저금통·API 응답을 자동 제공하므로 실제 로그인을 하지 않는다.
- `/draft-store-test`에서 `검증 시작`을 누르면 브라우저 저장소 회귀 검사 10개를 실행한다.
- 시험 서버에서만 쪽지 내용에 `응답유실`을 넣으면 최초 제출을 저장한 뒤 503을 반환한다. 새로고침·초안 복구·동일 제출 후 `/fixture-status`의 `notes`가 1인지 확인한다.
- 이 응답 유실 재현 문구는 실제 서비스 기능이 아니다. 실제 서버에서 같은 문구를 써도 장애 시험이 실행되지 않는다.
- 시험용 API는 실제 서버의 인증·권한·DB 검증을 대신하지 않는다. WebSocket 서버도 제공하지 않으므로 실시간 연결 오류를 운영 기능 오류로 판단하지 않는다.

## 7. 초기 구현 검증 기록과 추가 확인

아래 표는 최초 구현 `5645fc6` 단계의 검증 기록이다. 이후 `421f714` 보완의 테스트 수치와 최신 배포 작업 결과는 **0절의 최종 상태 요약**을 기준으로 본다.

| 구분 | 결과 |
| --- | --- |
| 관련 백엔드 테스트 | 319개 통과. 인증·입력 검증·개인 채널 전송·보관함·초안·쪽지 조회 관련 범위다. |
| 추억 날짜 정렬 추가 검증 | 임시 MariaDB에서 날짜 없는 쪽지와 동일 날짜·동일 작성 시각의 페이지 순서를 재검증해 통과했다. |
| 즐겨찾기 추가 검증 | 임시 MariaDB에서 계정 격리, 검색 조건, 목록용 Boolean 조회값을 재검증해 통과했다. |
| 프론트 단위 테스트 | 334개 통과했다. |
| 브라우저 저장소 검사 | 원본 파일 복구, 계정·저금통 격리, 동시 쓰기 충돌, 정리 후 오래된 쓰기 차단 등 10개 통과했다. |
| 브라우저 수동 확인 | 시험용 API로 전체 검색·즐겨찾기·제작 인원 복구·글/사진/설명 복구·응답 유실 후 동일 제출을 확인했다. PC와 390px 화면 배치도 확인했다. |
| 빌드 | 백엔드 `bootJar`, 프론트 Vite 빌드 통과. 500KB 초과 청크에 대한 기존 경고는 남아 있다. |

실제 로컬 실행 환경에서 위 수동 체크리스트를 실행하고, 운영에서는 적용된 DB 이력·정상 기동·실제 화면 동작을 추가 확인한다. 2026-11-20 조회한 백엔드 배포 작업의 성공은 0절에 기록했으며, 300명 동시 부하 시험과 전체 프로젝트 테스트 재실행을 완료했다고 기록하지 않는다.

## 8. 이상이 보일 때 전달할 정보

- 어떤 화면인지: 예를 들어 `보관함`, `제작 이어 만들기`, `새 쪽지 쓰기`.
- 어떤 순서로 눌렀는지와 예상한 결과·실제 결과.
- 로컬/운영 구분, 오류 문구, 가능하면 실패 요청의 상태 코드와 경로.
- 비밀번호·인증 코드·API 키·쿠키·Authorization 헤더는 전달하지 않는다. 캡처에도 보이지 않게 한다.

대표 확인 지점:

| 증상 | 먼저 확인할 것 |
| --- | --- |
| 즐겨찾기나 초안 API가 404/500 | 백엔드가 최신 코드인지, V62가 적용되고 정상 시작했는지 |
| 만들기 목록에 초안이 안 보임 | 같은 계정인지, 사진 업로드 후 서버 초안이 생성됐는지, 이미 완료·만료됐는지 |
| 쪽지 초안이 안 보임 | 같은 계정·저금통·브라우저·사이트 주소인지, 저장 완료 후 새로고침했는지 |
| 다른 탭 변경 안내 | 충돌 방지가 작동한 상태다. 저장한 초안을 다시 불러온다. |
| 바꾼 화면이 안 보임 | 최신 프론트가 실행 중인지, 현재 주소가 로컬인지, 새로고침으로 최신 파일을 읽었는지 |


## 추가 보완 테스트: 초안 카드와 쪽지 진입 통합

1. 디자인 초안을 3개 이상 저장한다. 한 페이지에 최대 2개인지, 실제 본체·그림·저장 입구가 보이는지, 현재 단계가 편집 화면과 같은지 확인한다.
2. 각 카드의 `생성 시간 :`, `보관 기한 :`을 확인한다. 한국 시간으로 표시하되 이 두 줄에는 `(KST)`가 없다. `이어서 만들기`에는 화살표가 없다.
3. 마지막 페이지에서 `삭제하기` → `취소`는 그대로 유지한다. `삭제 확인`은 해당 초안만 없애고, 마지막 카드가 없어지면 이전 페이지로 돌아간다. 완성된 저금통은 유지된다.
4. 직접 만들기에서 틀을 고르거나 그린 뒤 나갔다가 새 제작에 들어간다. 빈 캔버스·선택 없음·다음 단계 비활성 상태여야 한다. 저장된 초안의 `이어서 만들기`는 실제 배치와 편집 단계를 복구해야 한다.
5. 초안이 있는 계정의 보관함에는 새 저금통 만들기 아래에 이어 만들기 안내가 나온다. 다른 계정에서는 이전 계정의 안내와 초안이 보이면 안 된다.
6. 두 계정이 각각 쪽지를 넣은 잠긴 저금통에서 `쪽지 확인`을 연다. 본인 쪽지만 보이고 전체 탭은 없다. 검색 장수도 본인 것만 세고 댓글·리액션 영역은 없다. 다른 작성자의 상세 번호를 직접 요청해도 404다.
7. 열린 저금통에서는 창 안의 전체/내 쪽지로 전환하고 검색·태그·페이지가 선택한 범위에 적용되는지 확인한다. 날짜 정렬·원본 사진 확대·좌우 탐색은 유지한다. Tab·Escape로 상세 → 목록 → 원래 버튼 복귀도 확인한다.
8. `캘린더에 추가`는 `.ics` 파일을 다운로드한다. 캘린더 앱에서 가져오면 오픈 시각부터 30분 일정이 생긴다. 자동 등록·자동 동기화·자체 알림은 없고 알림은 캘린더 앱에서 설정한다. 오픈일 수정 시 새 파일로 기존 일정을 갱신해야 한다.

로컬 UI 검증은 시험 데이터만 사용하며 운영 DB·S3·AI를 호출하지 않는다. 운영 반영 여부와 실제 기기 캘린더 앱 가져오기는 배포 후 별도 확인한다.


### 이번 보완 검증 결과

- 프론트 Node 회귀 테스트 337건 통과, Vite 빌드 성공. 기존 큰 번들 경고는 남아 있다.
- 백엔드 관련 테스트 351건 통과(실제 Security 필터의 초안 삭제 인증·CSRF, 소유권/재시도/완성 초안 보호, MariaDB 초안 목록, 오픈 전 쪽지·댓글·이벤트 비공개 규칙 포함), bootJar 성공.
- 실제 React 빌드 + 로컬 시험 API로 2개씩 페이지 이동, 마지막 초안 삭제 후 이전 페이지 보정, 본체·그림 미리보기, 새 제작 빈 화면, 명시적 초안 복구, 보관함 안내, 잠김/열림의 전체·내 쪽지 전환 및 Escape 복귀 확인.
- 390px 프레임에서 모바일 카드·쪽지 창의 가로 넘침 없음 확인. 프레임 폭 390px 중 세로 스크롤바를 제외한 콘텐츠 폭은 375px이다.
- 캘린더 버튼으로 실제 `.ics` 파일을 내려받아 확인했다. 시험 오픈 시각 2026-08-13 18:35 KST가 `DTSTART:20260813T093500Z`, 종료는 30분 뒤인 `DTEND:20260813T100500Z`로 저장됐다. 운영 배포와 실제 사용자의 캘린더 앱 가져오기는 이번 로컬 검증에 포함하지 않았다.


### 이번 보완의 파일 위치

| 부분 | 수정 파일 |
| --- | --- |
| 초안 카드·페이지·삭제·보관함 안내 | `frontend/src/features/jarDesign/components/DesignDraftShelf.jsx`, `frontend/src/features/jarDesign/components/DesignDraftResumePrompt.jsx`, `frontend/src/pages/JarsPage.jsx`, `frontend/src/api/jarDesignDraftApi.js` |
| 빈 제작 화면·저장 단계 표시 | `frontend/src/pages/JarDesignNewPage.jsx`, `frontend/src/features/jarDesign/designWorkflow.mjs`, `frontend/src/features/jarDesign/components/DesignProgress.jsx` |
| 쪽지 진입·전체/내 범위·키보드 이동 | `frontend/src/pages/JarDetailPage.jsx`, `frontend/src/features/jarDetail/components/JarZoomModal.jsx`, `frontend/src/features/jarDetail/components/JarZoomNoteDetailModal.jsx`, `frontend/src/features/jarDetail/utils/noteViewScope.mjs`, `frontend/src/features/jarDetail/hooks/useModalFocus.js` |
| 초안 목록·삭제 API와 상태 | `src/main/java/shop/esjh/memoryjar/controller/ai/JarDesignDraftController.java`, `src/main/java/shop/esjh/memoryjar/service/ai/JarDesignDraftService.java`, `src/main/java/shop/esjh/memoryjar/repository/ai/JarDesignDraftRepository.java`, `src/main/java/shop/esjh/memoryjar/entity/ai/JarDesignDraft.java`, `src/main/java/shop/esjh/memoryjar/dto/ai/response/JarDesignDraftListResponse.java` |
| 테스트 | `frontend/src/features/jarDesign/designWorkflow.test.mjs`, `frontend/src/features/jarDetail/utils/noteViewScope.test.mjs`, `src/test/java/shop/esjh/memoryjar/config/SecurityConfigTest.java`, `src/test/java/shop/esjh/memoryjar/controller/ai/JarDesignDraftControllerTest.java`, `src/test/java/shop/esjh/memoryjar/entity/ai/JarDesignDraftTest.java`, `src/test/java/shop/esjh/memoryjar/repository/jar/JarRepositoryTest.java`, `src/test/java/shop/esjh/memoryjar/service/ai/JarDesignDraftServiceTest.java` |
| 시험 화면·계약 문서 | `tools/ui/selected-features-fixture.py`, `docs/API.md`, `docs/DTO.md`, 이 문서 |

검증 캡처는 `build/draft-shelf-refinement/draft-shelf.jpg`, `build/draft-shelf-refinement/notes-scope.jpg`에 보관했다. 시험 API의 가상 데이터이며 운영 사용자 자료는 아니다. 스키마·의존성 변경은 없다.

56px로 줄인 미리보기의 추가 캡처는 `build/draft-shelf-refinement/draft-shelf-small.jpg`다. 이 캡처는 페이지 버튼을 32px로 줄이기 전 화면이다. 캡처·검증 로그는 로컬 빌드 산출물이므로 Git에 포함하지 않았다.

### 초안 보관함 크기 조정

- 저금통 미리보기는 176px에서 56px로 줄이고 이름·작업 단계 옆에 배치했다. 생성 시간·보관 기한·이어서 만들기·삭제 버튼은 유지한다.
- 페이지 이동은 `이전 1 다음` 형태로 표시하고 버튼 높이를 44px에서 32px로, 글씨를 14px에서 12px로 줄였다. 버튼 간격은 8px이다. 화면 낭독기에는 페이지 번호의 의미를 전달하고 키보드 초점 표시·중복 요청 방지는 유지한다.
- 해당 UI 조정 후 Vite 빌드와 Git 공백 검사를 통과했다. 56px 미리보기는 실제 브라우저에서 표시 크기를 확인했다. 최신 페이지 버튼의 실제 모바일 기기 터치감은 배포 후 확인한다.


## 2026-11-20 추가 변경: 1·2단계 자동 저장

이 절은 앞서 기록한 ‘업로드 전 본체는 화면 메모리에만 유지’ 동작을 대체한다.

- 1단계의 미완성 틀과 2단계의 사진 원본·미확정 그림판을 계정·작업 번호별 IndexedDB에 저장한다. 같은 브라우저·사이트 주소에서만 복구할 수 있다.
- 새 제작은 새 작업 번호로 빈 화면에서 시작한다. 기존 작업은 이어 만들기 또는 해당 작업 주소에서 복구한다.
- 초기 작업과 서버 작업을 최근 수정순으로 합쳐 2개씩 표시한다. 초기 작업에는 브라우저 저장 표시가 나온다. 마지막 저장부터 보관 기한은 7일이다.
- 저장 버전을 비교해 다중 탭 덮어쓰기를 막고 삭제·만료·서버 전환 후 오래된 저장이 작업을 되살리지 못하게 한다.
- 3단계 서버 초안 생성 성공 후 초기 작업을 정리하고 서버 번호를 보관한다. 서버 생성 API와 DB 스키마는 변경하지 않았다.
- 프론트 테스트 349건, 실제 브라우저 IndexedDB 검사 12건, Vite 빌드 통과. 실제 그림판의 재진입·단계 전환·모바일 화면 검증은 컴퓨터 사용 도구의 주소 확인 제한으로 중단되어 남아 있다. 검증 완료로 간주하지 않는다.
- 주요 파일: `earlyDesignDraftStore.mjs`, `earlyDesignWriter.mjs`, `useEarlyDesignDraft.js`, `designDraftPager.mjs`, `JarDesignNewPage.jsx`, `JarDesignCanvas.jsx`, `JarBodyWorkshop.jsx`, `DesignDraftShelf.jsx`, `DesignDraftResumePrompt.jsx`.
- 수동 확인: 틀 한 획 작성 → 저장 완료 확인 → 나가기 → 이어 만들기로 픽셀 복구. 2단계에서도 그림 확정 전 이탈·새로고침 후 복구를 확인한다. 새 제작의 빈 상태, 다른 계정 격리, 서버 전환 후 목록 중복 여부도 확인한다.
