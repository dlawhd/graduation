import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listJarDesignDrafts } from "../../../api/jarDesignDraftApi";

/** 보관함에서는 초안의 존재만 확인한다. 실패해도 저금통 목록 이용을 막지 않는다. */
export default function DesignDraftResumePrompt({ userId }) {
  const [owner, setOwner] = useState(null);
  useEffect(() => {
    let current = true;
    setOwner(null);
    if (userId) listJarDesignDrafts(0).then(result => {
      if (current && result.items?.length) setOwner(userId);
    }).catch(() => {});
    return () => { current = false; };
  }, [userId]);
  if (!userId || owner !== userId) return null;
  return <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm">
    <p className="font-bold text-emerald-950">만들고 있던 저금통이 있어요.</p>
    <p className="mt-1 text-slate-600">저장한 작업을 이어서 완성해 보세요.</p>
    <Link to="/jars/new#design-drafts" className="mt-2 inline-flex min-h-11 items-center font-bold text-emerald-800 underline underline-offset-4">내 작업 이어 만들기</Link>
  </div>;
}
