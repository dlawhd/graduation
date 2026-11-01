"""같은 합성 입력의 24회 기록을 검증하고, 개인정보 없는 수치와 쉬운 설명만 보관한다."""
import hashlib
import json
import statistics
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

project = Path(__file__).resolve().parents[2]
root = Path(sys.argv[1]).resolve()
assert root.parent == project / 'build/local-comparison'
read = lambda name: json.loads((root / name).read_text(encoding='utf-8-sig'))
sha = lambda data: hashlib.sha256(data).hexdigest()
commits = {'before': 'dd6e50b31ee9405f41a255152510367aa9d27cca',
           'after': '8a5f7cc6e689e23a1d495c31b2f3c3f4a388aade'}
manifest, build, geometry = read('run-public.json'), read('build-public.json'), read('geometry-public.json')
assert manifest['commits'] == commits and manifest['baseline'] == 'dd6e50b'
assert geometry['identical']
assert sha((root / 'monitor.mjs').read_bytes()) == build['observerSha256']
records, summaries, sources, tests = {}, {}, {}, {}
views = set()
for variant, commit in commits.items():
    reports = [read(f'browser-{variant}-block{block}.json') for block in [1, 2]]
    for report in reports:
        assert set(report) == {'version', 'variant', 'commit', 'scope', 'completion', 'providerReadsDuringBatch', 'rows'}
        assert report['version'] == 2 and report['commit'] == commit and report['variant'] == variant
        assert len(report['rows']) == 6
        for ordinal, row in enumerate(report['rows'], 1):
            assert set(row) == {'ordinal', 'status', 'clickToPhotoAndRenderReadyMs', 'clickToTwoRafObservationMs', 'viewport', 'triangles', 'resources'}
            assert row['ordinal'] == ordinal and row['status'] == 'completed' and row['triangles'] == 28160
            assert 0 < row['clickToPhotoAndRenderReadyMs'] <= row['clickToTwoRafObservationMs']
            v = row['viewport']
            assert v['fullyVisible'] and abs(v['width'] - 380) < .01 and abs(v['height'] - 380) < .01
            views.add(tuple(v[k] for k in ['windowWidth', 'windowHeight', 'devicePixelRatio', 'bufferWidth', 'bufferHeight']))
            for resource in row['resources']:
                assert set(resource) == {'kind', 'durationMs', 'ttfbMs'}
    records[variant] = reports
    first = [r['rows'][0]['clickToPhotoAndRenderReadyMs'] for r in reports]
    repeat = [row['clickToPhotoAndRenderReadyMs'] for r in reports for row in r['rows'][1:]]
    summaries[variant] = {'firstInFreshDocumentMs': first, 'firstTwoMedianMs': statistics.median(first),
        'repeatTenMedianMs': statistics.median(repeat), 'repeatMinMs': min(repeat), 'repeatMaxMs': max(repeat),
        'blocks': [{'firstMs': r['rows'][0]['clickToPhotoAndRenderReadyMs'],
                    'repeatFiveMedianMs': statistics.median(row['clickToPhotoAndRenderReadyMs'] for row in r['rows'][1:]),
                    'providerReadsDuringSixTransitions': r['providerReadsDuringBatch']} for r in reports]}
    component = 'frontend/src/features/jarDesign/components/CustomJarBody3D.jsx'
    original = subprocess.check_output(['git', 'show', f'{commit}:{component}'], cwd=project)
    snapshot = (root / variant / component).read_bytes()
    assert original.replace(b'\r\n', b'\n') == snapshot.replace(b'\r\n', b'\n')
    assert build['builds'][variant] == {'commit': commit, 'componentSha256': sha(snapshot)}
    sources[variant] = {'componentMatchesGitAfterLineEndingNormalization': True, 'gitSha256': sha(original)}
    xmls = list((root / variant / 'build/test-results/test').glob('TEST-*.xml'))
    counts = {key: sum(int(ET.parse(path).getroot().attrib[key]) for path in xmls)
              for key in ['tests', 'failures', 'errors', 'skipped']}
    assert counts == {'tests': 18 if variant == 'before' else 46, 'failures': 0, 'errors': 0, 'skipped': 0}
    frontend = (root / f'frontend-tests-{variant}.log').read_text(encoding='utf-8-sig')
    expected = 166 if variant == 'before' else 252
    assert f'pass {expected}' in frontend and 'fail 0' in frontend and 'skipped 0' in frontend
    tests[variant] = {'frontendPassed': expected, 'backendRelated': counts, 'frontendAndBackendBuilds': 'PASS'}
