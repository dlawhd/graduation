# AI 스타일 선택 예시 이미지

2026-10-22: 기존 여섯 예시는 그대로 두고 네온 드로잉·크롬 미러·리소 프린트를 추가했다. 최종 경로·생성 지시·검증 구분은 [V53 예시 이미지](AI_STYLES_V53.md#예시-이미지와-생성-프롬프트)에 기록했다. 아래는 기존 6종의 생성 기록이다.

2026-10-15. Built-in image generation으로 만든 선택 도움용 예시다. 실제 생성 API의 출력 검증 자료나 프롬프트 변경이 아니다.
같은 꽃과 화분을 여섯 그림체로 비교한다. 원본은 생성 도구 저장소에 보존하고 웹용 사본은 sharp로 320px WebP(픽셀은 nearest-neighbor) 변환했다. 픽셀 예시는 실제 출력의 96×96 / 64색 보장을 대신하지 않는다.

자산: `frontend/public/images/ai-styles/{cute-2d,soft-3d,watercolor,hand-drawn,weirdo,pixel}.webp`

## cute

Use case: stylized-concept. Asset type: square illustration for a Korean web app AI style selection card, not a mockup. Create one beautiful easily readable example of the CUTE 2D illustration style. Subject: exactly one coral-pink flower with five rounded petals, a warm yellow center, a gently curved green stem and two green leaves, growing from one simple orange terracotta flowerpot. Centered, entire flower and pot visible, subject fills 75% of square with even clean margins. Style: charming flat 2D, clean confident dark warm-green outlines, simple rounded shapes, small flat color areas, minimal cel shading, warm playful storybook sensibility, NOT 3D. Background: very light warm ivory, no scene or added objects. No faces, no letters, no labels, no watermark, no interface. It must look distinctly different from clay render, watercolor, pencil sketch, surreal art and pixel art.

## soft

Use case: stylized-concept. Asset type: square example illustration for an AI style selection card on a Korean memory-jar web app, not an interface mockup. Subject: exactly one coral-pink flower with five petals, warm yellow center, one green gently curved stem and two green leaves, growing from one simple orange terracotta flowerpot. Entire flower and pot visible centered, filling about 75% of square, even clean margins. Background light warm ivory, no environment or props. Style/medium: SOFT CLAY 3D: a high-quality 3D clay render with genuinely rounded plump petals and pot, matte soft rubber / clay material, convincing volume, gentle ambient occlusion, soft studio shadows. NOT flat 2D, no outlines. No text, labels, logo, watermark, frame or UI. The flower and pot should be the only subject, to make comparing rendering styles easy.

## watercolor

Use case: stylized-concept. Asset type: square example illustration for an AI style selection card on a Korean memory-jar web app, not an interface mockup. Subject: exactly one coral-pink flower with five petals, warm yellow center, one green gently curved stem and two green leaves, growing from one simple orange terracotta flowerpot. Entire flower and pot visible centered, filling about 75% of square, even clean margins. Background light warm ivory, no environment or props. Style/medium: WATERCOLOR: authentic delicate watercolor painting on ivory cotton paper, transparent pigment washes, wet-on-wet blooms, softly bleeding edges, visible paper grain, graceful uneven brush marks. No black cartoon outlines, no 3D rendering. No text, labels, logo, watermark, frame or UI. The flower and pot should be the only subject, to make comparing rendering styles easy.

## hand

Use case: stylized-concept. Asset type: square example illustration for an AI style selection card on a Korean memory-jar web app, not an interface mockup. Subject: exactly one coral-pink flower with five petals, warm yellow center, one green gently curved stem and two green leaves, growing from one simple orange terracotta flowerpot. Entire flower and pot visible centered, filling about 75% of square, even clean margins. Background light warm ivory, no environment or props. Style/medium: HAND DRAWN: colored pencil and graphite hand drawing on ivory sketch paper, visibly natural confident irregular pencil contours, hatching and fine dry colored-pencil texture, lightly filled color areas with air and paper showing. Not watercolor washes, not a polished vector. No text, labels, logo, watermark, frame or UI. The flower and pot should be the only subject, to make comparing rendering styles easy.

## weirdo

Use case: stylized-concept. Asset type: square example illustration for an AI style selection card on a Korean memory-jar web app, not an interface mockup. Subject: exactly one coral-pink flower with five petals, warm yellow center, one green gently curved stem and two green leaves, growing from one simple orange terracotta flowerpot. Entire flower and pot visible centered, filling about 75% of square, even clean margins. Background light warm ivory, no environment or props. Style/medium: BIZARRE SURREAL: recognizable flower and orange pot with strongly folded, warped, flowing asymmetric shapes and uncanny dreamlike tactile painted texture. The same five pink petals curl and twist, same green stem bends in a surreal S curve, pot gently folds as if soft. Strong structural distortion, not simply cute. Still readable as a flower. No faces, no eyes, no extra anatomy, no gore, no horror, no new objects. No text, labels, logo, watermark, frame or UI. The flower and pot should be the only subject, to make comparing rendering styles easy.

## pixel

Use case: stylized-concept. Asset type: square example illustration for an AI style selection card on a Korean memory-jar web app, not an interface mockup. Subject: exactly one coral-pink flower with five petals, warm yellow center, one green gently curved stem and two green leaves, growing from one simple orange terracotta flowerpot. Entire flower and pot visible centered, filling about 75% of square, even clean margins. Background light warm ivory, no environment or props. Style/medium: PIXEL ART: genuinely crisp 96 by 96 logical pixel art enlarged with nearest-neighbor hard square edges, limited cohesive palette of no more than 32 colors, deliberate cluster-based shading, stair-stepped silhouette, charming retro game sprite, no grid overlay. NO smoothing, blur, gradients, antialiasing or painterly brush texture. No text, labels, logo, watermark, frame or UI. The flower and pot should be the only subject, to make comparing rendering styles easy.
