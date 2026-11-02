import { Link, useLocation, useNavigate } from "react-router-dom";
import SupportComposer from "../features/support/SupportComposer";
import { supportContextFromSearch } from "../features/support/supportContext.mjs";

/** 로그인 사용자의 일반 문의 화면이다. 사진/저금통 번호는 필수가 아니며 문제 화면 정보도 제거할 수 있다. */
export default function SupportNewPage({me,checkingAuth}) {
  const navigate=useNavigate();const location=useLocation();const id=me?.userId??me?.id;
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-8"><Link to="/support/inquiries" className="text-sm font-bold text-emerald-700">← 내 문의</Link>
    <h1 className="text-2xl font-black">문의하기</h1>
    {checkingAuth?<p role="status">로그인 상태를 확인하고 있어요.</p>:!id?<section className="rounded-2xl bg-slate-50 p-6"><p>일반 문의는 로그인 후 접수할 수 있어요.</p><div className="mt-4 flex flex-wrap gap-4"><Link to="/" className="font-bold text-emerald-700 underline">로그인하기</Link><Link to="/support/login-help" className="font-bold text-emerald-700 underline">로그인이 안 되나요? 로그인 도움 문의</Link><Link to="/help" className="underline">자주 묻는 질문</Link></div></section>
    :<SupportComposer key={`${id}:${location.key}`} userId={id} context={supportContextFromSearch(location.search)} onCreated={ticket=>navigate(`/support/inquiries/${ticket.inquiryId}`)}/>}
  </main>;
}
