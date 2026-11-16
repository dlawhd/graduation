import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";
import StatusNotice from "../components/feedback/StatusNotice";

const providers = [["naver", "네이버"], ["google", "Google"], ["kakao", "카카오"]];
const endpoint = "/api/v1/me/social-connections";

/** 기존 계정을 열어 둔 상태에서 소셜 로그인 수단을 추가하는 화면이다. */
export default function SocialConnectionsPage({ userId, checkingAuth }) {
  const [params] = useSearchParams();
  const [connected, setConnected] = useState(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [retry, setRetry] = useState(0);
  const active = useRef(true);
  const redirecting = useRef(false);

  useEffect(() => {
    if (!userId || checkingAuth) return;
    active.current = true;
    const controller = new AbortController();
    setConnected(null);
    setError("");
    apiClient.get(endpoint, { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data?.data)) throw new Error("Invalid connection list");
        setConnected(data.data);
      })
      .catch(() => { if (!controller.signal.aborted) setError("연결 목록을 불러오지 못했어요."); });
    return () => { active.current = false; controller.abort(); };
  }, [userId, checkingAuth, retry]);

  async function connect(provider) {
    if (redirecting.current) return;
    redirecting.current = true;
    setPending(provider);
    setError("");
    try {
      await fetchCsrf();
      if (!active.current) return;
      const response = await apiClient.post(`${endpoint}/${provider}`);
      const path = response.data?.data?.path;
      if (!active.current) return;
      const prefix = `/oauth2/authorization/${provider}?link=`;
      if (!path?.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(path.slice(prefix.length))) {
        throw new Error("Invalid connection route");
      }
      const apiOrigin = new URL(import.meta.env.VITE_API_BASE_URL || "/", window.location.origin);
      window.location.assign(new URL(path, apiOrigin));
    } catch {
      redirecting.current = false;
      if (active.current) {
        setPending("");
        setError("연결을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  return <section className="mx-auto max-w-2xl space-y-5 px-5 py-10">
    <h1 className="text-2xl font-black text-slate-900">로그인 수단 연결</h1>
    {checkingAuth ? <StatusNotice type="loading">로그인 상태를 확인하고 있어요.</StatusNotice>
      : !userId ? <StatusNotice>기존 계정으로 <Link className="font-bold underline" to="/">로그인</Link>해 주세요.</StatusNotice>
      : <>
        <p className="text-sm leading-6 text-slate-600">같은 이메일의 로그인 수단을 연결하면 어느 방법으로 로그인해도 같은 저금통을 볼 수 있어요.</p>
        {params.get("result") === "linked" && <StatusNotice>로그인 수단을 연결했어요.</StatusNotice>}
        {params.get("result") === "failed" && <StatusNotice type="error">연결하지 못했어요. 현재 계정과 이메일이 같은지 확인한 뒤 다시 시도해 주세요.</StatusNotice>}
        {error && <StatusNotice type="error" onRetry={!connected ? () => setRetry(n => n + 1) : undefined}>{error}</StatusNotice>}
        {!connected && !error && <StatusNotice type="loading">연결 목록을 불러오고 있어요.</StatusNotice>}
        {connected && <ul className="divide-y rounded-2xl border border-slate-200 bg-white px-4">
          {providers.map(([id, name]) => <li key={id} className="flex items-center justify-between gap-3 py-3">
            <span className="font-bold text-slate-900">{name}</span>
            {connected.includes(id.toUpperCase()) ? <span className="text-sm text-emerald-800">연결됨</span>
              : <button type="button" disabled={Boolean(pending)} onClick={() => connect(id)}
                  className="min-h-11 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-60">
                  {pending === id ? "연결 준비 중…" : `${name} 연결`}
                </button>}
          </li>)}
        </ul>}
      </>}
  </section>;
}
