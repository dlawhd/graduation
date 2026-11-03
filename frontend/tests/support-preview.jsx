import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import "../src/index.css";
import apiClient from "../src/api/apiClient";
import { StompClientProvider } from "../src/realtime/StompClientProvider";
import AiCandidateGallery from "../src/features/jarDesign/components/AiCandidateGallery";
import SupportInquiriesPage from "../src/pages/SupportInquiriesPage";
import SupportNewPage from "../src/pages/SupportNewPage";
import SupportHelpPage from "../src/pages/SupportHelpPage";
import SupportLoginHelpPage from "../src/pages/SupportLoginHelpPage";

/** 실제 화면에 로컬 합성 데이터만 공급한다. 알려지지 않은 모든 요청을 차단하고 외부로 전송하지 않는다. */
if (!import.meta.env.DEV) throw new Error("로컬 검증에서만 실행할 수 있습니다.");
const operator = new URLSearchParams(location.search).get("role") === "operator";
const me = { userId: operator ? 9 : 1, name: "로컬 검증 사용자" };
const image = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" rx="30" fill="#ecf7f2"/><circle cx="240" cy="220" r="92" fill="#eebd8c"/><circle cx="207" cy="204" r="8" fill="#263e38"/><circle cx="273" cy="204" r="8" fill="#263e38"/><path d="M213 253Q240 278 267 253" fill="none" stroke="#263e38" stroke-width="7"/><path d="M100 430Q120 315 240 315T380 430" fill="#72aaa3"/></svg>');
const now = new Date().toISOString();
let failOnce = false, creates = 0, replies = 0;
const tickets = [];
const messages=[],attachments=[];
let guestActive=false;
window.fixture={requests:[],failUpload:false,deferCreate:false,pending:[],state:()=>({creates,replies,tickets,messages,attachments,guestActive})};
const draft = { draftId:44, status:"ACTIVE", selectedDesignType:"ORIGINAL", selectedGenerationId:null,
  generations:[{generationId:50,style:"CUTE_2D",status:"FAILED",errorCode:"PROVIDER_REQUEST_FAILED",completedAt:now}],
  bodyStyle:null, photoFrame:null, expiresAt:"2027-01-01T00:00:00" };
