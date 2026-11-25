import { useEffect, useRef, useState } from "react";
import { createEarlyDesignWriter } from "./earlyDesignWriter.mjs";
import { earlyDesignScope, readEarlyDesignDraft, writeEarlyDesignDraft } from "./earlyDesignDraftStore.mjs";

/** 1·2단계의 원본 작업을 계정·작업별로 저장한다. 화면 이탈 후에도 이미 시작한 저장은 마친다. */
export function useEarlyDesignDraft({ userId, id, initial, allowMissing, onRestore, onPromoted }) {
  const [ready, setReady] = useState(false), [status, setStatus] = useState("loading"), [error, setError] = useState("");
  const ctxRef = useRef(null), callbacks = useRef({ onRestore, onPromoted });
  callbacks.current = { onRestore, onPromoted };
  const scope = earlyDesignScope(userId, id);
  useEffect(() => {
    const ctx = { active: true, writer: null };
    ctxRef.current = ctx;
    setReady(false); setStatus("loading"); setError("");
    if (!scope) return () => { ctx.active = false; };
    readEarlyDesignDraft(userId, id).then(record => {
      if (!ctx.active) return;
      if (record?.serverDraftId) { callbacks.current.onPromoted(record.serverDraftId); return; }
      if (record?.cleared || (record && (!record.state || record.expiresAt <= Date.now())) || (!record && !allowMissing))
        throw new Error("이 계정으로 이 브라우저에 저장한 작업을 찾을 수 없어요. 작업이 삭제됐거나 보관 기간이 지났을 수 있어요. 새로 만들어 주세요.");
      ctx.writer = createEarlyDesignWriter({ initial: record?.state || initial, revision: record?.revision || 0,
        write: (value, revision, options) => writeEarlyDesignDraft(userId, id, value, revision, options),
        onStatus: (value, message) => { if (ctx.active) { setStatus(value); setError(message); } },
      });
      if (record?.state) callbacks.current.onRestore(ctx.writer.snapshot);
      setReady(true); setStatus(record ? "saved" : "ready");
    }).catch(failure => { if (ctx.active) { setStatus("error"); setError(failure.message || "초안을 읽지 못했어요."); } });
    function beforeUnload(event) {
      if (ctx.writer?.busy) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => { ctx.active = false; window.removeEventListener("beforeunload", beforeUnload); };
    // 작업 ID가 바뀌면 이전 계정/작업의 작성기와 로딩 응답을 함께 폐기한다.
  }, [scope]);
  return {
    ready, status, error,
    patch: change => ctxRef.current?.writer?.patch(change),
    retry: () => ctxRef.current?.writer?.retry().catch(() => {}),
    finish: serverId => ctxRef.current?.writer?.finish(serverId) || Promise.resolve(),
  };
}
