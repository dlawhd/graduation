"""문의 첨부 경로에만 3MiB 프록시 한도를 추가한다. 기본 실행은 계획 확인이며 적용은 명시 옵션으로만 한다."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
import time

MARKER = '# memoryjar-support-attachments-v1'
INCLUDE = '/etc/nginx/snippets/memoryjar-support-attachments.conf'
BACKUP_ROOT = Path('/var/backups/memoryjar-support-uploads')


class ChangeError(RuntimeError):
    """설정 원문이나 서버 오류 대신 고정된 실패 코드만 전달한다."""


def digest(content):
    return hashlib.sha256(content).hexdigest()


def render(original):
    """기존 API 서버의 루트 프록시 앞에 첨부 전용 location을 연결한다. 기존 전달 설정은 변경하지 않는다."""
    names=re.findall(r'(?m)^[ \t]*server_name[ \t]+([^;\n]+);',original)
    if not any('api.esjh.shop' in entry.split() for entry in names):
        raise ChangeError('API_SERVER_NOT_FOUND')
    if MARKER in original:
        if original.count(MARKER) != 1 or original.count('include ' + INCLUDE + ';') != 1:
            raise ChangeError('MANAGED_INCLUDE_MISMATCH')
        return original
    locations = list(re.finditer(r'(?m)^([ \t]*)location\s+/\s*\{', original))
    if len(locations) != 1 or 'include ' + INCLUDE in original:
        raise ChangeError('AMBIGUOUS_ROOT_LOCATION')
    found = locations[0]
    indent = found.group(1)
    addition = indent + MARKER + '\n' + indent + 'include ' + INCLUDE + ';\n\n'
    return original[:found.start()] + addition + original[found.start():]


def checked(args):
    """설정 검사·reload의 출력에는 서버 정보가 섞일 수 있어 성공 여부만 확인한다."""
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    if result.returncode:
        raise ChangeError('NGINX_COMMAND_FAILED')


def replace(path, data, mode=0o644):
    """같은 디렉터리의 임시 파일을 교체해 부분 저장을 피한다."""
    descriptor, name = tempfile.mkstemp(prefix='.support-upload-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def apply(config, snippet, expected, command=checked):
    """검사한 파일만 백업 후 적용한다. 구문 검사나 reload가 실패하면 원본을 복구한다."""
    original = config.read_bytes()
    if digest(original) != expected:
        raise ChangeError('CONFIG_CHANGED_SINCE_REVIEW')
    updated = render(original.decode()).encode()
    target = Path(INCLUDE)
    old_snippet = target.read_bytes() if target.exists() else None
    if updated == original and old_snippet == snippet:
        return {'changed': False}
    command(['nginx', '-t'])
    backup = BACKUP_ROOT / (time.strftime('%Y%m%dT%H%M%S') + '-' + expected[:12])
    backup.mkdir(parents=True, mode=0o700, exist_ok=False)
    os.chmod(backup.parent, 0o700)
    shutil.copy2(config, backup / 'site.conf')
    if old_snippet is not None:
        (backup / 'snippet.conf').write_bytes(old_snippet)
    target.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(config.stat().st_mode)
    try:
        replace(target, snippet)
        replace(config, updated, mode)
        command(['nginx', '-t'])
        command(['systemctl', 'reload', 'nginx'])
    except Exception:
        replace(config, original, mode)
        if old_snippet is None:
            target.unlink(missing_ok=True)
        else:
            replace(target, old_snippet)
        command(['nginx', '-t'])
        command(['systemctl', 'reload', 'nginx'])
        raise ChangeError('APPLY_FAILED_ORIGINAL_RESTORED') from None
    return {'changed': True, 'beforeSha256': expected, 'afterSha256': digest(updated), 'backup': str(backup)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/nginx/sites-enabled/default')
    parser.add_argument('--snippet', required=True)
    parser.add_argument('--expected-sha256')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    config = Path(args.config).resolve()
    if config != Path('/etc/nginx/sites-available/default'):
        raise ChangeError('UNEXPECTED_CONFIG_PATH')
    original = config.read_bytes()
    updated = render(original.decode()).encode()
    snippet = Path(args.snippet).read_bytes()
    if args.apply:
        if os.geteuid() != 0 or not args.expected_sha256:
            raise ChangeError('ROOT_AND_REVIEWED_HASH_REQUIRED')
        result = apply(config, snippet, args.expected_sha256)
    else:
        result = {'apply': False, 'beforeSha256': digest(original), 'afterSha256': digest(updated),
                  'snippetSha256': digest(snippet), 'scope': 'support attachment requests only', 'limitMiB': 3}
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error) if isinstance(error, ChangeError) else 'UNEXPECTED_FAILURE_REDACTED'}))
        raise SystemExit(1)
