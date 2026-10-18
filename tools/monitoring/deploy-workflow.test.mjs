// 실제 배포 실행 경로와 artifact/commit 연결이 workflow에서 우회되지 않는지 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const deploy = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const publish = fs.readFileSync(new URL('../../.github/workflows/publish-ghcr.yml', import.meta.url), 'utf8');
test('같은 workflow run의 artifact와 커밋 코드로만 배포한다', () => {
  assert.ok(deploy.includes('ref: ${{ github.event.workflow_run.head_sha }}'));
  assert.ok(deploy.includes('run-id: ${{ github.event.workflow_run.id }}'));
  assert.ok(deploy.includes('python3 tools/deploy/deploy-api.py'));
  assert.ok(deploy.includes('cancel-in-progress: false'));
  assert.ok(!deploy.includes('docker compose') && !deploy.includes('prune'));
});
test('생성 digest artifact와 이미지 revision 라벨을 남긴다', () => {
  assert.ok(publish.includes('id: image'));
  assert.ok(publish.includes('IMAGE_DIGEST: ${{ steps.image.outputs.digest }}'));
  assert.ok(publish.includes('org.opencontainers.image.revision=${{ github.sha }}'));
  assert.ok(publish.includes('deployment-manifest-${{ github.sha }}'));
  assert.ok(publish.includes("python3 -B -m unittest discover -s tools/deploy"));
});
