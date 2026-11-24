const DRAFTS_PER_PAGE = 2;
const time = row => typeof row.updatedAt === "number" ? row.updatedAt : Date.parse(row.updatedAt);

function pageResult(rows, page, totalElements, warning) {
  const start = page * DRAFTS_PER_PAGE;
  return {
    items: rows.slice(start, start + DRAFTS_PER_PAGE),
    page,
    totalPages: Math.ceil(totalElements / DRAFTS_PER_PAGE),
    hasNext: totalElements > start + DRAFTS_PER_PAGE,
    warning,
  };
}
export function compareDesignDrafts(a, b) {
  const difference = time(b) - time(a);
  if (difference) return difference;
  if (a.kind !== b.kind) return a.kind === "LOCAL" ? -1 : 1;
  return a.kind === "LOCAL" ? a.id.localeCompare(b.id) : Number(b.draftId) - Number(a.draftId);
}

/** 브라우저/서버 목록을 최근 수정순으로 합친다. 이미 읽은 서버 페이지는 다음 이동에서 재요청하지 않는다. */
export function createDesignDraftPager({ readLocal, listServer }) {
  let generation = 0, pages = [];
  return {
    reset() { generation += 1; pages = []; },
    async load(page = 0) {
      const current = generation;
      let warning = "", local;
      try { local = await readLocal(); }
      catch { local = []; warning = "이 브라우저의 작업을 읽지 못했어요. 저장 공간을 확인한 뒤 다시 불러와 주세요."; }
      let index = 0, server = [];
      while (true) {
        if (current !== generation) throw new Error("목록이 변경됐어요. 다시 조회해 주세요.");
        let result = pages[index];
        if (!result) {
          try { result = await listServer(index); }
          catch (error) {
            if (!local.length) throw error;
            page = Math.min(page, Math.ceil(local.length / DRAFTS_PER_PAGE) - 1);
            return pageResult(local, page, local.length, "서버 작업을 불러오지 못했어요. 이 브라우저에 저장한 작업을 먼저 보여드려요.");
          }
          if (current !== generation) throw new Error("목록이 변경됐어요. 다시 조회해 주세요.");
          pages[index] = result;
        }
        server.push(...result.items);
        const combined = [...local, ...server].sort(compareDesignDrafts);
        const hasTotal = Number.isSafeInteger(result.totalElements) && result.totalElements >= server.length;
        // 이전 API는 총수를 반환하지 않는다. 확인된 행과 다음 페이지의 존재 여부로 숫자를 표시한다.
        const total = hasTotal ? result.totalElements + local.length : combined.length + Number(result.hasNext);
        if (hasTotal || !result.hasNext) {
          page = Math.min(page, Math.max(0, Math.ceil(total / DRAFTS_PER_PAGE) - 1));
        }
        const end = (page + 1) * DRAFTS_PER_PAGE;
        // 아직 안 읽은 서버 행은 마지막 서버 행보다 오래됐다. 현재 페이지에 끼어들 수 없으면 중단한다.
        if (!result.hasNext || (combined.length >= end && server.length && compareDesignDrafts(server.at(-1), combined[end - 1]) >= 0))
          return pageResult(combined, page, total, warning);
        index += 1;
      }
    },
  };
}
