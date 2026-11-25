import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import apiClient, { ensureCsrf } from "../api/apiClient";
import { getAuthErrorMessage } from "../api/authApi";

const endpoint = "/api/v1/auth/operator-passkey";

/** 구글 로그인 후 운영자 패스키를 등록하거나 확인하는 화면이다. 생체 정보는 기기에서 처리한다. */
export default function OperatorPasskeyPage() {
  const [enrollment, setEnrollment] = useState(null);
  const [setupCode, setSetupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const ceremony = useRef(null);
  const supported = Boolean(globalThis.isSecureContext && globalThis.PublicKeyCredential?.parseCreationOptionsFromJSON
    && globalThis.PublicKeyCredential?.parseRequestOptionsFromJSON && globalThis.PublicKeyCredential?.prototype.toJSON);

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get(`${endpoint}/status`, { _skipAuthRefresh: true, signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setEnrollment(data.data.enrollment);
    }).catch(failure => {
      if (!controller.signal.aborted) {
        setExpired(true);
        setError(getAuthErrorMessage(failure, "구글 로그인부터 다시 시작해 주세요."));
      }
    });
    return () => {
      controller.abort();
      ceremony.current?.abort();
    };
  }, []);

  /** 요청 옵션과 브라우저 응답은 표준 변환 API를 사용해 바이너리 필드를 처리한다. */
  async function confirm(event) {
    event.preventDefault();
    if (ceremony.current || !supported || enrollment === null || expired) return;
    const controller = new AbortController();
    ceremony.current = controller;
    const config = { _skipAuthRefresh: true, signal: controller.signal };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await ensureCsrf();
      const { data } = await apiClient.post(`${endpoint}/options`, {
        ...(enrollment ? { setupCode: setupCode.trim() } : {}),
      }, config);
      const { publicKey } = JSON.parse(data.data.options);
      const credential = enrollment
        ? await navigator.credentials.create({
          publicKey: PublicKeyCredential.parseCreationOptionsFromJSON({ ...publicKey, hints: ["hybrid"] }),
          signal: controller.signal,
        })
        : await navigator.credentials.get({
          publicKey: PublicKeyCredential.parseRequestOptionsFromJSON({ ...publicKey, hints: ["hybrid"] }),
          signal: controller.signal,
        });
      if (!credential) return;
      const result = await apiClient.post(`${endpoint}/finish`, {
        credential: JSON.stringify(credential),
      }, config);
      if (result.data?.data?.authenticated) {
        window.location.replace("/login/success");
        return;
      }
      setEnrollment(false);
      setSetupCode("");
      setNotice("패스키가 등록됐어요. 등록한 패스키로 한 번 더 확인하면 로그인돼요.");
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure.response?.status === 401) setExpired(true);
      setError(failure.name === "NotAllowedError"
        ? "패스키 확인이 취소됐거나 시간이 지났어요. 다시 시도해 주세요."
        : getAuthErrorMessage(failure, "패스키를 확인하지 못했어요. 다시 시도해 주세요."));
    } finally {
      if (ceremony.current === controller) {
        ceremony.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }

  return (
    <main className="mx-auto my-12 max-w-lg rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-black text-slate-900">운영자 로그인 확인</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        휴대폰으로 확인하려면 브라우저에서 다른 기기를 선택하고 PC 화면에 뜨는 QR 코드를 스캔해 주세요.
      </p>
      {!supported && <p role="alert" className="mt-4 text-sm text-rose-700">패스키를 지원하는 최신 브라우저에서 다시 로그인해 주세요.</p>}
      {enrollment === null && !expired && <p role="status" className="mt-4 text-sm">로그인 요청을 확인하고 있어요.</p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-800">{notice}</p>}
      {supported && !expired && enrollment !== null && <form onSubmit={confirm} className="mt-5 space-y-3">
        {enrollment && <label className="block text-sm font-semibold text-slate-700">
          처음 등록할 때 받은 등록 코드
          <input type="password" autoComplete="off" maxLength={43} required value={setupCode}
            onChange={event => setSetupCode(event.target.value)} disabled={busy}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
        </label>}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-60">
          {busy ? "기기에서 확인하는 중이에요" : enrollment ? "패스키 등록하기" : "패스키로 확인하기"}
        </button>
      </form>}
      <Link to="/" className="mt-5 inline-block text-sm font-semibold text-emerald-800 underline">로그인 화면으로 돌아가기</Link>
    </main>
  );
}
