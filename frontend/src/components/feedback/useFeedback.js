import { useCallback, useEffect, useState } from "react";

/** 성공은 잠깐 알리고 오류는 사용자가 확인할 때까지 유지한다. 이전 타이머는 새 안내를 지우지 않는다. */
export default function useFeedback() {
  const [feedback, setFeedback] = useState(null);
  const notify = useCallback((message, type = "error") => setFeedback({ message, type }), []);
  const dismiss = useCallback(() => setFeedback(null), []);
  useEffect(() => {
    if (feedback?.type !== "success") return undefined;
    const timer = window.setTimeout(dismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [feedback, dismiss]);
  return { feedback, notify, dismiss };
}