function reject(config, status, message) {
  const e = new Error(message); e.response = {status,data:{error:{message}},config}; throw e;
}
apiClient.defaults.adapter = async (config) => {
  const { url, method } = config;
  let data;
  window.fixture.requests.push({url,method,skipAuthRefresh:config._skipAuthRefresh===true});
  const input = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  const match = url.match(/\/inquiries\/(\d+)(?:\/(image|review|reply|view|messages|resolve|reopen|attachments))?$/);
  if (url.endsWith("/csrf")) data = { token:"fixture",headerName:"X-XSRF-TOKEN" };
  else if(url==='/api/v1/public/support/session'){if(method==='post')guestActive=true;data={active:guestActive};}
  else if(url==='/api/v1/public/support/faq')data=[{id:'photo',category:'PHOTO_UPLOAD',question:'사진은 어떻게 올리나요?',answer:'PNG, JPEG, WebP 사진을 선택해 주세요.'},{id:'login',category:'LOGIN_ACCOUNT',question:'로그인이 안 돼요',answer:'로그인 도움 문의를 이용해 주세요.'}];
  else if((url.endsWith('/inquiries/general')||url==='/api/v1/public/support/inquiries')&&method==='post'){
    creates++;data=tickets.find(t=>t.requestId===input.requestId);
    if(!data){data={...input,inquiryId:tickets.length+1,status:'OPEN',createdAt:now,contentExpiresAt:'2027-01-01T00:00:00',imageAvailable:false};tickets.push(data);}
    if(window.fixture.deferCreate)await new Promise(resolve=>window.fixture.pending.push(resolve));
  }
  else if (url === "/api/v1/support/permissions") data = { operator };
  else if (url === "/api/v1/design-drafts/44") data = draft;
  else if (url === "/api/v1/design-drafts/44/original/preview") data = { previewUrl:image };
  else if (url.endsWith("/for-draft/44")) data = tickets;
  else if (url === "/api/v1/support/inquiries" && method === "post") {
    creates++;
    if (failOnce) { failOnce=false; reject(config,503,"원본 사진을 보관하지 못해 문의가 접수되지 않았습니다. 잠시 후 다시 확인해 주세요."); }
    if (!input.shareOriginal) reject(config,400,"원본 공유 동의가 필요합니다.");
    data = tickets.find((t) => t.generationId === input.generationId);
    if (!data) { data = {inquiryId:1,generationId:input.generationId,draftId:44,style:"CUTE_2D",errorCode:"PROVIDER_REQUEST_FAILED",failedAt:now,description:input.description,status:"OPEN",createdAt:now,imageAvailable:true,imageExpiresAt:"2026-11-07T12:00:00",contentExpiresAt:"2027-01-07T12:00:00",model:"fixture-model",promptVersion:"fixture-version"}; tickets.push(data); }
  } else if (match) {
    if (url.includes("/admin/") && !operator) reject(config,403,"운영자만 이용할 수 있습니다.");
    const ticket = tickets.find((t) => t.inquiryId === Number(match[1]));
    if (!ticket) reject(config,404,"문의를 찾을 수 없습니다.");
    if(match[2]==='view')data={inquiry:{...ticket},messages:{items:messages.filter(m=>m.inquiryId===ticket.inquiryId),nextBefore:null},attachments:attachments.filter(a=>a.inquiryId===ticket.inquiryId)};
    else if(match[2]==='messages'&&method==='post'){
      replies++;data=messages.find(m=>m.requestId===input.requestId);
      if(!data){data={...input,messageId:messages.length+1,inquiryId:ticket.inquiryId,role:operator?'OPERATOR':'USER',createdAt:now};messages.push(data);}
      ticket.status=operator?(input.waitingForUser?'WAITING_USER':'ANSWERED'):'IN_PROGRESS';
    }
    else if(match[2]==='resolve'||match[2]==='reopen'){ticket.status=match[2]==='resolve'?'RESOLVED':'IN_PROGRESS';data={...ticket};}
    else if(match[2]==='attachments'&&method==='post'){
      if(window.fixture.failUpload){window.fixture.failUpload=false;
        if(window.fixture.failUploadStatus===413){const error=new Error('proxy body limit');error.response={status:413,data:'<html>413 Request Entity Too Large</html>',config};throw error;}
        reject(config,503,'시험 첨부 저장 실패');}
      data={attachmentId:attachments.length+1,inquiryId:ticket.inquiryId,status:'READY',expiresAt:'2027-01-01T00:00:00'};attachments.push(data);
    }
    else if (match[2] === "image") data = {previewUrl:image};
    else if (match[2] === "review") { ticket.status="IN_PROGRESS"; data={...ticket}; }
    else if (match[2] === "reply") { replies++; ticket.status="ANSWERED";ticket.reply=input.reply;ticket.repliedAt=new Date().toISOString();data={...ticket}; }
    else data = {...ticket};
  } else if (url === "/api/v1/support/inquiries" || url === "/api/v1/admin/support/inquiries" || url==='/api/v1/public/support/inquiries') {
    if (url.includes("/admin/") && !operator) reject(config,403,"운영자만 이용할 수 있습니다.");
    data = { items:tickets.filter(t=>!config.params?.status||t.status===config.params.status),nextBefore:null };
  } else throw new Error(`로컬에서 검증하지 않은 요청 차단: ${method} ${url}`);
  return {data:{data},status:200,statusText:"OK",headers:{},config};
};
function Preview() {
  const [snapshot,setSnapshot] = useState("");
  const [account,setAccount]=useState(me);window.fixture.switchUser=()=>setAccount({userId:2,name:'다른 계정'});
  const entry=new URLSearchParams(location.search).get('entry')||'/';
  return <MemoryRouter initialEntries={[entry]}><StompClientProvider>
    <header className="flex flex-wrap items-center gap-4 bg-white p-4 text-sm"><strong>문의함 로컬 검증 / 외부 요청 없음</strong><Link to="/">실패 후보</Link><Link to="/support/inquiries">내 문의</Link><Link to="/admin/support/inquiries">운영 문의함</Link><button onClick={()=>{failOnce=true;}}>다음 접수 실패</button><button onClick={()=>setSnapshot(`접수 요청 ${creates}회 / 저장된 문의 ${tickets.length}건 / 답변 ${replies}회`)}>요청 수 확인</button><span role="status">{snapshot}</span></header>
    <main className="mx-auto max-w-5xl px-3"><Routes>
      <Route path="/support/new" element={<SupportNewPage me={account} checkingAuth={false}/>} />
      <Route path="/help" element={<SupportHelpPage/>} />
      <Route path="/support/login-help" element={<SupportLoginHelpPage/>} />
      <Route path="/" element={<AiCandidateGallery draftId={44}/>} />
      <Route path="/support/inquiries" element={<SupportInquiriesPage me={me} checkingAuth={false}/>} />
      <Route path="/support/inquiries/:inquiryId" element={<SupportInquiriesPage me={me} checkingAuth={false}/>} />
      <Route path="/admin/support/inquiries" element={<SupportInquiriesPage me={me} checkingAuth={false} operator/>} />
      <Route path="/admin/support/inquiries/:inquiryId" element={<SupportInquiriesPage me={me} checkingAuth={false} operator/>} />
    </Routes></main>
  </StompClientProvider></MemoryRouter>;
}
createRoot(document.getElementById("root")).render(<Preview />);
