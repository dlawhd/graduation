import { Link, useLocation } from "react-router-dom";
import { supportCenterPaths } from "./supportCenter.mjs";
import "./supportLetter.css";
import "./supportCenter.css";

/** 사용자 도움말 및 문의의 제목과 이동 메뉴를 통일한다. 인증과 문의 처리는 각 화면에 남긴다. */
export default function SupportCenterLayout({ active, title, description, backTo = "/jars", backLabel = "내 저금통으로", action, children }) {
  const location = useLocation(), paths = supportCenterPaths(location.search);
  const tabs = [["help", "도움말"], ["new", "문의하기"], ["inquiries", "내 문의"], ["login", "로그인 문제 문의"]];
  return <div className="support-center"><main className="sc-main"><div className="sc-inner">
    <div className="sc-breadcrumb"><Link to={backTo}>← {backLabel}</Link><span>{active === "help" ? "도움말 및 문의" : `도움말 및 문의 / ${tabs.find(([key]) => key === active)?.[1] || "문의"}`}</span></div>
    <header className="sc-heading"><div><span className="sc-kicker">Memory Jar 도움말</span><h1>{title}</h1><p>{description}</p></div>{action}</header>
    <nav className="sc-section-nav" aria-label="도움말 메뉴">{tabs.map(([key, label]) => <Link key={key} to={paths[key]} aria-current={active === key ? "page" : undefined}>{label}</Link>)}</nav>
    {children}
  </div></main></div>;
}
