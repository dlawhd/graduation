import { useEffect, useRef, useState } from "react";
import { getOperatorMfa, sendOperatorMfa } from "../../api/operatorMfaApi";
import { OPERATOR_MFA_REQUIRED_EVENT } from "../../api/operatorMfaEvents.mjs";
import { supportError } from "../../api/supportApi";
import SupportLetterLayout from "./SupportLetterLayout";

/** 운영 문의를 읽기 전에 인증 앱을 확인한다. 만료·계정 전환 시 자식 화면을 제거해 이전 문의와 사진을 남기지 않는다. */
export default function OperatorMfaGate({ userId, children }) {
  const [state, setState] = useState(null), [setup, setSetup] = useState(null);
  const [bootstrap, setBootstrap] = useState(""), [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false), [recoveryCodes, setRecoveryCodes] = useState([]);
  const [acknowledged, setAcknowledged] = useState(false), [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const scope = useRef(0), pending = useRef(false), request = useRef(null), peers = useRef(null);
  const expiry = Date.parse(state?.verifiedUntil || "");
  const unlocked = Number.isFinite(expiry) && expiry > Date.now() && (!recoveryCodes.length || acknowledged);

  useEffect(() => {
    const generation = ++scope.current;
    const controller = new AbortController(); request.current = controller;
    setState(null); setError("");
    getOperatorMfa({ signal: controller.signal }).then(data => {
      if (generation === scope.current && !controller.signal.aborted) setState(data);
    }).catch(e => { if (generation === scope.current && !controller.signal.aborted) setError(supportError(e)); });
    return () => { ++scope.current; controller.abort(); request.current?.abort(); };
  }, [userId]);

  useEffect(() => {
    const close = () => {
      // 진행 중이던 조회·변경이 인증 만료 뒤 돌아와 다시 화면을 열지 않게 요청 세대도 바꾼다.
      ++scope.current; request.current?.abort(); pending.current = false; setBusy(false);
      setState(previous => previous ? { ...previous, verifiedUntil: null } : previous);
      setCode(""); setSetup(null); setRecoveryCodes([]); setAcknowledged(false); setManaging(false);
    };
    window.addEventListener(OPERATOR_MFA_REQUIRED_EVENT, close);
    const timer = Number.isFinite(expiry) ? window.setTimeout(close, Math.max(1, expiry - Date.now())) : null;
    return () => { window.removeEventListener(OPERATOR_MFA_REQUIRED_EVENT, close); if (timer) clearTimeout(timer); };
  }, [expiry]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel("memoryjar-operator-mfa"); peers.current = channel;
    channel.onmessage = event => {
      if (event.data?.type === "locked" && event.data.userId === userId)
        window.dispatchEvent(new Event(OPERATOR_MFA_REQUIRED_EVENT));
    };
    return () => { peers.current = null; channel.close(); };
  }, [userId]);

  // 다른 탭의 잠금·로그아웃 이후 복귀했을 때도 화면에 남은 인증 상태를 그대로 믿지 않는다.
  useEffect(() => {
    const check = async () => {
      if (document.visibilityState !== "visible" || pending.current) return;
      const generation = scope.current, controller = new AbortController();
      request.current?.abort(); request.current = controller;
      try { const data = await getOperatorMfa({ signal: controller.signal });
        if (generation === scope.current && !controller.signal.aborted) setState(data);
      } catch (e) { if (generation === scope.current && !controller.signal.aborted) {
        setState(previous => previous ? { ...previous, verifiedUntil: null } : previous); setError(supportError(e));
      } }
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => { window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, []);

  async function run(action, data) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const generation = scope.current, controller = new AbortController();
    request.current?.abort(); request.current = controller;
    try {
      const result = action === "status" ? await getOperatorMfa({ signal: controller.signal })
        : await sendOperatorMfa(action, data, { signal: controller.signal });
      if (generation !== scope.current || controller.signal.aborted) return;
      setCode(""); setBootstrap("");
      if (action === "status") setState(result);
      else if (action === "enrollment") { setSetup(result); setRecovery(false); }
      else if (action === "lock") {
        setState(previous => ({ ...previous, verifiedUntil: null })); setManaging(false);
        // 기기 인증은 같은 로그인 탭들이 공유하므로 다른 탭의 문의 내용도 바로 숨긴다. 인증값은 전달하지 않는다.
        peers.current?.postMessage({ type: "locked", userId });
      }
      else {
        setSetup(null); setManaging(false); setRecovery(false);
        setState(previous => ({ ...previous, enrolled: true, verifiedUntil: result.verifiedUntil }));
        setRecoveryCodes(result.recoveryCodes || []); setAcknowledged(false);
      }
    } catch (e) { if (generation === scope.current && !controller.signal.aborted) { setCode(""); setError(supportError(e)); } }
    finally { if (generation === scope.current) { pending.current = false; setBusy(false); } }
  }

  const button = "support-letter-action", input = "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";
  if (unlocked && !managing) return <>
    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3 px-5 pt-5 text-sm">
      <span>운영자 추가 인증 완료 · 최대 15분</span>
      <button className={button} disabled={busy} onClick={() => { setCode(""); setManaging(true); }}>복구 코드 재발급</button>
      <button className={button} disabled={busy} onClick={() => run("lock")}>운영 문의함 잠그기</button>
    </div>{error && <p role="alert" className="p-4 text-center text-rose-700">{error}</p>}{children}
  </>;

  return <SupportLetterLayout backTo="/help" backLabel="도움말" title="운영자 추가 인증"
    description="문의 내용과 첨부사진을 보호하기 위해 이 기기의 인증 앱을 확인해 주세요." illustration={false}>
    <section className="support-letter-card mx-auto w-full min-w-0 max-w-xl space-y-5" aria-label="운영자 추가 인증">
      {error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-rose-800">{error}</p>}
      {!state ? <><p role="status">{error ? "인증 상태를 확인하지 못했어요." : "인증 상태를 확인하고 있어요."}</p>{error && <button className={button} disabled={busy} onClick={() => run("status")}>다시 확인</button>}</>
        : !state.configured ? <p role="alert">서버의 운영자 인증 키 설정이 필요합니다. 설정이 완료되기 전에는 문의 내용을 열 수 없습니다.</p>
        : recoveryCodes.length && !acknowledged ? <>
          <h2 className="text-lg font-bold">복구 코드를 안전한 곳에 보관해 주세요</h2>
          <p className="text-sm leading-6">인증 앱을 잃었을 때 사용할 일회용 코드예요. 이 목록은 다시 표시하지 않습니다. 화면 캡처를 문의나 채팅에 올리지 마세요.</p>
          <div className="grid gap-2 rounded-xl bg-slate-50 p-3 font-mono text-sm" aria-label="일회용 복구 코드">{recoveryCodes.map(item => <code className="break-all" key={item}>{item}</code>)}</div>
          <button className={`${button} is-primary`} onClick={() => { setAcknowledged(true); setRecoveryCodes([]); }}>안전한 곳에 보관했어요 · 문의함 열기</button>
        </> : <form className="space-y-5" onSubmit={event => {
          event.preventDefault();
          if (managing) run("recovery-codes", { code });
          else if (setup) run("confirmation", { code });
          else if (!state.enrolled) run("enrollment", { bootstrapCode: bootstrap });
          else run("verification", { code, recovery });
        }}>
          {!state.enrolled && !setup ? <>
            <h2 className="font-bold">인증 앱 최초 등록</h2>
            <p className="text-sm leading-6">서버 소유자에게 받은 최초 등록 코드를 입력해 주세요. 일반 로그인만으로 인증 앱을 등록할 수는 없어요.</p>
            {!state.bootstrapAvailable && <p role="alert">서버에 최초 등록 코드가 아직 설정되지 않았어요.</p>}
            <label className="block text-sm font-bold">최초 등록 코드<input className={input} type="password" required minLength={32} maxLength={256} autoComplete="off" value={bootstrap} onChange={e => setBootstrap(e.target.value)} disabled={busy}/></label>
          </> : <>
            {setup && <div className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm leading-6">
              <p>인증 앱에서 ‘계정 추가 → 설정 키 직접 입력’을 선택해 주세요. 유형은 ‘시간 기반’입니다. 등록은 5분 안에 완료해 주세요.</p>
              <p>서비스: {setup.issuer} / 계정: {setup.account}</p>
              <label className="block font-bold">설정 키<input className={`${input} font-mono text-xs`} aria-label="인증 앱 설정 키" readOnly value={setup.secret} autoComplete="off" spellCheck={false}/></label>
            </div>}
            <label className="block text-sm font-bold">{managing ? "새 복구 코드를 발급할 인증 앱 번호" : recovery ? "일회용 복구 코드" : "인증 앱의 6자리 번호"}
              <input className={input} type="text" required inputMode={recovery ? "text" : "numeric"} autoComplete={recovery ? "off" : "one-time-code"}
                pattern={recovery ? "[a-fA-F0-9]{32}" : "[0-9]{6}"} maxLength={recovery ? 32 : 6} value={code} disabled={busy}
                onChange={e => setCode(e.target.value.replace(recovery ? /[^a-fA-F0-9]/g : /\D/g, ""))}/>
            </label>
            <p className="text-sm text-slate-600">같은 번호는 한 번만 쓸 수 있어요. 사용한 번호라면 인증 앱의 다음 번호를 기다려 주세요.</p>
          </>}
          <button className={`${button} is-primary w-full`} disabled={busy || (!state.enrolled && !setup && !state.bootstrapAvailable)}>{busy ? "확인하고 있어요…" : !state.enrolled && !setup ? "인증 앱 등록 시작" : managing ? "복구 코드 새로 발급" : "추가 인증 확인"}</button>
          {state.enrolled && !managing && <button type="button" className={button} disabled={busy} onClick={() => { setRecovery(value => !value); setCode(""); }}>{recovery ? "인증 앱 번호로 확인" : "인증 앱을 사용할 수 없어요 · 복구 코드 사용"}</button>}
          {managing && <button type="button" className={button} disabled={busy} onClick={() => { setManaging(false); setCode(""); }}>문의함으로 돌아가기</button>}
          {setup && <button type="button" className={button} disabled={busy} onClick={() => { setSetup(null); setCode(""); }}>등록 다시 시작</button>}
        </form>}
    </section>
  </SupportLetterLayout>;
}
