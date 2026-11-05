# 쪽지의 네이버 지도 장소 선택

## 무엇을 연결했나?

쪽지의 장소 칸은 직접 입력할 수도 있고, 지도 버튼을 눌러 별도 팝업에서 고를 수도 있다.
상호명 검색 결과를 누르면 **장소 이름·주소**, 주소 검색 결과나 지도 위를 누르면 **해당 위치의 주소**를 선택한다.
선택한 내용을 확인하고 **이 장소 사용**을 눌러야 장소 칸이 바뀐다.
닫기·취소·검색 실패로 기존에 적은 장소를 지우지 않는다. 팝업을 닫으면 쪽지 작성창으로 돌아온다.

기존 카카오 지도 호출을 네이버로 교체했다. 소셜 로그인은 변경하지 않았다.
DB·쪽지 API의 `location` 문자열(최대 100자)은 그대로 사용한다.
100자를 넘는 결과는 몰래 잘라 저장하지 않고 직접 짧게 입력하도록 안내한다.
좌표는 선택 지도에만 사용하며 쪽지 DB에 추가 저장하지 않는다.

## 1. NAVER API HUB: 장소 검색 키

장소 이름으로 검색할 때 사용하는 **서버 전용 키**다. 네이버 로그인용 키·지도 표시용 키와 다르다.

2026-07-31부터 개발자센터에서는 검색 API 신규 신청이 막혔다.
따라서 기존 로그인 앱에 검색을 추가하거나 그 Client ID·Secret을 재사용하는 방식으로는 신규 연동할 수 없다.
이 문서의 최초 개발자센터 등록 안내는 현재 절차에 맞지 않아 아래 HUB 절차로 바로잡았다.
기존 네이버 로그인 앱과 Callback URL은 그대로 유지한다.

