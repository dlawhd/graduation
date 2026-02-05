import { useEffect, useState } from "react";
import apiClient from "./apiClient";

function App() {
  const [status, setStatus] = useState("로딩중...");

  useEffect(() => {
    apiClient
      .get("/health")
      .then((res) => {
        // 백엔드가 {"status":"very good!!!"} 이런 형태로 준다고 했지?
        setStatus(res.data.status);
      })
      .catch((err) => {
        console.error(err);
        setStatus("연결 실패");
      });
  }, []);

  return (
    <div>
      <h1>프론트 ↔ 백엔드 연결 테스트</h1>
      <p>서버 상태: {status}</p>
      <p>API: {process.env.REACT_APP_API_BASE_URL}</p>
    </div>
  );
}

export default App;
