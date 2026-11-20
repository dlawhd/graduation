const time = row => typeof row.updatedAt === "number" ? row.updatedAt : Date.parse(row.updatedAt);
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
      const end = (page + 1) * 2;
      let index = 0, server = [], hasNext = true;
      while (hasNext) {
        if (current !== generation) throw new Error("목록이 변경됐어요. 다시 조회해 주세요.");
        let result = pages[index];
        if (!result) {
          try { result = await listServer(index); }
          catch (error) {
            if (!local.length) throw error;
            const items = local.slice(page * 2, end);
            return { items, page, hasNext: local.length > end, warning: "서버 작업을 불러오지 못했어요. 이 브라우저에 저장한 작업을 먼저 보여드려요." };
          }
          if (current !== generation) throw new Error("목록이 변경됐어요. 다시 조회해 주세요.");
          pages[index] = result;
        }
        server.push(...result.items); hasNext = result.hasNext;
        const combined = [...local, ...server].sort(compareDesignDrafts);
        // 아직 안 읽은 서버 행은 마지막 서버 행보다 오래됐다. 현재 페이지에 끼어들 수 없으면 중단한다.
        if (!hasNext || (combined.length >= end && server.length && compareDesignDrafts(server.at(-1), combined[end - 1]) >= 0))
          return { items: combined.slice(page * 2, end), page, hasNext: combined.length > end || hasNext, warning };
        index += 1;
      }
    },
  };
}