assert len(views) == 1
window_width, window_height, pixel_ratio, buffer_width, buffer_height = next(iter(views))
http, provider, proxy = read('http-check-public.json'), read('fixture-check-public.json'), read('ingress/results/proxy-check.json')
assert http['checksPassed'] == 30 and http['checksFailed'] == 0
assert provider['checksPassed'] == 10 and provider['checksFailed'] == 0
assert proxy['checksPassed'] == 3 and proxy['checksFailed'] == 0
functions, cleanup = read('browser-functions-public.json'), read('cleanup-public.json')
assert functions['status'] == 'PASS' and cleanup['containersRemaining'] == 0 and cleanup['networksRemaining'] == 0
assert cleanup['trialPortsClosed']
for variant in commits:
    session = (root / f'result-{variant}.txt').read_text(encoding='utf-8')
    assert '1 tests successful' in session and '0 tests failed' in session
reduction = lambda key: (1 - summaries['after'][key] / summaries['before'][key]) * 100
result = {'version': 1, 'dateKst': '2026-10-29', 'runId': root.name,
    'scope': 'LOCAL_HISTORICAL_FULL_STACK_COMPARISON_SAME_SYNTHETIC_INPUT', 'commits': commits,
    'measurementOrder': ['before-block1', 'after-block1', 'after-block2', 'before-block2'],
    'completion': 'photo-texture-ready-and-renderer.render-return; not GPU or actual monitor presentation',
    'samplesPerVersion': 12, 'firstSamplesPerVersion': 2, 'repeatSamplesPerVersion': 10,
    'schemaVersionForBoth': 53, 'buildProvenance': build, 'sourceVerification': sources,
    'syntheticPhoto': read('photo-public.json'), 'geometry': geometry, 'summary': summaries,
    'firstTwoMedianReductionPercent': reduction('firstTwoMedianMs'),
    'repeatTenMedianReductionPercent': reduction('repeatTenMedianMs'),
    'records': records, 'tests': tests, 'toolNodeTestsPassed': 9,
    'httpChecks': http, 'fixtureChecks': provider, 'proxyChecks': proxy, 'browserFunctions': functions,
    'cleanup': cleanup, 'runtime': read('runtime-public.json'),
    'toolSha256': {str(path.relative_to(project)).replace('\\', '/'): sha(path.read_bytes())
        for path in (project / 'tools/compat').rglob('*')
        if path.is_file() and path.suffix in ['.ps1', '.mjs', '.java', '.gradle', '.py']},
    'limitations': ['Local synthetic image provider; no real AWS latency, TLS, signature validation or production measurement',
        'Fresh document first transition is not all caches cleared or a restarted backend',
        'Only one synthetic shape/photo; two document-first samples and ten repeats per version',
        'Full historical releases include other changes; not isolated attribution to a single optimization',
        'Legacy schema latest V52, same V53 disposable DB used and application startup/reads passed',
        'Observer calls and fixed 380px CSS are test-only; source calculations/animation unchanged']}
