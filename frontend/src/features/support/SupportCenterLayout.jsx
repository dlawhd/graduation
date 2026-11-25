import { Link, useLocation } from "react-router-dom";
import { supportCenterPaths } from "./supportCenter.mjs";
import "./supportLetter.css";
import "./supportCenter.css";

/** 사용자 도움말 및 문의의 제목과 이동 메뉴를 통일한다. 인증과 문의 처리는 각 화면에 남긴다. */
export default function SupportCenterLayout({ active, title, description, showLoginHelp, children }) {
  const location = useLocation(), paths = supportCenterPaths(location.search);
  const tabs = [["new", "문의하기"], ["inquiries", "내 문의"], ["help", "도움말"]];
  if (showLoginHelp) tabs.push(["login", "로그인 문제 문의"]);
  return <div className="support-center"><main className="sc-main"><div className="sc-inner">
    <header className="sc-heading"><h1>{title}</h1><p>{description}</p></header>
    <nav className="sc-section-nav" aria-label="도움말 메뉴">{tabs.map(([key, label]) => <Link key={key} to={paths[key]} aria-current={active === key ? "page" : undefined}>{label}</Link>)}</nav>
    {children}
  </div></main></div>;
}
