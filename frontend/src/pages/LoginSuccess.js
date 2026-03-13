// src/pages/LoginSuccess.js
import { useEffect, useMemo, useState } from "react";
import apiClient, { fetchCsrf } from "../apiClient";
import "./auth.css";


export default function LoginSuccess() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const prettyError = useMemo(() => {
    if (!error) return "";
    return typeof error === "string" ? error : JSON.stringify(error, null, 2);
  }, [error]);

  const loadMe = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/me");
      setMe(res.data);
      setError("");
    } catch (e) {
      setMe(null);
      setError(e?.response?.data ?? e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
          try {
            // ✅ 로그아웃도 POST라 CSRF 헤더 필요
            // fetchCsrf()를 매번 호출할 필요는 없지만,
            // 혹시 토큰이 비어있을 때 대비해서 안전하게 한 번 더 해도 됨.
            if (!window.__csrfLoaded) {
              await fetchCsrf();
              window.__csrfLoaded = true;
            }

            await apiClient.post("/api/auth/logout");
          } finally {
            window.location.href = "/";
          }
        };

  useEffect(() => {
    const init = async () => {
      try {
        await fetchCsrf();
        await loadMe();
      } catch (e) {
        console.log("init failed:", e);
      }
    };

    init();
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <div className="success-header">
          <div>
            <h1 className="auth-title">로그인 성공 🎉</h1>
            <p className="auth-subtitle">/api/me 결과를 보기 좋게 보여줄게요</p>
          </div>

          <div className="actions">
            <button className="ghost-btn" onClick={loadMe} type="button">
              다시 불러오기
            </button>
            <button className="danger-btn" onClick={logout} type="button">
              로그아웃
            </button>
          </div>
        </div>

        {loading && (
          <div className="panel">
            <div className="spinner" />
            <p className="muted">불러오는 중...</p>
          </div>
        )}

        {!loading && error && (
          <div className="panel error">
            <p className="panel-title">에러 발생</p>
            <pre className="code">{prettyError}</pre>
          </div>
        )}

        {!loading && me && (
          <>
            <div className="panel">
              <div className="badge-row">
                <span className={`badge ${me.authenticated ? "ok" : "no"}`}>
                  {me.authenticated ? "authenticated: true" : "authenticated: false"}
                </span>
              </div>

              <div className="grid">
                <Field label="name" value={me.name} />
                <Field label="email" value={me.email} />
                <Field label="memberId" value={me.memberId} />
                <Field label="birthyear" value={me.birthyear} />
              </div>
            </div>

            <div className="panel">
              <p className="panel-title">원본 JSON</p>
              <pre className="code">{JSON.stringify(me, null, 2)}</pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">{value ?? "-"}</div>
    </div>
  );
}