dest = project / 'docs/performance/3d'
json_name = 'curved-photo-comparison-2026-10-29.json'
(dest / json_name).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
b, a = summaries['before'], summaries['after']
fmt = lambda n: f'{n:,.1f}'
md = f'''# 곡면 사진을 처음 적용한 버전과 현재 버전의 전체 로컬 비교

검사일: 2026년 10월 29일. 사용자가 지정한 `dd6e50b`로 프론트와 백엔드를 함께 맞춰 다시 시험했다. 기존 `c5f58c4` 비교는 별도 기록으로 보존했다.

## 1. 무엇을 비교했나?

| 항목 | 비교 기준 | 현재 구현 |
| --- | --- | --- |
| 프론트·백엔드 커밋 | `dd6e50b` | `8a5f7cc` |
| 커밋 시각, 한국 시간 | 2026-10-14 14:47:50 | 2026-10-26 20:13:38 |
| 사진 표현 | 사진도 볼록한 곡면에 붙임 | 사진도 볼록한 곡면에 붙임 |
| DB | 별도 빈 MariaDB, V53 | 별도 빈 MariaDB, V53 |
| 이미지 읽기 | 당시의 로컬 서명 URL 경로 | 현재의 권한 검사 이미지 API·서버 캐시 |

같은 480×480 합성 PNG, 같은 53점 윤곽, 같은 색·사진 배치·입구를 사용했다. 실제 회원정보나 운영 사진을 복사하지 않았다. 3D 영역은 380×380, 기록된 브라우저 영역은 {window_width}×{window_height}, 화면 배율은 {pixel_ratio}, 캔버스 픽셀은 {buffer_width}×{buffer_height}로 24회 모두 같았다. UI 애니메이션은 유지했다.

두 버전의 3D 모양 데이터도 대조했다. 정점(모양을 만드는 점) 14,196개, 삼각형 28,160개이며 좌표·법선(표면 방향)·UV(사진을 붙일 위치)·삼각형 연결·재질 구분이 모두 일치했다. 이 사실은 이번 합성 윤곽에 한정된다.

## 2. 어떻게 시간을 쟀나?

클릭 처리가 시작된 때부터 **사진과 테두리가 준비된 상태로 그리기 함수가 반환될 때**까지를 쟀다. 빈 몸통만 보인 시점은 완료가 아니다. 그 뒤 두 번의 화면 갱신 예약 관측도 원시 기록에 별도로 남겼으며, GPU 완료나 실제 모니터에 표시된 정확한 순간을 측정한 것은 아니다.

새 문서에서 첫 전환 1회와 2D 복귀 후 반복 전환 5회를 한 묶음으로 했다. 순서를 **기준 → 현재 → 현재 → 기준**으로 바꿔 버전당 2묶음, 총 12회씩 검사했다. 24회 모두 활성 탭이고 모양 전체가 화면 안에 보였으며 오류·시간 초과가 없었다. 기능 확인을 위한 추가 수동 전환은 이 24회에 포함하지 않았다.

브라우저의 모든 캐시를 비우거나 매번 백엔드를 재시작한 실험은 아니다. '첫 전환'은 **새 문서에서의 첫 전환**을 뜻한다. 두 버전의 실제 코드 경로를 유지했으므로 이미지 요청 경로 자체도 다르다.

## 3. 결과: 같은 모양의 반복 전환 중앙값 약 {reduction('repeatTenMedianMs'):.2f}% 감소

중앙값은 시간을 크기순으로 놓았을 때 가운데 값이다. 아래 값은 계산만의 시간이 아니라 사진 준비까지 포함한 위 완료 기준의 전체 전환 시간이다.

| 비교 항목 | 기준 `dd6e50b` | 현재 `8a5f7cc` | 감소율 |
| --- | ---: | ---: | ---: |
| 새 문서 첫 전환 2회의 중앙값 | {fmt(b['firstTwoMedianMs'])}ms | {fmt(a['firstTwoMedianMs'])}ms | {reduction('firstTwoMedianMs'):.2f}% |
| 반복 전환 10회의 중앙값 | **{fmt(b['repeatTenMedianMs'])}ms** | **{fmt(a['repeatTenMedianMs'])}ms** | **{reduction('repeatTenMedianMs'):.2f}%** |
| 반복 전환 최소~최대 | {fmt(b['repeatMinMs'])}~{fmt(b['repeatMaxMs'])}ms | {fmt(a['repeatMinMs'])}~{fmt(a['repeatMaxMs'])}ms | 범위이므로 계산하지 않음 |

감소율 = `(기준 시간 - 현재 시간) ÷ 기준 시간 × 100`. 반올림하기 전 원시 값으로 계산했다. 첫 전환은 각 2회뿐이므로 이 수치를 안정적인 평균이나 보장된 성능이라고 발표하지 않는다.

| 측정 묶음 | 기준 첫 전환 | 현재 첫 전환 | 기준 반복 5회 중앙값 | 현재 반복 5회 중앙값 |
| --- | ---: | ---: | ---: | ---: |
| 1, 기준 먼저 | {fmt(b['blocks'][0]['firstMs'])}ms | {fmt(a['blocks'][0]['firstMs'])}ms | {fmt(b['blocks'][0]['repeatFiveMedianMs'])}ms | {fmt(a['blocks'][0]['repeatFiveMedianMs'])}ms |
| 2, 현재 먼저 | {fmt(b['blocks'][1]['firstMs'])}ms | {fmt(a['blocks'][1]['firstMs'])}ms | {fmt(b['blocks'][1]['repeatFiveMedianMs'])}ms | {fmt(a['blocks'][1]['repeatFiveMedianMs'])}ms |

두 묶음 모두 현재 버전이 짧았다. 다만 이번 결과는 프론트·백엔드를 함께 바꾼 **역사 버전 전체의 로컬 차이**다. 특정 계산 한 곳이나 서버 캐시 하나만으로 {reduction('repeatTenMedianMs'):.2f}%를 얻었다고 원인을 단정하지 않는다.

## 4. 기능·권한·캐시 검증

- 두 화면에서 사진·테두리·입구 표시, 왼쪽/오른쪽 회전, 정면 복귀를 확인했다. 정면 복귀 후 회전·기울기 값은 모두 0이었다.
- 2D로 돌아오면 3D 캔버스가 0개이고 480px 사진 로딩이 완료됐으며, 다시 3D로 들어가는 반복도 통과했다.
- 실제 HTTP 로그인·CSRF·JWT·DB 조회·멤버 검사는 원래 앱 코드로 수행했다. 비로그인·비멤버·없는 저금통·금지된 쓰기를 거절했다.
- 캐시 적중 후에도 비멤버와 비로그인을 거절했다. 반복 이미지 요청은 사진 제공자를 다시 읽지 않았고 잘못된 요청도 제공자를 읽지 않았다.
- 현재 캐시의 만료·용량 제한·같은 사진 동시 요청 합치기·실패 후 재시도·중단/종료 처리는 기존 단위 테스트로 확인했다. 각 6회 묶음의 사진 제공자 읽기는 두 버전 모두 1회였으므로, 그 횟수만으로 캐시 개선 효과를 주장하지 않는다.

| 실행한 검사 | 기준 | 현재/공통 | 결과 |
| --- | ---: | ---: | --- |
| 각 버전에 있던 전체 프론트 Node 테스트 | 166개 | 252개 | 모두 통과, 건너뜀 0 |
| 관련 백엔드 테스트 | 18개, 3클래스 | 46개, 6클래스 | 모두 통과, 오류·건너뜀 0 |
| 프론트·백엔드 빌드 | 각 성공 | 각 성공 | 총 4개 성공 |
| 별도 DB 앱 시작·권한 사전 검사 | 세션 1개·7시나리오 | 세션 1개·7시나리오 | 정상 종료까지 통과 |
| 실제 HTTP·캐시 검사 | 공통 | 30항목 | 통과 |
| 비교 도구 / 사진 서버 / 진입 프록시 | 공통 | 9 / 10 / 3항목 | 통과 |
| 브라우저 전환 기록 | 12회 | 12회 | 전부 정상 |

백엔드 검사는 CustomJarBody·JarPhotoComposition·JarDesignViewService를 양쪽에서 실행했고, 현재 버전에는 JarDesignTextureCache·JarDesignTextureService·JarDesignTextureController 검사도 포함했다. **저장소의 백엔드 전체 테스트를 실행한 것은 아니다.** 프론트 빌드에는 기존 500KB 이상 청크 경고가 있으나 빌드는 성공했다.

## 5. 바꾸지 않은 것과 한계

이번에는 앱 성능 코드를 추가 수정하지 않았다. 비교 도구에 기준 커밋 선택·곡면 사진 완료 조건·원본 보존 검증·모양 대조만 보완했다. 스냅샷은 별도 폴더에 추출했고 원래 앱 소스·Git 브랜치·운영 배포·운영 DB는 바꾸지 않았다.

과거 앱의 마지막 마이그레이션은 V52이지만 동일한 V53 시험 DB에서 실제 시작·조회가 통과했다. 이것을 전체 운영 데이터의 하위 호환 보장으로 확대하지 않는다. 시험 앱은 외부 통신 경로가 없는 내부 네트워크에 있으며, 실제 AWS 인증정보를 전달하지 않았다. 실제 AWS 대신 고정 합성 사진을 주는 로컬 서버를 사용하므로 **운영 개선율·실제 S3 응답·TLS 연결 비용은 이번 결과로 말할 수 없다.**

도구 실행 결과와 전체 24회 원시 수치는 [{json_name}]({json_name})에 보관했다. 비밀번호·쿠키·서명 URL은 포함하지 않았다. 원본 시험 계정과 로그는 Git 제외 폴더에만 남겼다. 임시 컨테이너·네트워크와 시험 포트는 모두 정리했다. 재실행 방법은 [비교 도구 설명](../../../tools/compat/README.md)을 본다.

## 6. 포트폴리오에 쓸 수 있는 문장

> 곡면 사진 기능을 갖춘 초기 버전과 개선 버전의 프론트·백엔드를 분리된 로컬 환경에서 같은 합성 입력으로 비교했습니다. 3D 좌표·사진 좌표·삼각형 데이터의 일치를 검증하고, 각 버전 12회 전환을 측정했습니다. 반복 전환 10회의 중앙값은 {b['repeatTenMedianMs']/1000:.3f}초에서 {a['repeatTenMedianMs']/1000:.3f}초로 약 {reduction('repeatTenMedianMs'):.2f}% 줄었습니다. 사진 표시·회전·2D 복귀·권한·캐시 검증도 통과했습니다. 이 수치는 운영이 아닌 로컬 비교 결과입니다.
'''
(dest / 'CURVED_PHOTO_COMPARISON_2026-10-29.md').write_text(md, encoding='utf-8')
print(json.dumps({'status': 'PASS', 'summary': summaries,
    'firstReductionPercent': reduction('firstTwoMedianMs'), 'repeatReductionPercent': reduction('repeatTenMedianMs')}, ensure_ascii=False))
