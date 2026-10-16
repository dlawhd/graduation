// 준비된 저금통의 앞뒤 곡면 사이에만 480px 기준 약 38px의 몸통 두께를 추가한다.
export const PREPARED_BODY_EXTRA_DEPTH = .16;

/** XY 실루엣/사진 UV/평평한 바닥은 유지하고 양쪽 면을 조금씩 벌려 실제 옆벽을 넓힌다.
 * 공통 geometry 생성기를 바꾸지 않아 사용자가 직접 만든 틀에는 영향을 주지 않는다. */
export function thickenPreparedBody(geometry) {
  const positions=geometry.attributes.position,half=PREPARED_BODY_EXTRA_DEPTH/2;
  for(let i=0;i<positions.count;i++) {
    const z=positions.getZ(i);
    positions.setZ(i,z+Math.sign(z)*half);
  }
  positions.needsUpdate=true;
  const photoHeight=geometry.userData.photoHeight;
  if(photoHeight)geometry.userData.photoHeight=point=>photoHeight(point)+half;
  // 입구의 표면 높이, 명암, 회전 시 잘림 검사도 변경된 실제 부피를 사용한다.
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}
