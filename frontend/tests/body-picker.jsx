import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import "../src/index.css";
import JarBodyPicker from "../src/features/jarDesign/components/JarBodyPicker";

// 실제 선택 카드·미리보기·회전 조작을 로그인과 API 저장 없이 확인한다.
if(!import.meta.env.DEV)throw new Error("로컬 개발 전용 화면");
function Preview(){
  const [body,setBody]=useState("CORGI");
  return <main className="mx-auto max-w-6xl p-5"><h1 className="text-xl font-black">저금통 선택 · 큰 미리보기</h1><JarBodyPicker value={body} onChange={setBody} onContinue={()=>{}}/></main>;
}
const root=import.meta.hot?.data.root||createRoot(document.getElementById("root"));
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<Preview/>);
