import { useEffect, useState } from "react";

/** 소셜 로그인 화면으로 이동 중인 버튼 상태를 관리한다. */
export function useOAuthRedirectState() {
  const [redirectingProvider, setRedirectingProvider] = useState(null);

  useEffect(() => {
    function handlePageShow(event) {
      // 뒤로가기로 복원된 화면에는 인증 화면으로 떠나기 직전의 로딩 상태가 남아 있다.
      if (event.persisted) {
        setRedirectingProvider(null);
      }
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return [redirectingProvider, setRedirectingProvider];
}
