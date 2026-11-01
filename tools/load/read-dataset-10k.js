// 1만 계정이 저장된 격리 DB에서 1/5/10 VU의 텍스트 조회를 측정한다. 운영·이미지·AI·메일은 호출하지 않는다.
import http from 'k6/http';
import {check,sleep} from 'k6';
import {Counter,Rate,Trend} from 'k6/metrics';
import {ENDPOINTS,operation,validResponse} from './read-contract.mjs';
import {validateDataset,sessionIndex,DATASET_STAGES} from './read-dataset-10k-policy.mjs';

const baseUrl=__ENV.BASE_URL||'';
if(!__ENV.FIXTURE_PATH)throw new Error('LOCAL_FIXTURE_REQUIRED');
const fixture=JSON.parse(open(__ENV.FIXTURE_PATH));
validateDataset(fixture,baseUrl,__ENV.ISOLATED_K6==='1');
const readErrors=new Rate('read_errors'),readRequests=new Counter('read_requests');
const loginDuration=new Trend('login_duration_ms',true),loginRequests=new Counter('login_requests');
const authorizationChecks=new Counter('authorization_checks');
const thresholds={read_errors:[{threshold:'rate<0.01',abortOnFail:true,delayAbortEval:'10s'}],login_requests:['count==10'],authorization_checks:['count==1']};
DATASET_STAGES.forEach(stage=>ENDPOINTS.forEach(endpoint=>{
  thresholds['http_req_duration{phase:read,stage:'+stage.vus+',endpoint:'+endpoint+'}']=[{threshold:'p(95)<=500',abortOnFail:true,delayAbortEval:'10s'}];
  thresholds['read_requests{stage:'+stage.vus+',endpoint:'+endpoint+'}']=['count>0'];
}));
const scenarios={};
DATASET_STAGES.forEach(s=>{scenarios[s.name]={executor:'constant-vus',vus:s.vus,duration:s.duration,startTime:s.startTime,exec:s.exec,gracefulStop:'3s'};});
export const options={scenarios,thresholds,maxRedirects:0,setupTimeout:'90s'};

/** 인증 준비는 조회 지연 통계와 분리한다. 콘솔에 비밀값을 출력하지 않고, 실행기가 보관 요약의 setup 세션도 제거한다. */
export function setup(){
  return fixture.accounts.map((account,index)=>{
    const jar=new http.CookieJar();
    const params={jar,redirects:0,timeout:'5s',tags:{phase:'prepare',name:'prepare'}};
    const data=r=>{if(r.status!==200)throw new Error('DATASET_SETUP_HTTP_FAILED');return JSON.parse(r.body).data;};
    const csrf=data(http.get(baseUrl+'/api/v1/csrf',params));
    if(csrf.headerName!=='X-XSRF-TOKEN'||!csrf.token)throw new Error('DATASET_CSRF_FAILED');
    params.headers={'Content-Type':'application/json','X-XSRF-TOKEN':csrf.token};
    const response=http.post(baseUrl+'/api/v1/auth/login',JSON.stringify({loginId:account.loginId,password:account.password}),
      Object.assign({},params,{tags:{phase:'prepare',endpoint:'login',name:'login'}}));
    loginDuration.add(response.timings.duration);loginRequests.add(1);
    if(data(response).userId!==account.userId)throw new Error('DATASET_LOGIN_IDENTITY_FAILED');
    const access=jar.cookiesForURL(baseUrl+'/api/v1/me').accessToken;
    const token=access&&access[0];
    if(!token||Number(data(http.get(baseUrl+'/api/v1/me',params)).userId)!==account.userId)throw new Error('DATASET_SESSION_FAILED');
    const op={endpoint:'jar_list'};
    const listed=http.get(baseUrl+'/api/v1/jars?page=0&size=20',params);
    if(!validResponse(listed.status,listed.body,op,fixture,account.userId))throw new Error('DATASET_MEMBERSHIP_FAILED');
    if(index===0){
      const denied=http.get(baseUrl+'/api/v1/jars/'+fixture.dataset.forbiddenJarId,params);
      if(denied.status!==403)throw new Error('DATASET_MEMBER_AUTHORIZATION_FAILED');
      authorizationChecks.add(1);
    }
    return {userId:account.userId,token};
  });
}

function read(sessions,stage){
  const session=sessions[sessionIndex(__VU)];
  if(!session)throw new Error('DATASET_SESSION_MISSING');
  const op=operation(__ITER,__VU,fixture);
  const tags={phase:'read',stage:String(stage),endpoint:op.endpoint,name:op.endpoint};
  const response=http.get(baseUrl+op.path,{cookies:{accessToken:session.token},redirects:0,timeout:'3s',tags});
  const ok=validResponse(response.status,response.body,op,fixture,session.userId);
  check(response,{'status and fixture data match':()=>ok},tags);readErrors.add(!ok,tags);readRequests.add(1,tags);
  sleep(0.2);
}
export function readOne(sessions){read(sessions,1);}
export function readFive(sessions){read(sessions,5);}
export function readTen(sessions){read(sessions,10);}
