import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// 백업 내용을 출력하지 않고 폐기 가능한 로컬 MariaDB에 실제 복원한다.
// 운영 접속 정보는 사용하지 않으며 기존 컨테이너와 백업 파일은 변경하지 않는다.
const backup = resolve(process.argv[2] ?? '');
const fixtureFolder = process.argv[3] === '--check-read-fixture' && process.argv[4] ? resolve(process.argv[4]) : null;
const scaleFolder = process.argv[3] === '--check-scale-fixture' && process.argv[4] ? resolve(process.argv[4]) : null;
const container = `memoryjar-restore-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let created = false;
function docker(...args) {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).trim();
  } catch {
    // DB 오류에 SQL 원문이 포함될 수 있어 자식 프로세스의 원문 출력을 전달하지 않는다.
    throw new Error('Docker operation failed; no SQL or credential output was exposed.');
  }
}
const pause = ms => new Promise(done => setTimeout(done, ms));
try {
  if (!process.argv[2] || !backup.endsWith('.sql.gz')) throw new Error('Provide an appdb .sql.gz backup path.');
  if (docker('context', 'show') !== 'desktop-linux') throw new Error('Local desktop-linux context required.');
  docker('image', 'inspect', 'mariadb:10.11'); // 다운로드 없이 기존 이미지로만 실행한다.
  const expected = readFileSync(join(dirname(backup), 'SHA256SUMS'), 'utf8')
    .split(/\r?\n/).find(line => /^[a-f0-9]{64} [ *]appdb\.sql\.gz$/.test(line));
  if (!expected) throw new Error('Expected checksum entry not found.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(backup)) hash.update(chunk);
  if (hash.digest('hex') !== expected.slice(0, 64)) throw new Error('Backup checksum mismatch.');
  console.log('CHECKSUM: PASS');
  docker('create', '--name', container, '--label', 'memoryjar.backup-restore=temporary',
    '--network', 'none', '--memory', '512m', '--cpus', '1',
    '--tmpfs', '/var/lib/mysql:rw,size=256m',
    '-e', `MARIADB_ROOT_PASSWORD=${randomBytes(24).toString('hex')}`,
    '--health-cmd', 'healthcheck.sh --connect --innodb_initialized',
    '--health-interval', '2s', '--health-timeout', '3s', '--health-retries', '30',
    'mariadb:10.11', '--event-scheduler=OFF');
  created = true;
  docker('start', container);
  const deadline = Date.now() + 90000;
  while (docker('inspect', '--format', '{{.State.Health.Status}}', container) !== 'healthy') {
    if (Date.now() > deadline) throw new Error('Disposable database readiness deadline exceeded.');
    await pause(500);
  }
  if (docker('inspect', '--format', '{{.HostConfig.NetworkMode}}', container) !== 'none') throw new Error('Network guard failed.');
  // 파이프로만 SQL을 전달한다. 압축 해제한 개인정보 파일을 디스크에 남기지 않는다.
  const child = spawn('docker', ['exec', '-i', container, 'sh', '-c',
    'set +x; export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec mariadb -uroot'], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 });
  child.stdout.resume(); child.stderr.resume();
  const finished = new Promise((done, reject) => {
    child.on('error', () => reject(new Error('Restore process could not start.')));
    child.on('close', code => code === 0 ? done() : reject(new Error('SQL restore failed; SQL output suppressed.')));
  });
  // 한쪽 스트림 실패가 다른 프로세스를 계속 남기지 않도록 함께 처리한다.
  try { await Promise.all([pipeline(createReadStream(backup), createGunzip(), child.stdin), finished]); }
  catch { child.kill(); throw new Error('Restore failed; SQL output suppressed.'); }
  console.log('RESTORE: PASS');
  const query = sql => docker('exec', container, 'sh', '-c',
    'set +x; export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec mariadb -uroot --batch --skip-column-names -e "$1"', 'restore-check', sql);
  const tableCount = Number(query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='appdb' AND TABLE_TYPE='BASE TABLE'"));
  console.log('RESTORED TABLES:', tableCount);
  if (tableCount !== 25) throw new Error('Restored table count differs from the observed source count (25).');
  console.log('NON-INNODB TABLES:', query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='appdb' AND TABLE_TYPE='BASE TABLE' AND ENGINE <> 'InnoDB'"));
  const failedMigrations = Number(query('SELECT COUNT(*) FROM appdb.flyway_schema_history WHERE success=0'));
  console.log('FAILED MIGRATIONS:', failedMigrations);
  if (failedMigrations !== 0) throw new Error('Failed migration records found in backup.');
  console.log('LATEST MIGRATION:', query('SELECT version FROM appdb.flyway_schema_history WHERE success=1 AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1'));
  console.log('EVENT SCHEDULER:', query('SELECT @@event_scheduler'));
  // 데이터 행은 출력하지 않고 모든 테이블을 실제로 읽을 수 있는지만 확인한다.
  const tables = query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='appdb' AND TABLE_TYPE='BASE TABLE'").split('\n');
  let rows = 0;
  for (const table of tables) {
    if (!/^[A-Za-z0-9_]+$/.test(table.trim())) throw new Error('Unexpected table identifier.');
    rows += Number(query(`SELECT COUNT(*) FROM appdb.\`${table.trim()}\``));
  }
  console.log('ALL TABLES READABLE: PASS; combined row count:', rows);
  if (fixtureFolder) {
    // 복원한 폐기용 DB에서만 실제 운영 예정 SQL의 롤백·중복 거절·기존 행 보존을 확인한다.
    const output = execFileSync('python', ['-B', join(dirname(fileURLToPath(import.meta.url)), '../load/ec2-read-prep.py'),
      'local-check', '--folder', fixtureFolder, '--container', container, '--restored-backup-sha256', expected.slice(0, 64)],
      { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('READ FIXTURE SQL CHECK:', output.trim());
  }
  if (scaleFolder) {
    const output = execFileSync('python', ['-B', join(dirname(fileURLToPath(import.meta.url)), '../load/scale-read-prep.py'),
      'local-check', '--folder', scaleFolder, '--container', container, '--restored-backup-sha256', expected.slice(0, 64)],
      { encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('SCALE FIXTURE SQL CHECK:', output.trim());
  }
  console.log('Scope: appdb logical restore only; no S3 files, accounts/grants or server configuration.');
} catch (failure) {
  console.error('CHECK FAILED:', failure.message);
  process.exitCode = 1;
} finally {
  if (created) {
    try { docker('rm', '-f', container); console.log('TEMPORARY DATABASE REMOVED:', container); }
    catch { console.error('Cleanup requires attention for container:', container); process.exitCode = 1; }
  }
}
