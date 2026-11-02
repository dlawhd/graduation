/** 문의 링크에는 민감한 쿼리를 복사하지 않고 허용한 화면 경로와 번호만 전달한다. */
export const SUPPORT_CATEGORIES={PHOTO_UPLOAD:"사진 업로드",AI_GENERATION:"AI 생성·결과 품질",THREE_D:"3D 표시",NOTES_CHAT:"쪽지·댓글·채팅",INVITE_ACCESS:"초대·권한",USAGE:"사용 방법",FEATURE_REQUEST:"기능 제안",OTHER:"기타",LOGIN_ACCOUNT:"로그인·계정"};
const positive=value=>/^\d+$/.test(String(value||"")) && Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null;
let lastFailure=null;
/** 내용·헤더·쿼리는 수집하지 않는다. 보낼 수 있는 오류 코드 한 건만 메모리에 잠시 보관한다. */
export function recordSupportFailure(error,location) {
  const status=error?.response?.status||0;
  if(error?.code==="ERR_CANCELED"||![0,400,404,409,413,415,422,429,500,502,503,504].includes(status))return;
  if(!supportContextFromLocation(location).contextPath)return;
  const url=error?.config?.url||"",jar=location.pathname?.match(/^\/jars\/(\d+)$/);
  const relevant=jar?new RegExp(`^/api/v1/jars/${jar[1]}(?:/|$)`).test(url)
    :location.pathname==="/jars"?url==="/api/v1/jars"
    :location.pathname==="/jars/design/new"?url.startsWith("/api/v1/design-drafts")
    :location.pathname==="/help"?url==="/api/v1/public/support/faq":url.startsWith("/api/v1/auth/");
  if(!relevant)return;
  const candidate=error?.response?.data?.error?.code;
  const errorCode=typeof candidate==="string"&&/^[A-Za-z0-9_:.\-]{1,80}$/.test(candidate)?candidate:status?`HTTP_${status}`:"NETWORK_ERROR";
  lastFailure={path:location.pathname,errorCode,occurredAt:new Date().toISOString(),recordedAt:Date.now()};
  if(typeof window!=="undefined"&&typeof window.dispatchEvent==="function")window.dispatchEvent(new Event("memoryjar:support-context"));
}
export function clearSupportFailure(){lastFailure=null;}
export function supportContextFromLocation(location) {
  const result={};const match=location.pathname?.match(/^\/jars\/(\d+)$/);
  if(match) result.jarId=positive(match[1]);
  if(location.pathname==="/jars/design/new") result.draftId=positive(new URLSearchParams(location.search).get("draft"));
  const allowed=new Set(["/","/jars","/jars/new","/jars/design/new","/help","/signup","/find-id","/find-password"]);
  if(match || allowed.has(location.pathname)) result.contextPath=location.pathname;
  return Object.fromEntries(Object.entries(result).filter(([,value])=>value!=null));
}
export function supportNewUrl(location) {
  const context=supportContextFromLocation(location);const params=new URLSearchParams();
  if(context.jarId) params.set("jarId",String(context.jarId));
  if(context.draftId) params.set("draftId",String(context.draftId));
  if(context.contextPath) params.set("from",context.contextPath);
  if(lastFailure?.path===location.pathname&&Date.now()-lastFailure.recordedAt<5*60000){params.set("errorCode",lastFailure.errorCode);params.set("occurredAt",lastFailure.occurredAt);}
  return "/support/new"+(params.size?"?"+params.toString():"");
}
export function supportContextFromSearch(search) {
  const q=new URLSearchParams(search);const jarId=positive(q.get("jarId")),draftId=positive(q.get("draftId"));
  const raw=q.get("from")||"";
  const safe=supportContextFromLocation({pathname:raw,search:""});
  const code=q.get("errorCode"),time=q.get("occurredAt");
  return {...safe,...(jarId?{jarId}:{}),...(draftId?{draftId}:{}),
    ...(/^[A-Za-z0-9_:.\-]{1,80}$/.test(code||"")?{errorCode:code}:{}),
    ...(time&&Number.isFinite(Date.parse(time))?{occurredAt:new Date(time).toISOString()}:{} )};
}
export const supportTitle=ticket=>ticket.title || (ticket.style ? "AI 생성 문의" : "문의")+" #"+ticket.inquiryId;
