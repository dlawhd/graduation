import { useEffect, useState } from "react";
import apiClient from "../apiClient";

export default function LoginSuccess() {
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const loadMe = async () => {
    try {
      const res = await apiClient.get("/api/me");
      setMe(res.data);
      setError("");
    } catch (e) {
      setMe(null);
      setError(e?.response?.data ? JSON.stringify(e.response.data) : String(e));
    }
  };

  const logout = async () => {
    await apiClient.post("/api/logout");
    window.location.href = "/"; // ✅ 홈으로 이동
  };

  useEffect(() => {
    loadMe();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>로그인 성공 페이지</h1>

      <p>아래는 /api/me 결과예요.</p>

      {error && <pre style={{ color: "red" }}>{error}</pre>}
      {me && <pre>{JSON.stringify(me, null, 2)}</pre>}

      <div style={{ marginTop: 12 }}>
        <button onClick={loadMe}>/api/me 다시 호출</button>{" "}
        <button onClick={logout}>로그아웃</button>
      </div>
    </div>
  );
}
