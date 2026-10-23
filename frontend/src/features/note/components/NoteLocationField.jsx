import { useEffect, useId, useRef, useState } from "react";
import { loadKakaoMaps } from "../kakaoMaps";

/** 장소를 직접 적거나, 실제 지도 검색·클릭으로 고른 이름/주소를 기존 장소 문자열에 넣는다. */
export default function NoteLocationField({ value, onChange, disabled }) {
  const id = useId();
  const container = useRef(null), instance = useRef(null), searchVersion = useRef(0), pickVersion = useRef(0);
  const searchInFlight = useRef(false), searchTimer = useRef(null), pickTimer = useRef(null);
  const [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("loading"), [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState(""), [results, setResults] = useState([]), [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null), [resolving, setResolving] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let active = true, map, marker, clickListener, observer;
    setStatus("loading"); setMessage(""); setSelected(null); setResults([]); setSearching(false); setResolving(false);
    loadKakaoMaps().then(maps => {
      if (!active) return;
      map = new maps.Map(container.current, { center: new maps.LatLng(37.5445, 127.0374), level: 5 });
      marker = new maps.Marker();
      const geocoder = new maps.services.Geocoder();
      instance.current = { maps, map, marker, places: new maps.services.Places() };
      map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      // 늦게 도착한 주소가 더 최근에 선택한 장소를 덮어쓰지 않도록 요청 번호를 비교한다.
      clickListener = event => {
        const version = ++pickVersion.current;
        const point = event.latLng;
        marker.setPosition(point); marker.setMap(map); setSelected(null); setResolving(true);
        clearTimeout(pickTimer.current);
        pickTimer.current = window.setTimeout(() => {
          if (!active || version !== pickVersion.current) return;
          ++pickVersion.current; setResolving(false); setMessage("주소 확인이 늦어지고 있어요. 위치를 다시 고르거나 장소를 직접 적어 주세요.");
        }, 10000);
        geocoder.coord2Address(point.getLng(), point.getLat(), (rows, resultStatus) => {
          if (!active || version !== pickVersion.current) return;
          clearTimeout(pickTimer.current); setResolving(false); setMessage("");
          const address = resultStatus === maps.services.Status.OK && rows[0];
          const label = address?.road_address?.address_name || address?.address?.address_name;
          setSelected({ label: label || `선택한 위치 (${point.getLat().toFixed(5)}, ${point.getLng().toFixed(5)})` });
        });
      };
      maps.event.addListener(map, "click", clickListener);
      observer = new ResizeObserver(() => { const center = map.getCenter(); map.relayout(); map.setCenter(center); });
      observer.observe(container.current); setStatus("ready");
    }).catch(error => {
      if (!active) return;
      setStatus("error");
      setMessage(error.message === "MAP_NOT_CONFIGURED" ? "지도 선택을 준비하고 있어요. 지금은 장소를 직접 적어 주세요." : "지도를 불러오지 못했어요. 다시 시도하거나 장소를 직접 적어 주세요.");
    });
    return () => {
      active = false; ++searchVersion.current; ++pickVersion.current;
      searchInFlight.current = false; clearTimeout(searchTimer.current); clearTimeout(pickTimer.current);
      observer?.disconnect();
      if (map && clickListener) window.kakao.maps.event.removeListener(map, "click", clickListener);
      marker?.setMap(null); instance.current = null;
    };
  }, [open, attempt]);

  /** 타이핑마다 API를 부르지 않고 검색 버튼/Enter를 눌렀을 때만 조회한다. */
  function search(event) {
    event.preventDefault();
    if (!keyword.trim() || !instance.current || searchInFlight.current || disabled) return;
    searchInFlight.current = true;
    const version = ++searchVersion.current;
    const { maps, places } = instance.current;
    setSearching(true); setMessage(""); setResults([]);
    searchTimer.current = window.setTimeout(() => {
      if (version !== searchVersion.current || !instance.current) return;
      ++searchVersion.current; searchInFlight.current = false; setSearching(false); setMessage("검색이 늦어지고 있어요. 잠시 후 다시 검색해 주세요.");
    }, 10000);
    places.keywordSearch(keyword.trim(), (rows, resultStatus) => {
      if (version !== searchVersion.current || !instance.current) return;
      clearTimeout(searchTimer.current); searchInFlight.current = false; setSearching(false);
      if (resultStatus === maps.services.Status.OK) setResults(rows);
      else setMessage(resultStatus === maps.services.Status.ZERO_RESULT ? "검색 결과가 없어요. 다른 장소 이름으로 찾아보세요." : "장소를 찾지 못했어요. 잠시 후 다시 검색해 주세요.");
    }, { size: 5 });
  }
  function choose(place) {
    if (!instance.current || disabled) return;
    ++pickVersion.current; clearTimeout(pickTimer.current); setResolving(false); setMessage("");
    const { maps, map, marker } = instance.current;
    const point = new maps.LatLng(Number(place.y), Number(place.x));
    marker.setPosition(point); marker.setMap(map); map.setCenter(point); map.setLevel(3);
    setSelected({ label: `${place.place_name}${place.road_address_name || place.address_name ? ` · ${place.road_address_name || place.address_name}` : ""}` });
  }
  return <div className="note-location-field">
    <label htmlFor={id} className="note-field-label">장소 <span>(선택)</span></label>
    <div className="note-location-entry">
      <input id={id} type="text" value={value} onChange={event => onChange(event.target.value)} maxLength={100} disabled={disabled} placeholder="예: 서울숲" />
      <button type="button" className="note-map-trigger" aria-label="지도에서 장소 선택" aria-expanded={open} aria-controls={`${id}-map`} disabled={disabled} onClick={() => setOpen(current => !current)}>
        <svg viewBox="0 0 64 48" fill="none" aria-hidden="true"><rect width="64" height="48" rx="10" fill="#e7f1e9"/><path d="m0 34 64-22M18 0l14 48M49 0 34 48" stroke="#fffdf8" strokeWidth="8"/><path d="M39 18c0 6-7 12-7 12s-7-6-7-12a7 7 0 0 1 14 0Z" fill="#32624b"/><circle cx="32" cy="18" r="2.5" fill="white"/></svg>
        <span>지도</span>
      </button>
    </div>
    {open && <section id={`${id}-map`} className="note-map-panel" aria-label="지도 장소 선택">
      <div className="note-map-heading"><p>추억이 있는 곳을 골라요</p><button type="button" disabled={disabled} onClick={() => setOpen(false)}>접기</button></div>
      {status === "ready" && <form onSubmit={search} className="note-map-search"><label className="sr-only" htmlFor={`${id}-search`}>지도 장소 검색</label><input id={`${id}-search`} value={keyword} maxLength={100} disabled={disabled} onChange={event => setKeyword(event.target.value)} placeholder="장소 이름으로 검색"/><button type="submit" disabled={disabled || searching || !keyword.trim()}>{searching ? "검색 중…" : "검색"}</button></form>}
      {status === "loading" && <p role="status">지도를 불러오고 있어요…</p>}
      {message && <p role={status === "error" ? "alert" : "status"}>{message}</p>}
      {status === "error" && <button type="button" className="note-map-retry" onClick={() => setAttempt(current => current + 1)}>다시 시도</button>}
      <div ref={container} className="note-map-canvas" hidden={status !== "ready"} aria-label="장소 선택 지도" />
      {status === "ready" && <>
        <p className="note-map-hint">장소를 검색하거나 지도 위를 눌러 선택하세요.</p>
        <ul className="note-map-results">{results.map(place => <li key={place.id}><button type="button" disabled={disabled} onClick={() => choose(place)}><strong>{place.place_name}</strong><span>{place.road_address_name || place.address_name}</span></button></li>)}</ul>
        <div className="note-map-selection"><p role="status">{resolving ? "주소를 확인하고 있어요…" : selected?.label || "아직 선택한 장소가 없어요."}</p><button type="button" disabled={disabled || !selected || resolving} onClick={() => { onChange(selected.label.slice(0, 100)); setOpen(false); }}>이 장소 사용</button></div>
      </>}
    </section>}
  </div>;
}
