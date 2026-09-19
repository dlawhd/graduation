추가로 확정해야 할 것은 아래 네 가지입니다.
1. 외부 원본의 비율 처리
   권장: 원본을 자르지 않고 비율 유지 축소 후, 480×480 흰색 Canvas 중앙에 배치합니다.
   이렇게 하면 세로 사진·가로 사진도 잘리지 않습니다.
2. 투명 배경 처리
   권장: PNG/WebP의 투명 영역은 흰색으로 합성합니다. 이후 Cloudflare 입력, Rekognition 심사, S3 원본이 동일한 PNG가 됩니다.
3. 허용 형식과 애니메이션
   PNG/JPEG/WebP만 실제 바이트로 판별해 허용하고, GIF·APNG·animated WebP·SVG·HEIC는 거절합니다.
   WebP는 JDK 기본 ImageIO만으로 안정적으로 처리되지 않으므로 ImageIO 플러그인을 추가해야 합니다. TwelveMonkeys의 WebP 플러그인이 Java ImageIO에 등록되어 사용되는 방식입니다. Java ImageIO의 리더 등록 방식, TwelveMonkeys WebP 지원
4. 보안 상한
   원본·Cloudflare 결과 모두 최대 10MB, 원본은 디코딩 전 최대 총 픽셀 수도 제한해야 합니다. 압축은 작지만 해상도가 비정상적으로 큰 이미지 공격을 막기 위해서입니다.
   권장값은 원본 최대 4096×4096, 총 16MP입니다. 정규화 결과는 항상 480×480 PNG입니다.
   AI 결과 정책은 이렇게 고정하겠습니다.
- Cloudflare 요청: width=1024, height=1024
- 일반 후보: 실제 디코딩 결과가 **정확히 1024×1024**여야 성공
- 결과 형식: PNG/JPEG/WebP 응답은 허용하되 서버가 PNG로 재인코딩하여 Private S3에 저장
- Pixel 후보: 1024×1024 응답 검증 후 64×64 축소 → 24색 → nearest-neighbor 480×480 PNG로 저장
- 원본과 AI 결과 모두 정규화된 PNG를 Rekognition에 심사하여, “심사한 파일”과 “실제로 AI에 넣고 저장한 파일”이 달라지지 않게 처리