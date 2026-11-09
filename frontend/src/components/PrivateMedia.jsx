import { useRef, useState } from "react";
import { useRequestGate } from "../api/useRequestGate";
import { isProtectedMediaSource, recheckMediaSession } from "../api/privateMediaSession";

/** 비공개 사진·영상도 쿠키 만료 때 기존 로그인 갱신을 거쳐 한 번만 다시 읽는다. 공개·blob 주소는 그대로 표시한다. */
function PrivateMedia({ as: Tag, src, onError, onLoadedMetadata, ...props }) {
  const [retry, setRetry] = useState(null);
  const attempted = useRef(null);
  const playback = useRef(null);
  const gate = useRequestGate(src);
  const currentSource = retry?.source === src ? retry.url : src;

  async function failed(event) {
    if (!isProtectedMediaSource(src) || attempted.current === src) { onError?.(event); return; }
    attempted.current = src;
    const element = event.currentTarget;
    const stillCurrent = gate.begin();
    if (Tag === "video") playback.current = { source: src, time: element.currentTime, playing: !element.paused };
    try {
      await recheckMediaSession();
      if (!stillCurrent() || !element.isConnected) return;
      const url = new URL(src, window.location.origin);
      url.searchParams.set("media_retry", "1");
      setRetry({ source: src, url: url.href });
    } catch {
      // React 이벤트의 currentTarget은 await 뒤 사라지므로, 실패 안내에는 새 DOM 오류 이벤트를 전달한다.
      if (stillCurrent() && element.isConnected) element.dispatchEvent(new Event("error"));
    }
  }

  function metadataLoaded(event) {
    const element = event.currentTarget;
    const previous = playback.current;
    playback.current = null;
    if (previous?.source === src && Number.isFinite(previous.time) && previous.time > 0) {
      element.currentTime = Math.min(previous.time, element.duration || previous.time);
      if (previous.playing) element.play().catch(() => {});
    }
    onLoadedMetadata?.(event);
  }

  // React 19의 ref prop도 그대로 DOM에 전달해 기존 사진 확대·드래그 기능을 유지한다.
  return <Tag {...props} src={currentSource} onError={failed} onLoadedMetadata={metadataLoaded}/>;
}

export function PrivateImage(props) { return <PrivateMedia as="img" {...props}/>; }
export function PrivateVideo(props) { return <PrivateMedia as="video" {...props}/>; }
