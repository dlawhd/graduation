"""격리 읽기 진단의 부하 도구 대조·DB 풀·GC·쿼리·JFR 결과를 집계한다. 토큰·본문·원문 SQL은 출력하지 않는다."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from datetime import datetime
from collections import defaultdict


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def percentile(values, p=0.95):
    if not values:
        return None
    values = sorted(values)
    pos = (len(values)-1)*p
    lower = int(pos)
    return values[lower] + (values[min(lower+1,len(values)-1)]-values[lower])*(pos-lower)


def stats(values):
    return {'count': len(values), 'avg': sum(values)/len(values) if values else None,
            'median': percentile(values,0.5), 'p95': percentile(values), 'max': max(values) if values else None}


def instant(value):
    return datetime.fromisoformat(value.replace('Z','+00:00'))


def sql_category(sql):
    sql = sql.lower()
    for name in ['note_reactions','note_comments','note_attachments','jar_open_events','jar_members','jar_designs','notes','jars','users']:
        if re.search(r'\b'+name+r'\b',sql):
            return name
    return 'other'


def phase_probe(folder, phase):
    path = folder/f'probe-{phase}.jsonl'
    rows = [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]
    first, last = rows[0], rows[-1]
    start = instant(first['observedAt'])
    samples = {}
    for row in rows:
        reads = row['resources']['loginDiagnostics']['reads']
        for sample in reads['recent']+reads['slow']:
            if instant(sample['startedAt']) >= start:
                samples[sample['diagnosticId']] = sample
    by_kind = defaultdict(list)
    for sample in samples.values():
        by_kind[sample['requestKind']].append(sample)
    per_kind = {}
    for kind, values in by_kind.items():
        db = lambda key,field: [v['database'].get(key,{}).get(field,0) for v in values]
        stage_names = set().union(*(v['stages'].keys() for v in values))
        per_kind[kind] = {'sampledRequests': len(values),
            'wallMs': stats([v['elapsedNanos']/1e6 for v in values]),
            'statementCounts': stats(db('STATEMENT_EXECUTE','count')),
            'connectionAcquireMs': stats([x/1e6 for x in db('CONNECTION_ACQUIRE','totalNanos')]),
            'statementExecuteMs': stats([x/1e6 for x in db('STATEMENT_EXECUTE','totalNanos')]),
            'stageMs': {stage: stats([v['stages'][stage]['elapsedNanos']/1e6 for v in values if stage in v['stages']]) for stage in sorted(stage_names)}}
    pools = [p for row in rows for p in row['resources']['pools'] if p['initialized']]
    a,b = first['hibernate'], last['hibernate']
    cpu_first,cpu_last = first['cgroupCpu'], last['cgroupCpu']
    delta = {key: cpu_last[key]-cpu_first[key] for key in cpu_last if key in cpu_first}
    elapsed = (instant(last['observedAt'])-start).total_seconds()
    periods = delta.get('nr_periods',0)
    active_delta = defaultdict(int)
    active_seconds = 0.0
    for previous, current in zip(rows, rows[1:]):
        active = current['resources']['loginDiagnostics']['reads']['completedCount'] > previous['resources']['loginDiagnostics']['reads']['completedCount']
        active = active or any(p['activeConnections'] for r in [previous,current] for p in r['resources']['pools'] if p['initialized'])
        if not active:
            continue
        active_seconds += (instant(current['observedAt'])-instant(previous['observedAt'])).total_seconds()
        for key,value in current['cgroupCpu'].items():
            active_delta[key] += value-previous['cgroupCpu'].get(key,value)
    gc_before, gc_after = first['resources']['gc'], last['resources']['gc']
    gc_old = {c['name']:c for c in gc_before['collectors']}
    before = load(folder/f'db-{phase}-before.json')
    after = load(folder/f'db-{phase}-after.json')
    old = {d['digest']:d for d in before['digests']}
    digests = []
    for row in after['digests']:
        previous = old.get(row['digest'],{})
        count = row['count']-previous.get('count',0)
        if count <= 0:
            continue
        duration = row['timerPs']-previous.get('timerPs',0)
        examined = row['rowsExamined']-previous.get('rowsExamined',0)
        digests.append({'digest': row['digest'], 'category': sql_category(row['sql']), 'executions': count,
            'totalMs': duration/1e9, 'avgMs': duration/1e9/count, 'rowsExaminedPerExecution': examined/count,
            'noIndexUsed': row['noIndex']-previous.get('noIndex',0), 'tmpDiskTables': row['tmpDisk']-previous.get('tmpDisk',0),
            'totalLockMs': (row['lockPs']-previous.get('lockPs',0))/1e9})
    old_status = {r['name']:int(r['value']) for r in before['status']}
    status_delta = {r['name']:int(r['value'])-old_status.get(r['name'],0) for r in after['status']}
    tomcat = [row['tomcat'] for row in rows if row['tomcat'].get('measurable')]
    return {'snapshots': len(rows), 'windowSeconds': elapsed,
        'pool': {'maxConnections': sorted(set(p['maxConnections'] for p in pools)),
            'maxActive': max(p['activeConnections'] for p in pools), 'maxPending': max(p['pendingRequests'] for p in pools)},
        'tomcat': {'measurable': bool(tomcat), 'maxActive': max(t['active'] for t in tomcat) if tomcat else None,
            'maxQueued': max(t['queued'] for t in tomcat) if tomcat else None,
            'maxThreads': sorted(set(t['maxThreads'] for t in tomcat))},
        'gcCollectionCountDelta': gc_after['totalCollectionCount']-gc_before['totalCollectionCount'],
        'gcCollectionTimeMillisDelta': gc_after['totalCollectionTimeMillis']-gc_before['totalCollectionTimeMillis'],
        'gcCollectorsDelta':{c['name']:{'count':c['collectionCount']-gc_old[c['name']]['collectionCount'],
            'timeMillis':c['collectionTimeMillis']-gc_old[c['name']]['collectionTimeMillis']} for c in gc_after['collectors']},
        'maxSampledHeapUsedPercent':max(row['resources']['heap']['usedPercent'] for row in rows),
        'cpuCountersDelta': delta, 'cpuThrottledPeriodPercent': delta.get('nr_throttled',0)*100/periods if periods else None,
        'averageCpuPercentInProbeWindow': delta.get('usage_usec',0)/1e6/elapsed*100,
        'activeIntervalSeconds':active_seconds,
        'activeIntervalAverageCpuPercent':active_delta['usage_usec']/1e6/active_seconds*100 if active_seconds else None,
        'activeIntervalThrottledPeriodsPercent':active_delta['nr_throttled']*100/active_delta['nr_periods'] if active_delta['nr_periods'] else None,
        'hibernateDelta': {key:b[key]-a[key] for key in a if key!='enabled'},
        'boundedRequestSampleCount': len(samples), 'requestSamplesByKind': per_kind,
        'sqlDigests': sorted(digests,key=lambda d:d['totalMs'],reverse=True), 'dbStatusDelta': status_delta,
        'jfr': load(folder/f'probe-{phase}-stacks.json')}


def summarize(folder):
    folder = folder.resolve()
    root = Path(__file__).resolve().parents[2]
    if folder.parent != (root/'build/isolated-e2e-results').resolve() or not re.fullmatch(r'memoryjar-e2e-[a-f0-9]{12}',folder.name):
        raise ValueError('Dedicated result folder required')
    trial = load(folder/'concurrent-load.json')
    cleanup = load(folder/'dataset-cleanup.json')
    verification = load(folder/'dataset-verification.json')
    if not (trial.get('diagnostic') or trial.get('profiling')) or not verification['allApplicationTablesRestored'] or any(verification['afterDelete'].values()):
        raise ValueError('Completed diagnostic and database cleanup required')
    if cleanup['remainingContainers'] or cleanup['remainingNetworks'] or not cleanup['privateFixtureRemoved'] or not cleanup['privateSessionsRemoved']:
        raise ValueError('Temporary resources or private sessions remain')
    results = []
    docker_samples=load(folder/'concurrent-resources.json')
    for phase in trial['phases']:
        if phase['targetVus']==0:
            continue
        name = phase['phase']
        raw = load(folder/f'{name}-summary.json')
        if set(raw) != {'metrics'}:
            raise ValueError('Private summary data retained')
        m=raw['metrics']
        generator=[x for x in docker_samples if x['phase']==name and x['container'].endswith('-'+name)]
        results.append({'phase':name, 'vus':phase['targetVus'], 'detailedMetrics':phase['detailedMetrics'],
            'generatorCpu':phase['generatorCpu'],'serverCpu':phase.get('serverCpu',2),'poolSize':phase.get('poolSize',10),
            'exitCode':phase['exitCode'], 'passed':phase['passed'],
            'maxSampledGeneratorCpuPercent':max(float(x['cpuPercent'].rstrip('%')) for x in generator) if generator else None,
            'readRequests':m['read_requests']['count'], 'readErrorRate':m['read_errors']['value'],
            'checksFailed':m['checks']['fails'], 'observedReadRate':m['read_requests']['rate'],
            'p95Ms':{e:m['http_req_duration{endpoint:'+e+'}']['p(95)'] for e in ['jar_list','jar_detail','note_list']},
            'clientTimingMs':{k:{'avg':m[k]['avg'],'p95':m[k]['p(95)'],'max':m[k]['max']} for k in
                ['http_req_blocked','http_req_connecting','http_req_sending','http_req_waiting','http_req_receiving']},
            'serverProbe':phase_probe(folder,name)})
    finished={p['phase'] for p in results}
    missing=[e['phase'] for e in trial['experiments'] if e['phase'] not in finished]
    artifact_names=['concurrent-load.json','concurrent-resources.json','dataset-cleanup.json','dataset-verification.json','egress.txt','summary.txt']
    for p in results:
        name=p['phase']
        artifact_names.extend([f'{name}-summary.json',f'probe-{name}.jsonl',f'probe-{name}-stacks.json',
            f'probe-{name}.jfr',f'db-{name}-before.json',f'db-{name}-after.json'])
    if (folder/'gc-cause-evidence.json').exists():
        artifact_names.append('gc-cause-evidence.json')
    if (folder/'service-class-hashes.json').exists():
        artifact_names.append('service-class-hashes.json')
    return {'version':1,'scope':('LOCAL_READ_FIXED_RESOURCE_PROFILE' if trial.get('profiling')
        else 'LOCAL_READ_CAUSE_DIAGNOSIS_NOT_CAPACITY_BENCHMARK'),'runId':folder.name,
        'collectionComplete':not missing and not (folder/'probe-error.json').exists(),'missingExperiments':missing,
        'loadExitCode':trial['exitCode'],
        'instrumentation':'Every tenth request uses read-stage timing; Hibernate statistics, MariaDB digest and 20ms JFR sampling stay enabled in every compared phase.',
        'allocationSampling':any(p['serverProbe']['jfr'].get('httpAllocationSamples',0)>0 for p in results),
        'experiments':trial['experiments'],'phases':results,'cleanup':cleanup,
        'serviceClassHashes':load(folder/'service-class-hashes.json') if (folder/'service-class-hashes.json').exists() else None,
        'remainingApplicationRows':sum(verification['afterDelete'].values()),
        'allApplicationTablesRestored':verification['allApplicationTablesRestored'],
        'gcCauseEvidence':load(folder/'gc-cause-evidence.json') if (folder/'gc-cause-evidence.json').exists() else None,
        'sourceHashes':{name:hashlib.sha256((folder/name).read_bytes()).hexdigest() for name in artifact_names},
        'limitations':['Bounded recent/slow request samples are selected subsets, not population latency distributions.',
            'JFR method sample counts are statistical observations; inclusive frames overlap and are not exact CPU percentages.',
            'JFR allocation weights are statistical estimates, not exact per-request bytes. Inclusive application frame weights overlap.',
            'Probe windows include initialization/drain. Concurrent wait totals and nested stage times must not be added to wall time.',
            'Diagnostics add overhead. These figures do not replace earlier uninstrumented results or production capacity measurements.']}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder',type=Path);parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args();report=summarize(args.folder)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'runId':report['runId'],'phases':[{k:p[k] for k in ['phase','readRequests','passed','p95Ms']} for p in report['phases']]}))
