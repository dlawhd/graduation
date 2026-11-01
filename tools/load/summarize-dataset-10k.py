"""격리 1만 계정 시험에서 공개 가능한 개수·지연·정리 결과만 추려 저장한다. 인증 세션은 읽어 출력하지 않는다."""
import argparse
import hashlib
import json
from pathlib import Path
import re


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def memory_mib(value):
    """Docker의 컨테이너 사용량 표기만 숫자로 바꾼다. JVM heap이나 순간 최대값으로 해석하지 않는다."""
    match = re.fullmatch(r'([\d.]+)\s*(B|KiB|MiB|GiB)', value.split('/')[0].strip())
    if not match:
        raise ValueError('Unexpected Docker memory unit')
    return float(match[1]) * {'B':1/1048576,'KiB':1/1024,'MiB':1,'GiB':1024}[match[2]]


def summarize(folder):
    """검증된 로컬 실행 폴더에서 측정 구간·오류·삭제 결과를 교차 확인한다."""
    root = Path(__file__).resolve().parents[2]
    allowed = (root/'build/isolated-e2e-results').resolve()
    folder = folder.resolve()
    if folder.parent != allowed or not re.fullmatch(r'memoryjar-e2e-[a-f0-9]{12}', folder.name):
        raise ValueError('Dedicated local result folder required')
    verification = load(folder/'dataset-verification.json')
    cleanup = load(folder/'dataset-cleanup.json')
    raw = load(folder/'read-summary.json')
    if set(raw) != {'metrics'} or (folder/'read-fixture.json').exists():
        raise ValueError('Private setup artifacts must be removed before publication')
    metrics = raw['metrics']
    if not verification['allApplicationTablesRestored'] or any(verification['afterDelete'].values()):
        raise ValueError('Application data cleanup not verified')
    if cleanup['remainingContainers'] or cleanup['remainingNetworks'] or not cleanup['privateFixtureRemoved']:
        raise ValueError('Isolated resource cleanup not verified')
    assert verification['populated']['users'] == verification['populated']['user_local_credentials'] == 10000
    assert verification['afterRead']['refresh_tokens'] == 10

    def tagged(name, **tags):
        for key,value in metrics.items():
            if not key.startswith(name+'{'):
                continue
            actual = dict(item.split(':',1) for item in key[len(name)+1:-1].split(','))
            if actual == {k:str(v) for k,v in tags.items()}:
                return value
        raise ValueError('Required measured endpoint missing')

    stages = []
    for vus,seconds in [(1,20),(5,20),(10,30)]:
        endpoints = {}
        for endpoint in ['jar_list','jar_detail','note_list']:
            latency = tagged('http_req_duration',phase='read',stage=vus,endpoint=endpoint)
            count = tagged('read_requests',stage=vus,endpoint=endpoint)['count']
            endpoints[endpoint] = {'requests':count,'avgMs':latency['avg'],'medianMs':latency['med'],
                                   'p95Ms':latency['p(95)'],'maxMs':latency['max']}
        count = sum(row['requests'] for row in endpoints.values())
        stages.append({'concurrentUsers':vus,'scheduledSeconds':seconds,'readRequests':count,
                       'readsPerScheduledSecond':count/seconds,'endpoints':endpoints})
    assert sum(stage['readRequests'] for stage in stages) == metrics['read_requests']['count']
    assert metrics['login_requests']['count'] == 10 and metrics['authorization_checks']['count'] == 1
    assert metrics['checks']['fails'] == 0
    resources = load(folder/'dataset-resources.json')
    sampled = {}
    for suffix,label in [('runner','application'),('db','database'),('k6','loadGenerator')]:
        rows = [r for r in resources if r['container'].endswith('-'+suffix)]
        sampled[label] = {'sampleCount':len(rows),
            'maxSampledCpuPercent':max(float(r['cpuPercent'].rstrip('%')) for r in rows),
            'maxSampledMemoryMiB':max(memory_mib(r['memoryUsage']) for r in rows)}
    login = metrics['login_duration_ms']
    thresholds_failed = any(failed for metric in metrics.values() for failed in metric.get('thresholds',{}).values())
    return {
        'version':1,'dateKst':'2026-10-30','scope':'LOCAL_10000_STORED_USERS_NOT_10000_CONCURRENT',
        'runId':folder.name,'status':'passed' if verification['loadExitCode']==0 and not thresholds_failed else 'failed',
        'population':{key:value for key,value in verification['populated'].items() if value},
        'activeLoginAccounts':10,'backgroundAccounts':9990,
        'backgroundPreparation':'Entity inserts; one random shared test-only background password hash. Not 10000 registration/login measurements.',
        'login':{'requests':10,'concurrent':False,'avgMs':login['avg'],'medianMs':login['med'],
                 'p95Ms':login['p(95)'],'minMs':login['min'],'maxMs':login['max']},
        'read':{'requests':metrics['read_requests']['count'],'errorRate':metrics['read_errors']['value'],
                'responseChecksPassed':metrics['checks']['passes'],'responseChecksFailed':metrics['checks']['fails'],
                'pacingSecondsPerUser':0.2,'stages':stages,'latencyReferenceP95Ms':500,'thresholdsPassed':not thresholds_failed},
        'authorization':{'anonymousStatus':verification['unauthenticatedStatus'],'nonMemberStatus':403,'nonMemberChecks':metrics['authorization_checks']['count']},
        'cleanup':{'applicationTableCount':len(verification['afterDelete']),'remainingApplicationRows':sum(verification['afterDelete'].values()),
                   'allApplicationTablesRestored':verification['allApplicationTablesRestored'],**cleanup},
        'businessRowCountsUnchangedDuringRead':verification['businessRowsUnchangedDuringRead'],
        'sampledContainerResourcesDuringLoad':sampled,
        'isolation':{'dockerContext':'desktop-linux','internalNetwork':True,'hostPortsPublished':False,
                      'existingLocalDatabaseRestarted':False,'productionConnectionUsed':False,
                      'externalProvidersMocked':True,'externalProviderNoInteractionsAssertionPassed':True},
        'runtimeLimits':{'applicationCpu':2,'applicationContainerMemoryMiB':1536,'javaHeapMaxMiB':768,
                         'databaseMemoryMiB':768,'loadGeneratorCpu':1,'loadGeneratorMemoryMiB':256},
        'sourceHashes':{name:hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in [
            'dataset-verification.json','dataset-cleanup.json','read-summary.json','dataset-resources.json','egress.txt','summary.txt']},
        'limitations':['One local execution; not production capacity or 10000 simultaneous users.',
                       '10 authenticated accounts query 3 shared jars and 120 notes; remaining 9990 accounts supply background data.',
                       'Stages run 1 then 5 then 10 users; JVM/cache warm-up and order can affect latency. No before/after improvement rate.',
                       'Artificial text dataset and mocked S3/AI/mail; browser rendering, real network/TLS and paid providers excluded.',
                       'Docker resource samples are observed samples, not guaranteed peak use or JVM heap measurements.']
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    report = summarize(args.folder)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=True,indent=2))
