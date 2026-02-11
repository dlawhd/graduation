// src/pages/Home.js
import "./auth.css";

export default function Home() {
  const BACKEND = process.env.REACT_APP_API_BASE_URL;

  const login = () => {
    if (!BACKEND) {
      alert("REACT_APP_API_BASE_URL 값이 비어있어요! .env를 확인해줘요.");
      return;
    }
    // ✅ 백엔드 oauth2 시작 URL로 이동
    window.location.href = `${BACKEND}/oauth2/authorization/naver`;
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">E</div>
          <div>
            <h1 className="auth-title">ESJH 로그인</h1>
            <p className="auth-subtitle">
              네이버로 3초만에 로그인하고 서비스를 이용해요
            </p>
          </div>
        </div>

        <button className="naver-btn" onClick={login} type="button">
          <span className="naver-icon">N</span>
          네이버로 로그인
        </button>

        <div className="auth-hint">
          <p className="auth-hint-title">🔒 안전 안내</p>
          <p className="auth-hint-text">
            로그인은 네이버 인증 페이지에서 진행되고, 인증이 끝나면 다시 돌아와요.
          </p>
        </div>

        <div className="auth-footer">
          <span className="dot" />{" "}
          <span className="muted">
            백엔드: {BACKEND ? BACKEND : "(설정 필요)"}
          </span>
        </div>
      </div>
    </div>
  );
}