1. [네이버 클라우드 콘솔](https://console.ncloud.com/)에 로그인한다.
2. **All Services → Application Services → NAVER API HUB**로 이동한다.
3. **Subscription → 서비스 이용 신청**에서 이용 조건을 확인하고 신청한다.
4. **Application → Application 등록**에서 **NAVER 검색 → 지역**을 선택한다.
5. 앱 이름은 예를 들어 `memoryjar-place`로 등록한다. 이미 등록했다면 다시 만들지 않는다.
6. 등록한 Application의 **인증 정보**에서 HUB용 **Client ID**, **Client Secret**을 확인한다.

HUB의 지역 검색 신청에는 개발자센터의 WEB 서비스 URL 설정을 사용하지 않는다.
지도 표시용 Maps의 허용 URL 등록은 아래 2번의 별도 설정이다.

두 값은 IntelliJ의 **Run → Edit Configurations → MemoryJarApplication → Environment variables**에 추가한다.
기존 DB·AWS 등의 환경변수와 프로그램 인수는 유지한다.

```text
NAVER_LOCAL_SEARCH_CLIENT_ID=HUB에서_발급받은_Client_ID
NAVER_LOCAL_SEARCH_CLIENT_SECRET=HUB에서_발급받은_Client_Secret
```

이 블록은 이름을 설명하는 예시다. 실제 비밀값을 이 문서·소스·채팅에 붙여 넣지 않는다.
기존 변수 이름은 유지했다. 앞서 로그인용 키를 넣었다면 **이 두 검색 변수의 값만 HUB 키로 교체**한다.
환경변수를 적용한 뒤 백엔드를 재시작한다. 네이버 로그인용 환경변수는 변경하지 않는다.

## 2. 네이버 클라우드: 지도 표시·주소 검색·지도 클릭 주소 조회

1. [네이버 클라우드 Maps 안내](https://guide.ncloud-docs.com/docs/maps-app)의 **새로운 Maps** 진입 링크로 이동한다.
2. 콘솔의 **Services → Application Services → Maps**에서 Application을 등록한다.
3. 이 기능에서 사용하는 **Web Dynamic Map**, **Geocoding**, **Reverse Geocoding**을 활성화한다.
4. Web 서비스 URL에는 공식 등록 규칙대로 `www`를 뺀 대표 도메인과 개발 주소를 등록한다.
   - `http://localhost:3000`
   - `http://esjh.shop` (등록란은 HTTP·HTTPS를 구분하지 않는다. 실제 접속은 기존 HTTPS 주소를 유지한다.)
   - `127.0.0.1`이나 별도 미리보기 주소로 실제 지도를 시험한다면 그 주소도 별도로 등록한다.
5. 인증정보에서 **Client ID / API Key ID (`ncpKeyId`)**를 확인한다.

서비스 신청 화면의 요금·이용 한도를 확인한 뒤 활성화한다. 이 코드 작업은 서비스 가입·결제·운영 설정 변경을 실행하지 않는다.

로컬의 개인 `frontend/.env.local`에 다음 **공개 식별자**만 추가한다.

```dotenv
VITE_NAVER_MAP_KEY_ID=발급받은_Maps_Key_ID
```

검색 Client Secret이나 Maps Secret Key는 프론트에 넣지 않는다.
`VITE_` 변수는 브라우저에 포함되므로 지도 공개 식별자에는 허용 URL 제한을 설정한다.
변경 후 Vite 개발 서버를 재시작한다.

지도는 공식 `https://oapi.map.naver.com/openapi/v3/maps.js`를 `ncpKeyId`, `submodules=geocoder`, 준비 콜백으로 로드한다.
지도 크기 변경 시 별도 바깥 영역의 크기로 `setSize`를 적용한다.
닫을 때 지도·이벤트·크기 관찰·예약 프레임·주소 타이머를 해제한다.

## 3. 운영 적용 시 설정 위치

| 설정 | 위치 | 적용 시점 |
| --- | --- | --- |
| `VITE_NAVER_MAP_KEY_ID` | Vercel 프로젝트의 프론트 환경변수 | 프론트 다시 빌드·배포 |
| `NAVER_LOCAL_SEARCH_CLIENT_ID` | API 서버 프로세스/컨테이너 환경변수 | API 재시작·배포 |
| `NAVER_LOCAL_SEARCH_CLIENT_SECRET` | API 서버 프로세스/컨테이너 환경변수 | API 재시작·배포 |

서버 호스트에 변수를 추가하는 것만으로 기존 컨테이너에 전달되지는 않는다.
운영 Compose의 API 환경변수 전달도 확인해야 한다. 실제 값은 저장소에 넣지 않는다.
서버 검색 API가 먼저 준비된 뒤 프론트를 적용한다. 기존 키가 없는 배포도 앱 시작·직접 장소 입력은 가능하다.

## 4. 서버 API와 보호 장치

```http
GET /api/v1/places/search?q=서울숲
```

기존 로그인 쿠키/JWT 인증을 사용한다. 사용자 번호는 인증 주체에서 읽으며 요청의 번호를 신뢰하지 않는다.
검색어는 공백이 아닌 1~100자이며 제어 문자를 허용하지 않는다.

```json
{"data":[{"name":"서울숲","address":"서울 성동구 뚝섬로 273","latitude":37.5445,"longitude":127.0374}]}
```

- 최대 5개만 반환하며 도로명 주소가 없으면 지번 주소를 사용한다.
- 외부 호출은 `GET https://naverapihub.apigw.ntruss.com/search/v1/local`이다.
  `query`를 UTF-8로 인코딩하며 `display=5`, `start=1`, `sort=random`, `format=json`을 명시한다.
- 인증 헤더는 **`X-NCP-APIGW-API-KEY-ID`**, **`X-NCP-APIGW-API-KEY`**다.
  구형 `X-Naver-Client-*` 헤더나 로그인 키로 자동 재시도하지 않는다.
- HUB의 WGS84 좌표 문자열과 기존 지역 검색의 10^7배 정수 표현을 경위도로 정규화한다.
  숫자가 아닌 값·비정상 범위·불명확한 큰 수는 버리고, 이름의 검색 강조 태그는 제거해 일반 문자열로 표시한다.
- 외부 URL은 HUB 주소로 고정한다. 브라우저가 호출 대상이나 인증 헤더를 지정할 수 없다.
- DB 조회·저장·트랜잭션 없이 외부 요청을 처리한다.
- 연결 대기 3초, 요청 대기 6초. 동시 외부 호출은 서버 한 대당 최대 8개다.
- 서버 한 대 기준 계정별 1초 간격·분당 최대 20회. 기록은 1분 만료, 최대 4,096계정이며 검색어는 보관하지 않는다.
- 제한은 429, 설정 누락·외부 서비스 실패는 503으로 처리한다. 네이버 오류 원문·비밀키는 응답·로그에 남기지 않는다.
- HUB의 401·403을 우리 API의 로그인 만료 응답으로 바꾸지 않는다. 외부 검색 실패로만 반환해 사용자의 로그인 상태와 구분한다.
- 성공 응답은 `Cache-Control: no-store`. 외부 검색 결과를 서버 캐시에 새로 보관하지 않는다.
- 위 요청 제한은 단일 서버 메모리 기준이다. 서버 재시작 시 초기화되고 여러 API 서버 사이에는 공유되지 않는다. 실제 네이버 콘솔의 전체 이용 한도도 별도로 관리한다.

프론트는 타이핑마다 검색하지 않고 검색 버튼/Enter에서 호출한다.
동일 검색의 중복 클릭을 막고, 검색어 변경·화면 닫기 때 요청을 취소한다.
늦게 도착한 검색·주소 응답은 최신 선택을 덮어쓰지 못한다.

## 5. 검증 결과와 실제 연결 확인

2026-11-05 지도 전환 단계의 로컬 검증(HUB 이관 전):

- 관련 백엔드 70개 테스트 통과: 새 검색·요청 제한·인증과 기존 쪽지 API 포함.
- 프론트 유틸리티 274개 테스트 통과. 지도 로더의 설정 누락·중복 로드·네트워크/인증 실패·시간 초과·모듈 누락 포함.
- 실제 작성창 Chrome 테스트: 모바일 390px, PC 1280px에서 각 17개 시나리오 통과.
  검색·지도 클릭·주소 실패·취소·늦은 응답·100자 제한·기존 쪽지 미리보기/저장·지도 자원 해제를 확인했다.
- 백엔드 `bootJar`, 프론트 `npm run build` 통과. 기존 큰 JS 청크 경고는 남아 있다.
- 위 자동 검증은 네이버 SDK·HTTP 대역을 사용하고 실제 외부 요청은 차단했다. 실제 키를 사용한 네이버 연동 검증은 별도다.

HUB 이관 후 추가 검증(2026-11-05):

- 관련 백엔드 **90개 테스트, 실패 0·건너뜀 0**, `bootJar` 통과.
- 서비스 33개, 실제 로컬 HTTP 왕복 5개, 검색 컨트롤러 7개, 요청 제한 3개,
  기존 보안 24개·쪽지 컨트롤러 18개를 포함한다.
- 실제 로컬 HTTP 왕복은 HUB 목적지 주소를 검증한 뒤 **127.0.0.1의 임시 서버로만** 전송한다.
  HUB 헤더, UTF-8 검색어, 쿼리 개수·특수문자, JSON 변환과 리다이렉트/401/403/429 처리를 확인했다.
- HUB 게이트웨이 오류와 검색 오류의 두 응답 형식을 검사했고 외부 실패 원문·키를 사용자에게 돌려주지 않았다.
- HUB의 실제 키·권한·이용 한도는 호출하지 않았다. 위 결과를 외부 서비스 연동 성공으로 해석하지 않는다.
- 이번 HUB 이관은 프론트 실행 코드·DB·로그인 설정을 변경하지 않았다. 프론트 검증 기록은 위 지도 전환 단계 기록과 구분한다.

실행 명령:

```powershell
.\gradlew.bat test --tests '*NaverPlaceSearch*Test' --tests '*PlaceSearchRateLimiterTest' --tests '*PlaceSearchControllerTest' --tests '*SecurityConfigTest' --tests '*NoteControllerTest' bootJar --console=plain
```

실제 키·도메인 설정 후에는 다음을 확인한다.

1. 로그인 후 쪽지 작성에서 지도 버튼을 눌러 네이버 지도가 보이는지 확인한다.
2. `서울숲` 검색 → 결과 선택 → 이름·주소/핀 확인 → **이 장소 사용** → 장소 칸 반영을 확인한다.
3. 지도의 다른 위치를 눌러 주소가 바뀌는지, 취소하면 기존 입력이 유지되는지 확인한다.
4. 쪽지 미리보기 → 저장 → 본인 쪽지에서 장소 문자열을 확인한다.
5. 지도 인증 실패 시 Maps 허용 URL·공개 Key ID·Web Dynamic Map/Geocoding/Reverse Geocoding 활성화를 확인한다.
6. 검색 503이면 두 검색 환경변수가 **HUB용 키**인지, HUB Application에 **지역** 권한이 있는지와 이용 한도를 확인한다.

실제 사용자 쪽지를 작성하는 마지막 저장 확인은 사용자가 허용한 시험 저금통에서 진행한다.

## 6. 지도 축소 오류와 별도 팝업 수정 (2026-11-05)

**문제:** 작성창 아래에 지도를 펼치면 지도가 점점 작아져 검색·클릭이 어려웠다.

**원인:** 지도 요소 자신의 크기를 관찰하면서 그 요소에 다시 `setSize`를 적용했다.
테두리를 뺀 크기가 다시 반영되면 다음 관찰에서 크기가 또 줄어드는 순환이 생긴다.
앞선 지도 대역은 `setSize`를 생략해 이 현상을 잡지 못했다.
대역도 실제 SDK처럼 DOM 크기를 바꾸도록 수정하자, 수정 전 코드에서 대기 400ms 동안
지도 영역이 **252×252 → 204×204**로 줄어드는 현상을 재현했다. 실제 네이버 서버의 성능 수치가 아닌 로컬 오류 재현 결과다.

**해결:** 기존 선택 팝업의 `createPortal`·native `dialog` 패턴을 사용했다.

- PC에서는 최대 960×740px, 작은 화면에서는 화면 안에 맞는 별도 팝업으로 연다.
- 지도와 검색 결과를 담는 영역을 분리하고, SDK가 수정하는 지도 요소가 아닌 바깥 영역만 관찰한다.
- 크기가 실제로 바뀐 경우에만 한 프레임에 한 번 반영한다. 지도의 중심 위치는 유지한다.
- 배경의 쪽지 작성창 입력을 막고 Tab 초점을 팝업 안에서 순환시킨다.
- 닫기·취소·Esc·배경 클릭은 지도 팝업만 닫으며, 지도에서 시작한 드래그가 배경에서 끝나도 취소하지 않는다.
- 선택 확정 후 장소 입력칸으로 초점을 돌려준다. 취소하면 지도 버튼으로 돌아가며 기존 입력을 유지한다.
- 기존 장소 문자열·서버 API·인증·DB는 변경하지 않았다.

**이번 검증:**

- 프론트 유틸리티 **274개 통과**, 프론트 빌드 통과. 기존 큰 JS 청크 경고는 남아 있다.
- Chrome 모바일 390px·PC 1280px에서 **각 25개 시나리오 통과**.
  기다리는 동안 크기 유지, 작은 창으로 변경한 후 안정화, 검색·주소 실패, 닫기·Tab·Esc·배경 클릭,
  지도 드래그, 초점 복구, 중복 요청·늦은 응답 차단, 기존 쪽지 미리보기·저장을 검사했다.
- SDK·검색 요청은 대역을 사용했다. 사용자가 설정한 실제 네이버 SDK에서는 로컬 화면을 새로고침한 후
  지도 크기 유지·검색·지도 클릭·장소 확정을 마지막으로 확인해야 한다.

## 변경 작업 보고

### 상호명 지도 표시·쉼표 표기 추가 (2026-11-05)

사용자 확인에 따라, 검색 결과를 지도에 상호명 표시로 추가하고 그 표시를 클릭해 선택하도록 했다.
네이버 배경 지도에 원래 그려진 가게 이름을 추출하거나 가까운 가게를 추측해 선택하지 않는다.

- 검색 결과 최대 5개에 번호·상호명이 있는 HTML 마커를 표시하고 결과가 보이도록 지도 범위를 맞춘다.
- 지도 표시의 클릭·Enter와 왼쪽 목록 클릭 모두 같은 선택 함수를 사용한다. 선택 상태도 서로 동기화한다.
- 지도 표시를 고를 때 외부 검색·주소 조회를 추가로 호출하지 않는다. 기존의 늦은 주소 응답은 선택을 덮어쓰지 못한다.
- 검색 변경·팝업 종료 시 마커와 DOM 이벤트를 함께 제거한다. 지도 이동·확대 때 검색을 자동 반복하지 않는다.
- 상호명은 DOM의 `textContent`로 넣는다. 외부 문자열이 HTML이나 스크립트로 실행되지 않게 한다.
- 신규 선택값은 `상호명, 주소`로 입력·미리보기·저장한다. 위도·경도를 새로 저장하거나 기존 쪽지 값을 수정하지 않는다.
- 프론트 274개 테스트·빌드, Chrome 모바일 390px·PC 1280px **각 32개 시나리오 통과**.
  지도 표시 클릭/Enter, 목록 선택 동기화, 검색 변경 후 표시 정리, HTML 실행 방지, 쉼표 형식 저장을 추가 검사했다.
  실제 네이버 SDK는 대역이므로 로컬 화면에서 실제 마커 표시·클릭을 마지막으로 확인해야 한다.

관련 파일: `NoteLocationField.jsx`, `noteComposer.css`, `note-location.browser.cjs`와 설정 안내다.
서버 API·DTO·DB·인증에는 이번 변경이 없다.

공식 근거: [HTML 마커](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Marker.html),
[지도 범위 조정](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Map.html#fitBounds).

1. **수정 파일**: 프론트 `frontend/src/features/note/components/NoteLocationField.jsx`, `frontend/src/features/note/naverMaps.js`, `frontend/src/api/placeApi.js`, `frontend/src/features/note/noteComposer.css`와 기존 카카오 로더 제거. 백엔드 `controller/note/PlaceSearchController.java`, `service/note/NaverPlaceSearchService.java`, `service/note/PlaceSearchRateLimiter.java`, `config/properties/NaverPlaceProperties.java`, 검색 요청·응답 DTO와 `application.yml`. 관련 테스트·API/DTO/설정 안내도 함께 반영했다.
2. **기존 동작**: 카카오 SDK에서 검색·주소 조회를 처리했다. 네이버 전환 준비본은 구형 개발자센터 검색 주소·헤더를 사용해 신규 HUB 키로 호출할 수 없었다.
3. **변경 동작**: 네이버 지도 SDK와 서버 지역 검색을 연결했다. 서버 검색은 신규 신청 가능한 HUB 주소·헤더·키를 사용하며 기존 프론트 응답 형식을 유지한다. 검색 결과·지도 핀·선택 결과를 함께 표시하고 확인 버튼으로만 입력을 확정한다.
4. **변경 이유**: 사용자가 선호하는 네이버 지도를 쓰면서 기존 쪽지 저장 형식과 직접 입력을 유지하기 위해서다.
5. **개선점**: 검색 Secret 서버 보관, 인증·호출 제한·대기시간 제한, 중복 검색·오래된 응답 차단, 닫을 때 자원 해제, 작성창 실제 폭에 맞춘 반응형 배치를 적용했다. 새 의존성·DB 변경은 없다.
6. **실행 검사**: 지도 전환 때 프론트 Node 테스트·빌드·PC/모바일 Chrome 회귀를 실행했다. 이번 HUB 이관에서는 위 명령으로 백엔드 관련 테스트·실제 로컬 HTTP 왕복·`bootJar`를 실행했다.
7. **결과**: HUB 이관 후 관련 백엔드 90개 테스트와 `bootJar`가 통과했다. 지도 전환 때의 프론트 274개·PC/모바일 각 17개 시나리오·프론트 빌드는 별도 선행 기록이다. 당시 큰 JS 청크 경고는 남아 있다.
8. **남은 확인**: 실제 네이버 키 발급·환경변수·허용 URL 설정 후 실제 지도 타일과 검색·주소 응답을 확인해야 한다. 이 단계에서는 커밋·푸시·운영 배포를 실행하지 않았다.

## 7. 도로명·지번 주소 검색 추가 (2026-11-05)

**기존 동작과 원인:** HUB 지역 검색은 가게·공원 같은 장소를 찾는 경로였다.
완전한 도로명 주소를 입력해도 등록된 사업장 결과가 없으면 빈 목록으로 끝났으며, 주소를 좌표로 바꾸는 Geocoding 호출은 없었다.

**변경:** 기존 팝업의 입력칸과 결과 목록·지도 표시를 재사용한다.

- 도로명+건물번호 또는 지번 형태는 Maps SDK `Service.geocode({ query })`를 먼저 호출한다.
- 그 외 문자열은 기존 서버 지역 검색을 먼저 사용한다. 정상적인 빈 목록일 때만 다른 방식을 한 번 확인한다.
- 권한 오류·호출 제한·시간 초과에 다른 API를 자동으로 이어 호출하지 않는다.
- 주소는 공식 응답 `v2.addresses`의 도로명 우선, 없으면 지번을 사용한다. 좌표가 잘못된 결과는 제외하고 중복 제거 후 최대 5개만 표시한다.
- 주소 결과 선택 시 주소만 저장한다. 상호명 결과의 `이름, 주소` 표기는 유지한다. 쪽지 API·DTO·DB는 변경하지 않는다.
- 주소 요청 대기는 8초로 제한한다. 검색어 변경·닫기 시 대기를 취소하고, 취소할 수 없는 SDK의 늦은 콜백은 무시한다.
- 검색 버튼·Enter에서만 요청하며 중복 클릭을 막는다. SDK 호출 원문·사용자 주소는 로그에 기록하지 않는다.

**설정:** 사용자가 기존 Maps Application에서 **Geocoding**을 추가 활성화한다.
기존 공개 Maps Key ID와 `geocoder` 모듈을 사용하며 Secret을 프론트에 추가하지 않는다.
HUB 지역 검색의 서버 호출 제한은 유지하지만, 브라우저 SDK 주소 요청에 그 서버 제한이 적용되는 것은 아니다.
Maps 사용량은 네이버 콘솔에서 별도로 관리한다.

**변경 파일:** `frontend/src/features/note/addressSearch.mjs`, `components/NoteLocationField.jsx`,
`addressSearch.test.mjs`, `frontend/tests/note-location.browser.cjs`, 프론트 README와 이 안내다.

**검증 결과:** 프론트 Node 테스트 **290개 통과**(주소 검색 신규 16개 포함), Vite 빌드 통과.
Chrome 모바일 390px·PC 1280px에서 SDK·API 대역으로 **각 41개 시나리오 통과**.
도로명·지번 검색, 양방향 빈 결과 보완, 중복 클릭, 권한·쿼터 오류, 8초 무응답,
검색어 변경·닫기 후 늦은 응답 무시, 지도 표시·목록 선택, 주소 미리보기·저장 요청을 확인했다.
외부 네이버 요청과 실제 쪽지 저장은 수행하지 않았으며 기존 큰 JS 청크 경고는 남아 있다.

**실제 연동 확인:** Maps 설정 저장 후 로컬 화면에서 지도 팝업을 다시 열어 도로명·지번 주소를 검색한다.
결과 선택 → 지도 위치 확인 → ‘이 장소 사용’ → 주소 입력을 확인하고, 기존 상호명 검색도 확인한다.
시험은 합성 주소·SDK/API 대역으로 수행하므로 사용자 주소가 실제 네이버에 등록되어 검색되는지까지 증명하지 않는다.
Geocoding 활성화 후 실제 주소의 응답은 별도로 확인해야 한다.

## 공식 문서

- [HUB 지역 검색 API](https://api.ncloud-docs.com/docs/naver-api-hub-search-local)
- [HUB 공통 인증·오류 계약](https://api.ncloud-docs.com/docs/naver-api-hub-overview)
- [HUB 신청·Application 등록](https://guide.ncloud-docs.com/docs/apihub-application)
- [HUB 이관 가이드](https://guide.ncloud-docs.com/docs/apihub-migration)
- [개발자센터 신규 신청 중단 공지](https://developers.naver.com/notice/article/32530)
- [Maps 시작·인증 설정](https://guide.ncloud-docs.com/docs/maps-app)
- [JavaScript SDK 로딩](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html)
- [좌표로 주소 조회](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Geocoder-Geocoding.html)
- [주소 검색 JavaScript API](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Service.html#geocode)
