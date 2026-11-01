"""격리 동시 사용자 시험의 성공·실패·미실행 단계와 자원·정리 결과를 비밀값 없이 정리한다."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def memory_mib(value):
    """컨테이너 메모리 표기를 MiB로 바꾼다. 관측하지 못한 순간 최대값을 추정하지 않는다."""
    match = re.fullmatch(r'([\d.]+)\s*(B|KiB|MiB|GiB)', value.split('/')[0].strip())
    if not match:
        raise ValueError('Unexpected memory unit')
    return float(match[1]) * {'B': 1/1048576, 'KiB': 1/1024, 'MiB': 1, 'GiB': 1024}[match[2]]


def generator_cpu_limit(phases):
    """실행 기록에서 읽으며, 설정 필드가 없던 과거 결과에만 당시 값 2를 사용한다."""
    values = sorted({row.get('generatorCpu', 2) for row in phases if row['targetVus'] > 0})
    if any(value not in (2, 4) for value in values):
        raise ValueError('Unexpected generator CPU limit')
    return values[0] if len(values) == 1 else values


def summarize(folder):
    """실제 요청 집계·실행 상태·빈 DB 복원·개별 프로세스 자원을 교차 확인한다."""
    root = Path(__file__).resolve().parents[2]
    folder = folder.resolve()
    if folder.parent != (root/'build/isolated-e2e-results').resolve() or not re.fullmatch(r'memoryjar-e2e-[a-f0-9]{12}', folder.name):
        raise ValueError('Dedicated result folder required')
    if any((folder/name).exists() for name in ['read-fixture.json', 'read-sessions.json']):
        raise ValueError('Private artifacts must be removed first')
    verification = load(folder/'dataset-verification.json')
    cleanup = load(folder/'dataset-cleanup.json')
    trial = load(folder/'concurrent-load.json')
    if trial.get('diagnostic') or trial.get('profiling'):
        raise ValueError('Use summarize-read-diagnosis.py for experiments or repeated profiling phases')
    resources = load(folder/'concurrent-resources.json')
    if not verification['allApplicationTablesRestored'] or any(verification['afterDelete'].values()):
        raise ValueError('Database cleanup not verified')
    if cleanup['remainingContainers'] or cleanup['remainingNetworks'] or not cleanup['summaryMetricsOnly']:
        raise ValueError('Resource or artifact cleanup not verified')
    if verification['populated']['users'] != 10000 or verification['activeLoginAccounts'] != 1000:
        raise ValueError('Unexpected test population')

    def metrics(name):
        raw = load(folder/name)
        if set(raw) != {'metrics'}:
            raise ValueError('Only metrics may enter the stored summary')
        return raw['metrics']

    def resources_for(phase):
        sampled = {}
        for suffix, label in [('runner', 'application'), ('db', 'database'), (phase, 'loadGenerator')]:
            rows = [r for r in resources if r['phase'] == phase and r['container'].endswith('-'+suffix)]
            if rows:
                sampled[label] = {'samples': len(rows),
                    'maxSampledCpuPercent': max(float(r['cpuPercent'].rstrip('%')) for r in rows),
                    'maxSampledMemoryMiB': max(memory_mib(r['memoryUsage']) for r in rows)}
        return sampled

    phases = {row['phase']: row for row in trial['phases']}
    # 이전 결과는 계획 필드가 없으므로 당시의 고정 100→300→1000 순서로 읽는다.
    planned = trial.get('plannedStages', [100, 300, 1000])
    target_vus = trial.get('targetVus', 1000)
    if target_vus not in [500, 1000] or planned != [100, 300, target_vus]:
        raise ValueError('Unexpected concurrent test plan')
    stages = []
    for vus in planned:
        seconds = 30 if vus >= 500 else 20
        phase = 'read-'+str(vus)
        if phase not in phases:
            stages.append({'targetConcurrentUsers': vus, 'status': 'not_run'})
            continue
        state = phases[phase]
        row = {'targetConcurrentUsers': vus, 'scheduledSeconds': seconds,
            'status': 'passed' if state['passed'] else 'failed', 'exitCode': state['exitCode'],
            'stopReason': state['stopReason'], 'oomKilled': state['oomKilled'], 'resources': resources_for(phase)}
        if (folder/(phase+'-summary.json')).exists():
            measured = metrics(phase+'-summary.json')
            failed = [key for key, metric in measured.items() if any(metric.get('thresholds', {}).values())]
            row.update({'activatedUsers': measured.get('activated_users', {}).get('count', 0),
                'readRequests': measured.get('read_requests', {}).get('count', 0),
                'readErrorRate': measured.get('read_errors', {}).get('value'),
                'responseChecksPassed': measured.get('checks', {}).get('passes', 0),
                'responseChecksFailed': measured.get('checks', {}).get('fails', 0),
                'failedThresholdMetrics': failed, 'endpoints': {}})
            statuses = Counter()
            with (folder/(phase+'-metrics.jsonl')).open(encoding='utf-8') as stream:
                for line in stream:
                    point = json.loads(line)
                    if point.get('type') == 'Point' and point.get('metric') == 'http_reqs':
                        statuses[point['data']['tags']['status']] += point['data']['value']
            assert sum(statuses.values()) == row['readRequests']
            row['observedHttpStatuses'] = dict(statuses)
            row['k6ObservedReadRatePerSecond'] = measured.get('read_requests', {}).get('rate')
            if state['passed']:
                assert row['activatedUsers'] == vus and not failed
                row['readsPerScheduledSecond'] = row['readRequests']/seconds
            for endpoint in ['jar_list', 'jar_detail', 'note_list']:
                latency = measured.get('http_req_duration{endpoint:'+endpoint+'}')
                count = measured.get('read_requests{endpoint:'+endpoint+'}', {}).get('count', 0)
                if latency:
                    row['endpoints'][endpoint] = {'requests': count, 'avgMs': latency['avg'],
                        'medianMs': latency['med'], 'p95Ms': latency['p(95)'], 'maxMs': latency['max']}
            assert sum(item['requests'] for item in row['endpoints'].values()) == row['readRequests']
        stages.append(row)
    auth = metrics('auth-summary.json')
    login = auth.get('login_duration_ms', {})
    all_passed = trial['exitCode'] == 0 and all(row['status'] == 'passed' for row in stages)
    sources = ['dataset-verification.json', 'dataset-cleanup.json', 'concurrent-load.json', 'concurrent-resources.json',
        'auth-summary.json', 'egress.txt', 'summary.txt']
    sources += [f'read-{vus}-{kind}.{extension}' for vus in planned
        for kind,extension in [('summary','json'),('metrics','jsonl')] if (folder/f'read-{vus}-{kind}.{extension}').exists()]
    return {'version': 1, 'dateKst': '2026-10-30', 'scope': f'LOCAL_{target_vus}_DISTINCT_CONCURRENT_USERS',
        'targetConcurrentUsers': target_vus, 'plannedStages': planned,
        'runId': folder.name, 'status': 'passed' if all_passed else
            ('threshold_failed' if all('read-'+str(vus) in phases for vus in planned)
             and phases['read-'+str(target_vus)]['exitCode'] == 99 else 'failed_or_incomplete'),
        'population': {k: v for k, v in verification['populated'].items() if v},
        'authenticatedAccounts': auth.get('prepared_accounts', {}).get('count', 0),
        'login': {'concurrent': False, 'requests': auth.get('login_requests', {}).get('count', 0),
            'avgMs': login.get('avg'), 'medianMs': login.get('med'), 'p95Ms': login.get('p(95)'), 'maxMs': login.get('max')},
        'authorization': {'anonymousStatus': verification['unauthenticatedStatus'], 'nonMemberStatus': 403,
            'nonMemberChecks': auth.get('authorization_checks', {}).get('count', 0)},
        'stages': stages, 'latencyReferenceP95Ms': 500, 'requestTimeoutSeconds': 3, 'pacingSecondsPerUser': 1,
        'businessRowCountsUnchangedDuringRead': verification.get('businessRowsUnchangedDuringRead', False),
        'cleanup': {'applicationTableCount': len(verification['afterDelete']),
            'remainingApplicationRows': sum(verification['afterDelete'].values()),
            'allApplicationTablesRestored': verification['allApplicationTablesRestored'], **cleanup,
            'helperPrivateSessionsRemoved': trial['privateSessionsRemoved']},
        'runtimeLimits': {'applicationCpu': 2, 'applicationMemoryMiB': 1536, 'applicationHeapMiB': 768,
            'databaseMemoryMiB': 768, 'databaseTmpfsMiB': 512,
            'loadGeneratorCpu': generator_cpu_limit(trial['phases']),
            'loadGeneratorMemoryMiB': 2048},
        'sourceHashes': {name: hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in sources},
        'limitations': [f'Local API read test on one PC. Not production capacity, {target_vus} browser or WebSocket sessions, or simultaneous logins.',
            f'1000 accounts are authenticated in preparation; up to {target_vus} accounts in {target_vus//10} groups query {target_vus//10*3} jars and {target_vus//10*120} notes. 9000 users provide background data.',
            'Phases run in fixed order with one second think time; no maximum throughput or before/after improvement claim.',
            'Application, DB and load generator share the Docker host. Generator CPU saturation can constrain the observation.',
            'Mock S3/mail/AI and synthetic text data; resource samples do not guarantee instantaneous peaks.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = summarize(args.folder)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'runId': result['runId'], 'stages': result['stages'], 'cleanup': result['cleanup']}))
