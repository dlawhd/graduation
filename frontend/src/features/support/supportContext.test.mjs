import test from 'node:test';
import assert from 'node:assert/strict';
import {supportContextFromLocation, supportContextFromSearch, supportNewUrl, recordSupportFailure, clearSupportFailure, SUPPORT_CATEGORIES} from './supportContext.mjs';

test('문의 화면 연결은 초대 토큰·쪽지 내용·임의 쿼리를 복사하지 않는다',()=>{
  const url=supportNewUrl({pathname:'/jars/112',search:'?invite=private&text=secret'});
  assert.equal(new URLSearchParams(url.split('?')[1]).get('jarId'),'112');
  assert.ok(!url.includes('private')&&!url.includes('secret'));
  assert.deepEqual(supportContextFromLocation({pathname:'/invite/private',search:''}),{});
  assert.deepEqual(supportContextFromLocation({pathname:'/jars/design/new',search:'?draft=12&token=secret'}),{draftId:12,contextPath:'/jars/design/new'});
});
test('문의 URL을 변조해도 허용 경로와 안전한 번호·코드만 선택한다',()=>{
  assert.deepEqual(supportContextFromSearch('?from=https://evil.example&jarId=-1&draftId=9007199254740992&errorCode=%3Cscript%3E&occurredAt=bad'),{});
  assert.deepEqual(supportContextFromSearch('?from=/jars/12&jarId=12'),{contextPath:'/jars/12',jarId:12});
  assert.equal(Object.keys(SUPPORT_CATEGORIES).length,9);
});
test('같은 화면의 관련 API 실패 코드만 잠시 연결하고 로그인 변경 때 지운다',()=>{
  clearSupportFailure();const location={pathname:'/jars/12',search:''};
  const failure={response:{status:503,data:{error:{code:'PROVIDER_BUSY',message:'private'}}},config:{url:'/api/v1/jars/12/design'}};
  recordSupportFailure(failure,location);
  let url=supportNewUrl(location);assert.ok(url.includes('PROVIDER_BUSY'));assert.ok(!url.includes('private'));
  assert.ok(!supportNewUrl({pathname:'/jars/13',search:''}).includes('PROVIDER_BUSY'));
  clearSupportFailure();recordSupportFailure({...failure,config:{url:'/api/v1/jars/13/design'}},location);
  assert.ok(!supportNewUrl(location).includes('errorCode'));
  for(const status of [401,403])recordSupportFailure({...failure,response:{status}},location);
  assert.ok(!supportNewUrl(location).includes('errorCode'));
  recordSupportFailure(failure,location);clearSupportFailure();assert.ok(!supportNewUrl(location).includes('errorCode'));
});
