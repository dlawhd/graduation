import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadNaverMaps } from "../naverMaps";
import { searchPlaces } from "../../../api/placeApi";
import { looksLikeAddress, searchAddress, placeSelectionLabel } from "../addressSearch.mjs";

/** 장소를 직접 적거나, 별도 지도 팝업에서 고른 이름/주소를 기존 장소 문자열에 넣는다. */
export default function NoteLocationField({ value, onChange, disabled }) {
  const id = useId();
  const inputRef = useRef(null), triggerRef = useRef(null), dialogRef = useRef(null), searchInputRef = useRef(null);
  const returnToInput = useRef(false), backdropPress = useRef(false), viewportRef = useRef(null);
  const container = useRef(null), instance = useRef(null), searchVersion = useRef(0), pickVersion = useRef(0);
  const resultMarkers = useRef([]);
  const searchInFlight = useRef(false), searchRequest = useRef(null), pickTimer = useRef(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("loading"), [message, setMessage] = useState("");
  const [keyword, setKeyword] = useState(""), [results, setResults] = useState([]), [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null), [resolving, setResolving] = useState(false);

  /** 검색을 바꾸거나 팝업을 닫을 때 지도 표시와 DOM 이벤트도 함께 제거한다. */
  function clearResultMarkers() {
    resultMarkers.current.forEach(({ marker, button, listener }) => {
      button.removeEventListener("click", listener);
      marker.setMap(null);
    });
    resultMarkers.current = [];
  }

  // 기존 선택 팝업처럼 native dialog를 사용해 뒤의 작성창 클릭과 키보드 초점 이동을 차단한다.
  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current, previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      const target = returnToInput.current ? inputRef.current : previousFocus;
      returnToInput.current = false;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open && status === "ready") searchInputRef.current?.focus();
  }, [open, status]);

  useEffect(() => {
    if (!open) return undefined;
    let active = true, map, marker, clickListener, observer, mapsApi, resizeFrame;
    let lastWidth = 0, lastHeight = 0;
    function releaseMap() {
      observer?.disconnect();
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      clearResultMarkers();
      if (clickListener) mapsApi.Event.removeListener(clickListener);
      clickListener = null;
      marker?.setMap(null); marker = null;
      map?.destroy(); map = null; instance.current = null;
    }
    setStatus("loading"); setMessage(""); setSelected(null); setResults([]); setSearching(false); setResolving(false);
    loadNaverMaps().then(maps => {
      if (!active) return;
      mapsApi = maps;
      // 숨겨진 요소의 크기로 초기화되지 않게 지도가 준비될 때 캔버스부터 표시한다.
      container.current.hidden = false;
      const viewport = viewportRef.current;
      lastWidth = viewport.clientWidth; lastHeight = viewport.clientHeight;
      map = new maps.Map(container.current, { center: new maps.LatLng(37.5445, 127.0374), zoom: 14,
        size: new maps.Size(lastWidth, lastHeight),
        zoomControl: true, zoomControlOptions: { position: maps.Position.TOP_RIGHT } });
      marker = new maps.Marker({ position: map.getCenter() });
      instance.current = { maps, map, marker };
      // 늦게 도착한 주소가 더 최근에 선택한 장소를 덮어쓰지 않도록 요청 번호를 비교한다.
      clickListener = maps.Event.addListener(map, "click", event => {
        if (!active || disabledRef.current) return;
        const version = ++pickVersion.current;
        const point = event.coord;
        marker.setPosition(point); marker.setMap(map); setSelected(null); setResolving(true); setMessage("");
        clearTimeout(pickTimer.current);
        pickTimer.current = window.setTimeout(() => {
          if (!active || version !== pickVersion.current) return;
          ++pickVersion.current; setResolving(false); setMessage("주소 확인이 늦어지고 있어요. 위치를 다시 고르거나 장소를 직접 적어 주세요.");
        }, 10000);
        maps.Service.reverseGeocode({ coords: point, orders: "addr,roadaddr" }, (resultStatus, response) => {
          if (!active || version !== pickVersion.current) return;
          clearTimeout(pickTimer.current); setResolving(false); setMessage("");
          const address = resultStatus === maps.Service.Status.OK && response?.v2?.address;
          const label = address?.roadAddress || address?.jibunAddress;
          if (!label) {
            setMessage("이 위치의 주소를 찾지 못했어요. 다른 위치를 고르거나 장소를 직접 적어 주세요.");
            return;
          }
          setSelected({ label });
        });
      });
      // SDK가 크기를 바꾸는 지도 자신이 아니라 별도 바깥 영역을 관찰한다.
      // 테두리를 뺀 clientWidth를 같은 요소에 반복 적용하면 지도가 조금씩 줄어드는 것을 막는다.
      observer = new ResizeObserver(() => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = null;
          if (!active || !map) return;
          const node = viewportRef.current;
          const width = node?.clientWidth, height = node?.clientHeight;
          if (!width || !height || (width === lastWidth && height === lastHeight)) return;
          lastWidth = width; lastHeight = height;
          const center = map.getCenter();
          map.setSize(new maps.Size(width, height)); map.setCenter(center);
        });
      });
      observer.observe(viewport); setStatus("ready");
    }).catch(error => {
      if (!active) return;
      releaseMap();
      setStatus("error");
      setMessage(error.message === "MAP_NOT_CONFIGURED" ? "지도 선택을 준비하고 있어요. 지금은 장소를 직접 적어 주세요." : "네이버 지도를 불러오지 못했어요. 다시 시도하거나 장소를 직접 적어 주세요.");
    });
    return () => {
      active = false; ++searchVersion.current; ++pickVersion.current;
      searchInFlight.current = false; searchRequest.current?.abort(); searchRequest.current = null; clearTimeout(pickTimer.current);
      releaseMap();
    };
  }, [open, attempt]);

  // 배경 지도의 글씨를 추측하지 않고, 검색 API가 반환한 최대 5개 장소에만 이름표를 만든다.
  useEffect(() => {
    clearResultMarkers();
    if (!open || status !== "ready" || !instance.current || !results.length) return undefined;
    const { maps, map } = instance.current;
    const points = [];
    results.slice(0, 5).forEach((place, index) => {
      const position = new maps.LatLng(place.latitude, place.longitude);
      const button = document.createElement("button");
      button.type = "button"; button.className = "note-map-place-marker";
      button.setAttribute("aria-label", `지도에서 ${place.name} 선택`);
      button.setAttribute("aria-pressed", "false"); button.title = placeSelectionLabel(place);
      const number = document.createElement("span"), name = document.createElement("span");
      number.className = "note-map-place-number"; number.textContent = String(index + 1);
      name.className = "note-map-place-name";
      // 상호명은 외부 입력이다. innerHTML에 넣지 않아 지도 안에서도 HTML로 실행되지 않게 한다.
      name.textContent = place.name; button.append(number, name);
      const listener = event => {
        event.preventDefault(); event.stopPropagation();
        choose(place);
      };
      button.addEventListener("click", listener);
      const marker = new maps.Marker({ map, position, title: place.name, clickable: true, zIndex: 1000 + index,
        icon: { content: button, anchor: new maps.Point(16, 46) } });
      resultMarkers.current.push({ marker, button, listener, place }); points.push(position);
    });
    map.fitBounds(points, { top: 54, right: 170, bottom: 32, left: 30, maxZoom: 16 });
    return clearResultMarkers;
  }, [open, status, results]);

  useEffect(() => {
    resultMarkers.current.forEach(({ button, place }) => {
      button.disabled = Boolean(disabled);
      button.setAttribute("aria-pressed", String(selected?.name === place.name && selected?.address === place.address));
    });
  }, [selected, results, disabled]);

  /** 타이핑마다 API를 부르지 않고 검색 버튼/Enter를 눌렀을 때만 조회한다. */
  async function search(event) {
    event.preventDefault();
    if (!keyword.trim() || !instance.current || searchInFlight.current || disabled) return;
    searchInFlight.current = true;
    const version = ++searchVersion.current;
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true); setMessage(""); setResults([]);
    try {
      const query = keyword.trim(), maps = instance.current.maps;
      const addressFirst = looksLikeAddress(query);
      let rows = addressFirst ? await searchAddress(maps, query, controller.signal)
        : await searchPlaces(query, controller.signal);
      if (version !== searchVersion.current || controller.signal.aborted || !instance.current) return;
      // 결과가 없을 때만 다른 방식을 한 번 확인한다. 인증·권한·쿼터 오류를 우회 재시도로 숨기지 않는다.
      if (!rows.length) {
        rows = addressFirst ? await searchPlaces(query, controller.signal)
          : await searchAddress(maps, query, controller.signal);
      }
      if (version !== searchVersion.current || !instance.current) return;
      setResults(rows);
      if (!rows.length) setMessage("검색 결과가 없어요. 다른 장소 이름이나 주소로 찾아보세요.");
    } catch (error) {
      if (version !== searchVersion.current || controller.signal.aborted || !instance.current) return;
      setMessage(error.response?.status === 429 ? "검색 요청이 많아요. 잠시 후 다시 검색해 주세요."
        : error.message === "ADDRESS_SEARCH_TIMEOUT" ? "주소 검색이 늦어지고 있어요. 잠시 후 다시 검색하거나 장소를 직접 적어 주세요."
        : error.message === "ADDRESS_SEARCH_FAILED" ? "주소를 찾지 못했어요. 잠시 후 다시 검색하거나 장소를 직접 적어 주세요."
        : "장소를 찾지 못했어요. 잠시 후 다시 검색하거나 장소를 직접 적어 주세요.");
    } finally {
      if (version === searchVersion.current) {
        searchInFlight.current = false; searchRequest.current = null; setSearching(false);
      }
    }
  }
  /** 검색어를 바꿨다면 이전 검색의 응답은 사용하지 않는다. 지도에서 고른 장소는 확인 전까지 보관한다. */
  function changeKeyword(event) {
    setKeyword(event.target.value); ++searchVersion.current;
    searchRequest.current?.abort(); searchRequest.current = null; searchInFlight.current = false;
    setSearching(false); setResults([]); setMessage("");
  }
  function choose(place) {
    // 지도 DOM 이벤트는 등록 당시의 props 대신 현재 비활성 상태를 읽는다.
    if (!instance.current || disabledRef.current) return;
    ++pickVersion.current; clearTimeout(pickTimer.current); setResolving(false); setMessage("");
    const { maps, map, marker } = instance.current;
    const point = new maps.LatLng(place.latitude, place.longitude);
    marker.setPosition(point); marker.setMap(map); map.setCenter(point); map.setZoom(16);
    setSelected({ label: placeSelectionLabel(place), name: place.name, address: place.address });
  }
  function close() { setOpen(false); }
  /** 마지막 버튼에서 Tab을 눌러도 작성창이나 브라우저 바깥으로 초점이 빠지지 않게 순환한다. */
  function handleDialogKey(event) {
    event.stopPropagation();
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current.querySelectorAll(
      'button:not(:disabled),input:not(:disabled),a[href],select:not(:disabled),[tabindex]'
    )).filter(node => !node.matches(":disabled") && node.tabIndex >= 0 && node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function outsideDialog(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  }
  const tooLong = (selected?.label.length || 0) > 100;
  return <div className="note-location-field">
    <label htmlFor={id} className="note-field-label">장소 <span>(선택)</span></label>
    <div className="note-location-entry">
      <input ref={inputRef} id={id} type="text" value={value} onChange={event => onChange(event.target.value)} maxLength={100} disabled={disabled} placeholder="예: 서울숲" />
      <button ref={triggerRef} type="button" className="note-map-trigger" aria-label="지도에서 장소 선택" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-map` : undefined} disabled={disabled} onClick={() => { setStatus("loading"); setSelected(null); setResults([]); setMessage(""); setOpen(true); }}>
        <svg viewBox="0 0 64 48" fill="none" aria-hidden="true"><rect width="64" height="48" rx="10" fill="#e7f1e9"/><path d="m0 34 64-22M18 0l14 48M49 0 34 48" stroke="#fffdf8" strokeWidth="8"/><path d="M39 18c0 6-7 12-7 12s-7-6-7-12a7 7 0 0 1 14 0Z" fill="#32624b"/><circle cx="32" cy="18" r="2.5" fill="white"/></svg>
        <span>지도</span>
      </button>
    </div>
    {open && createPortal(<dialog ref={dialogRef} id={`${id}-map`} className="note-map-dialog"
      aria-labelledby={`${id}-map-title`} aria-describedby={`${id}-map-description`}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
      onKeyDown={handleDialogKey}
      onPointerDown={event => { event.stopPropagation(); backdropPress.current = event.target === event.currentTarget && outsideDialog(event); }}
      onPointerCancel={() => { backdropPress.current = false; }}
      onClick={event => {
        event.stopPropagation();
        if (backdropPress.current && event.target === event.currentTarget && outsideDialog(event)) close();
        backdropPress.current = false;
      }}>
      <header className="note-map-header">
        <div><h2 id={`${id}-map-title`}>추억이 있는 곳을 골라요</h2>
          <p id={`${id}-map-description`}>상호명·주소를 검색하거나 지도 위를 눌러 선택하세요.</p></div>
        <button type="button" className="note-map-close" aria-label="장소 선택 닫기" onClick={close}>✕</button>
      </header>
      <div className="note-map-body">
        <div className="note-map-sidebar">
          {/* 작성창의 바깥 form과 중첩되지 않도록 검색 영역은 별도 form으로 만들지 않는다. */}
          <div role="search" className="note-map-search">
            <label className="sr-only" htmlFor={`${id}-search`}>지도 장소 검색</label>
            <input ref={searchInputRef} id={`${id}-search`} value={keyword} maxLength={100} disabled={disabled || status !== "ready"} onChange={changeKeyword}
              onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) search(event); }} placeholder="상호명 또는 주소 검색"/>
            <button type="button" onClick={search} disabled={disabled || status !== "ready" || searching || !keyword.trim()}>{searching ? "검색 중…" : "검색"}</button>
          </div>
          {status === "ready" && message && <p className="note-map-message" role="status">{message}</p>}
          {results.length > 0 && <p className="note-map-hint">지도 위 이름·주소 표시를 눌러서도 선택할 수 있어요.</p>}
          <ul className="note-map-results" aria-label="장소 검색 결과">{results.map((place, index) => <li key={`${place.latitude}:${place.longitude}:${index}`}>
            <button type="button" disabled={disabled} aria-pressed={selected?.name === place.name && selected?.address === place.address} onClick={() => choose(place)}>
              <strong>{place.name}</strong><span>{place.secondaryAddress || place.address}</span>
            </button></li>)}</ul>
          {!results.length && !message && status === "ready" && <p className="note-map-hint">가게·공원 이름이나 도로명·지번 주소로 검색해 보세요. 지도에서 직접 위치를 골라도 돼요.</p>}
        </div>
        <div ref={viewportRef} className="note-map-viewport">
          <div ref={container} className="note-map-canvas" hidden={status !== "ready"} aria-label="장소 선택 지도" />
          {status === "loading" && <div className="note-map-status" role="status">네이버 지도를 불러오고 있어요…</div>}
          {status === "error" && <div className="note-map-status"><p role="alert">{message}</p>
            <button type="button" className="note-map-retry" onClick={() => setAttempt(current => current + 1)}>다시 시도</button></div>}
        </div>
      </div>
      <footer className="note-map-footer">
        <div className="note-map-selection">
          <span className="note-map-selection-label">선택한 장소</span>
          <p role="status">{resolving ? "주소를 확인하고 있어요…" : selected?.label || "아직 선택한 장소가 없어요."}</p>
          <p className="note-map-hint">‘이 장소 사용’을 눌러야 장소 칸에 입력돼요.</p>
          {tooLong && <p className="note-map-message" role="status">장소가 100자를 넘어요. 장소 칸에 필요한 이름과 주소를 직접 적어 주세요.</p>}
        </div>
        <div className="note-map-actions">
          <button type="button" className="note-map-cancel" onClick={close}>취소</button>
          <button type="button" className="note-map-confirm" disabled={disabled || !selected || resolving || tooLong || status !== "ready"}
            onClick={() => { onChange(selected.label); returnToInput.current = true; close(); }}>이 장소 사용</button>
        </div>
      </footer>
    </dialog>, document.body)}
  </div>;
}
