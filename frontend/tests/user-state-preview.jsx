import React,{useEffect} from "react";
import {createRoot} from "react-dom/client";
import {MemoryRouter,Route,Routes,Link} from "react-router-dom";
import "../src/index.css";
import apiClient from "../src/api/apiClient";
import {StompClientProvider,useStompClient} from "../src/realtime/StompClientProvider";
import {OnboardingProvider} from "../src/features/onboarding/OnboardingProvider";
import JarDetailPage from "../src/pages/JarDetailPage";
import JarsPage from "../src/pages/JarsPage";

/** 실제 화면을 합성 데이터·가짜 브로커로 검증한다. 알려지지 않은 API는 차단한다. */
if(!import.meta.env.DEV)throw new Error("로컬 시험 전용");
const params = new URLSearchParams(location.search);
const me={userId:1,name:"나"};
const jar={jarId:7,name:"나의 시험 저금통",description:"오픈 전 시험",theme:"SPRING",myRole:"OWNER",memberCount:2,maxMembers:5,
  openAt:"2099-01-01T00:00:00+09:00",openMode:"ALL_AT_ONCE",lockLevel:"HIDDEN",isOpen:params.has("opened"),createdAt:"2026-01-01T00:00:00+09:00"};
const pixel="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
// 썸네일과 원본을 구분하고, 가로 사진이 잘리지 않고 표시되는지도 검사한다.
const originalPhoto="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#d7e9df"/><circle cx="600" cy="340" r="180" fill="#ecaab9"/><text x="600" y="650" text-anchor="middle" font-size="64" fill="#115b48">Memory Jar · Original</text></svg>');
const notes=Array.from({length:11},(_,i)=>({noteId:i+1,title:`나의 추억 ${i+1}`,previewContent:"내가 남긴 본문",content:`내가 남긴 본문 ${i+1}`,
  authorId:1,authorName:"나",noteDate:"2026-11-01",location:"학교",tags:["추억"],attachments:[{id:i+1,url:originalPhoto,thumbnailUrl:pixel,contentType:"image/png",caption:"내 사진"}],commentCount:0}));
const chatMessages = Array.from({length:30}, (_, index) => ({
  messageId:index+1, senderId:2, senderName:"친구", type:"TEXT",
  content:`채팅 시험 메시지 ${index+1}`, createdAt:"2026-11-01T10:00:00+09:00", mine:false,
}));
const incomingChat = {...chatMessages[0], messageId:31, content:"새로 받은 채팅 시험 메시지"};
let firstChatRequestAt;
window.fixture={jar,notes,requests:[],removed:false,failMine:false,invites:[],pending:[],deferDetail:false};
apiClient.defaults.adapter=async config=>{
  const {url,params={}}=config;window.fixture.requests.push({url,params});let data;
  if(url==="/api/v1/me")data=me;
  else if(url==="/api/v1/me/onboarding")data={version:1,items:["WELCOME","JAR_LIST","JAR_CREATE","JAR_DETAIL","JAR_INVITE","DAILY_DRAW"].map(tutorialKey=>({tutorialKey,handled:true,status:"COMPLETED"}))};
  else if(url==="/api/v1/jars")data={items:window.fixture.removed?[]:[{...jar}],page:0,size:6,totalElements:window.fixture.removed?0:1,totalPages:1};
  else if(url==="/api/v1/jars/7")data={...jar};
  else if(url==="/api/v1/jars/7/members")data={items:[{userId:1,name:"나",role:"OWNER"},{userId:2,name:"친구",role:"MEMBER"}]};
  else if(url==="/api/v1/jars/7/invites")data={items:[...window.fixture.invites]};
  else if(url.endsWith("/chat/unread"))data={unreadCount:0};
  else if(url.endsWith("/chat/messages")) {
    firstChatRequestAt ??= Date.now();
    data={items:chatMessages,hasNext:false};
  } else if(url.endsWith("/chat/messages/new")) {
    const simulateArrival = new URLSearchParams(location.search).has("chat");
    const arrived = Date.now() - firstChatRequestAt >= 10000;
    data={items:simulateArrival && arrived && params.afterMessageId < incomingChat.messageId ? [incomingChat] : [],hasNext:false};
  } else if(url.endsWith("/csrf")) data={token:"fixture",headerName:"X-XSRF-TOKEN"};
  else if(url.endsWith("/chat/read")) data={unreadCount:0};
  else if(jar.isOpen && url==="/api/v1/jars/7/notes")data={items:[],page:0,totalElements:0,totalPages:0};
  else if(jar.isOpen && url.endsWith("/daily-draw/today"))data={hasTodayDraw:false};
  else if(jar.isOpen && url.endsWith("/daily-draw/history"))data={items:[],totalPages:0};
  else if(url==="/api/v1/jars/7/notes/mine"){
    if(window.fixture.failMine){window.fixture.failMine=false;const e=new Error("test");e.response={status:503,data:{error:{message:"내 목록 시험 오류"}},config};throw e;}
    const filtered=notes.filter(n=>n.title.includes(params.q||""));
    data={items:filtered.slice((params.page||0)*10,(params.page||0)*10+10),page:params.page||0,totalElements:filtered.length,totalPages:Math.ceil(filtered.length/10)};
  }else if(/^\/api\/v1\/jars\/7\/notes\/\d+$/.test(url)){
    data={...notes.find(n=>n.noteId===Number(url.split('/').at(-1)))};
    if(window.fixture.deferDetail)await new Promise(resolve=>window.fixture.pending.push(resolve));
  }else throw new Error(`로컬 시험에 없는 API 차단: ${url}`);
  return {data:{data},status:200,statusText:"OK",headers:{},config};
};
function Connection(){const {start,stop,connected}=useStompClient();useEffect(()=>{window.fixture.connected=connected;},[connected]);useEffect(()=>{start();return()=>stop({clearSubscriptions:true});},[start,stop]);return null;}
const entry=params.get("entry")||"/jars/7";
createRoot(document.getElementById("root")).render(<MemoryRouter initialEntries={[entry]}><StompClientProvider><Connection/>
  <OnboardingProvider userId={1} checkingAuth={false}><nav className="flex gap-5 p-4"><Link to="/jars">내 저금통 시험</Link><Link to="/jars/7">상세 시험</Link>
    {params.has("opening") && <button type="button" onClick={() => {
      jar.isOpen = true;
      window.dispatchEvent(new Event("focus"));
    }}>시험 저금통 열기</button>}</nav>
    <Routes><Route path="/jars" element={<JarsPage me={me}/>}/><Route path="/jars/:jarId" element={<JarDetailPage me={me}/>}/></Routes>
  </OnboardingProvider></StompClientProvider></MemoryRouter>);
