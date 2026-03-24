// src/pages/LoginSuccess.js
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { fetchCsrf } from "../api/apiClient";

export default function LoginSuccess() {
  const navigate = useNavigate();

  const [error, setError] = useState("");

  useEffect(() => {
    const init = async () => {
      try {
        // 앞으로 POST/PATCH/DELETE도 쓸 거라서
        // 로그인 성공 직후 CSRF를 한 번 받아두면 편해요.
        await fetchCsrf();

        // 내가 로그인된 상태인지 확인
        await apiClient.get("/api/v1/me");

        // 확인이 끝나면 저금통 목록으로 이동
        navigate("/jars", { replace: true });
      } catch (e) {
        const serverMessage =
          e?.response?.data?.error?.message ||
          e?.response?.data?.message ||
          e?.message ||
          "로그인 확인 중 문제가 생겼어요.";

        setError(serverMessage);
      }
    };

    init();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          {!error && (
            <>
              <h1 className="text-2xl font-bold text-slate-900">로그인 확인 중</h1>
              <p className="mt-3 text-sm text-slate-500">
                로그인 정보를 확인하고 저금통 목록으로 이동하고 있어요.
              </p>
            </>
          )}

          {error && (
            <>
              <h1 className="text-2xl font-bold text-red-600">확인이 필요해요</h1>
              <p className="mt-3 text-sm text-slate-600">{error}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}