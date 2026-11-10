"""운영자 추가 인증의 독립 키를 로컬 비공개 파일로 만든다. 실제 값을 콘솔에 출력하거나 기존 키를 덮어쓰지 않는다."""
import argparse
import base64
import os
from pathlib import Path
import secrets
import subprocess


def write_private(path):
    """키 파일은 새로 만들기만 허용한다. Windows에서는 현재 사용자만 접근하도록 상속 권한을 제거한다."""
    path = path.resolve()
    root = Path(__file__).resolve().parents[2]
    allowed = (root / 'build').resolve()
    if allowed not in path.parents:
        raise ValueError('OUTPUT_MUST_BE_INSIDE_IGNORED_BUILD_DIRECTORY')
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        # 비밀값을 쓰기 전에 접근 권한을 먼저 확정한다.
        if os.name == 'nt':
            identity = subprocess.check_output(['whoami'], text=True).strip()
            result = subprocess.run(['icacls', str(path), '/inheritance:r', '/grant:r', identity + ':(F)'],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode:
                raise RuntimeError('PRIVATE_FILE_ACL_FAILED')
        with os.fdopen(descriptor, 'w', encoding='ascii') as output:
            descriptor = None
            output.write('APP_SUPPORT_MFA_ENCRYPTION_KEY=' + base64.b64encode(secrets.token_bytes(32)).decode() + '\n')
            output.write('APP_SUPPORT_MFA_BOOTSTRAP_SECRET=' + secrets.token_urlsafe(32) + '\n')
            output.flush()
            os.fsync(output.fileno())
    except Exception:
        if descriptor is not None:
            os.close(descriptor)
        path.unlink()
        raise
    return path


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default=str(Path(__file__).resolve().parents[2] / 'build/operator-mfa-private/runtime.env'))
    args = parser.parse_args()
    try:
        result = write_private(Path(args.output))
        print('Created private configuration: ' + str(result))
        print('Values were not printed. Keep the encryption key in a separate secure backup before deploying.')
    except FileExistsError:
        raise SystemExit('REFUSED_TO_OVERWRITE_EXISTING_KEY_FILE')
    except Exception as error:
        raise SystemExit(type(error).__name__ + ': CONFIGURATION_NOT_CREATED')
