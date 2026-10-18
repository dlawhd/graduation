"""검증한 커밋과 빌드 결과 digest만 배포 artifact에 남긴다. 인증정보는 읽거나 기록하지 않는다."""
import json
import os
import pathlib
import re


def manifest(repository, sha, digest):
    """GitHub 메타데이터도 검증해 명령·경로로 해석될 수 있는 입력은 거절한다."""
    if not re.fullmatch(r'[a-z0-9][a-z0-9_.-]*/[a-z0-9][a-z0-9_.-]*', repository or ''):
        raise ValueError('INVALID_REPOSITORY')
    if not re.fullmatch(r'[0-9a-f]{40}', sha or '') or not re.fullmatch(r'sha256:[0-9a-f]{64}', digest or ''):
        raise ValueError('INVALID_IMAGE_IDENTITY')
    return {'schema': 1, 'repository': repository, 'sha': sha, 'digest': digest}


if __name__ == '__main__':
    value = manifest(os.environ.get('GITHUB_REPOSITORY'), os.environ.get('GITHUB_SHA'), os.environ.get('IMAGE_DIGEST'))
    # 기존 산출물을 조용히 덮지 않는다.
    with pathlib.Path('deployment-manifest.json').open('x', encoding='utf-8') as stream:
        json.dump(value, stream)
