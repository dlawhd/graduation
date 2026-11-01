import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDataset,sessionIndex,DATASET_STAGES} from './read-dataset-10k-policy.mjs';

function fixture(){return {schema:1,scope:'isolated-local',runId:'lt1234abcd',pageSize:20,notesPerJar:40,
  accounts:Array.from({length:10},(_,i)=>({userId:i+1,loginId:'lt1234abcd'+i,password:'synthetic-fixture-only'})),
  jars:Array.from({length:3},(_,i)=>({jarId:i+1,ownerId:i+1,name:'lt1234abcd-jar-'+i,noteIds:Array.from({length:40},(_,n)=>i*40+n+1)})),
  dataset:{storedUsers:10000,activeAccounts:10,backgroundAccounts:9990,jars:9993,notes:10110,forbiddenJarId:9993}};}

test('1만 저장 계정과 10개 인증 계정의 격리 로컬 명세만 허용한다',()=>{
  assert.doesNotThrow(()=>validateDataset(fixture(),'http://app:8080',true));
  assert.doesNotThrow(()=>validateDataset(fixture(),'http://127.0.0.1:18080',false));
  for(const url of ['https://api.esjh.shop','http://52.78.116.71','http://app:8080/path','http://localhost:8080'])
    assert.throws(()=>validateDataset(fixture(),url,true));
  assert.throws(()=>validateDataset(fixture(),'http://app:8080',false));
});
test('다른 저장 수·공유 인증 계정·누락된 배경 데이터 명세는 거절한다',()=>{
  for(const key of ['storedUsers','activeAccounts','backgroundAccounts','jars','notes']){
    const value=fixture();value.dataset[key]++;assert.throws(()=>validateDataset(value,'http://app:8080',true));
  }
  const value=fixture();value.accounts[1]=value.accounts[0];
  assert.throws(()=>validateDataset(value,'http://app:8080',true));
  for(const id of [0,-1,1,NaN]){
    const invalid=fixture();invalid.dataset.forbiddenJarId=id;
    assert.throws(()=>validateDataset(invalid,'http://app:8080',true));
  }
});
test('최대 10 동시 VU에는 서로 다른 세션을 배정하고 세 단계가 겹치지 않는다',()=>{
  for(const start of [1,2,7,101])assert.equal(new Set(Array.from({length:10},(_,i)=>sessionIndex(start+i))).size,10);
  for(const vu of [0,-1,1.2,NaN])assert.throws(()=>sessionIndex(vu));
  assert.deepEqual(DATASET_STAGES.map(s=>s.vus),[1,5,10]);
  assert.ok(parseInt(DATASET_STAGES[0].duration)+3<parseInt(DATASET_STAGES[1].startTime));
  assert.ok(parseInt(DATASET_STAGES[1].startTime)+parseInt(DATASET_STAGES[1].duration)+3<parseInt(DATASET_STAGES[2].startTime));
});
