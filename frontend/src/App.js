import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState("로딩중...");

  useEffect(() => {
    fetch("/health") // ✅ proxy 덕분에 자동으로 http://localhost:8080/health 로 감
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("연결 실패"));
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>프론트 ↔ 백엔드 연결 테스트 </h1>
      <p>서버 상태: {status}</p>
    </div>
  );
}

export default App;
