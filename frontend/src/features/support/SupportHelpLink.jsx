import { Link, useLocation } from "react-router-dom";
import { supportNewUrl } from "./supportContext.mjs";
import { useEffect, useState } from "react";

/** 현재 화면에서 도움말을 열 때 허용된 저금통/디자인 번호만 함께 연결한다. */
export default function SupportHelpLink({children="도움말·문의",...props}) {
  const [,refresh]=useState(0);
  useEffect(()=>{const update=()=>refresh(n=>n+1);window.addEventListener("memoryjar:support-context",update);return()=>window.removeEventListener("memoryjar:support-context",update);},[]);
  const location=useLocation();return <Link to={supportNewUrl(location).replace("/support/new","/help")} {...props}>{children}</Link>;
}
