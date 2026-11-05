/** 도로명·지번 형태는 주소 검색을 먼저 사용한다. 애매한 문자열은 기존 상호명 검색부터 확인한다. */
export function looksLikeAddress(query) {
  return /(?:^|\s)[가-힣A-Za-z0-9·.]+(?:대로|로|길)\s*\d+(?:-\d+)?(?:\s|$)/.test(query)
    || /(?:^|\s)[가-힣0-9·.]+(?:동|읍|면|리|가)\s+(?:산\s*)?\d+(?:-\d+)?(?:\s|$)/.test(query);
}

/** 주소 결과와 상호명 결과가 같은 선택 목록·지도 표시를 사용하도록 필요한 값만 정리한다. */
export function normalizeAddressResults(response) {
  const rows = response?.v2?.addresses;
  if (!Array.isArray(rows)) throw new Error("ADDRESS_SEARCH_FAILED");
  const results = [], seen = new Set();
  for (const row of rows) {
    const road = typeof row?.roadAddress === "string" ? row.roadAddress.trim() : "";
    const parcel = typeof row?.jibunAddress === "string" ? row.jibunAddress.trim() : "";
    const address = road || parcel;
    const x = String(row?.x ?? ""), y = String(row?.y ?? "");
    if (!address || !/^-?\d+(?:\.\d+)?$/.test(x) || !/^-?\d+(?:\.\d+)?$/.test(y)) continue;
    const longitude = Number(x), latitude = Number(y);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) continue;
    const key = `${longitude}:${latitude}:${address}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ kind: "ADDRESS", name: address, address, latitude, longitude,
      secondaryAddress: road && parcel && road !== parcel ? parcel : "주소 검색 결과" });
    if (results.length === 5) break;
  }
  return results;
}

/** SDK 요청은 실제 취소할 수 없으므로 대기만 취소하고 늦은 콜백을 무시한다. 주소·외부 오류 원문은 기록하지 않는다. */
export function searchAddress(maps, query, signal, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false, timer;
    const finish = (complete, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      complete(value);
    };
    const abort = () => finish(reject, new DOMException("주소 검색을 취소했습니다.", "AbortError"));
    if (signal?.aborted) { abort(); return; }
    if (typeof maps?.Service?.geocode !== "function") {
      finish(reject, new Error("ADDRESS_SEARCH_FAILED")); return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => finish(reject, new Error("ADDRESS_SEARCH_TIMEOUT")), timeoutMs);
    try {
      maps.Service.geocode({ query }, (status, response) => {
        if (settled) return;
        if (status !== maps.Service.Status.OK) {
          finish(reject, new Error("ADDRESS_SEARCH_FAILED")); return;
        }
        try { finish(resolve, normalizeAddressResults(response)); }
        catch { finish(reject, new Error("ADDRESS_SEARCH_FAILED")); }
      });
    } catch {
      finish(reject, new Error("ADDRESS_SEARCH_FAILED"));
    }
  });
}

/** 주소 검색에는 확인되지 않은 상호명을 만들지 않고 주소 자체를 사용한다. */
export function placeSelectionLabel(place) {
  return place.kind === "ADDRESS" ? place.address : `${place.name}, ${place.address}`;
}
