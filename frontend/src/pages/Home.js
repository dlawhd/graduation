export default function Home() {
  const login = () => {
    // ✅ 백엔드 oauth2 시작 URL로 이동
    window.location.href = "http://localhost:8080/oauth2/authorization/naver";
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Home</h1>
      <button onClick={login}>네이버로 로그인</button>
    </div>
  );
}