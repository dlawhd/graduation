export const SHAPE_PAGE_SIZE = 16;

/** 도형 목록은 최대 16개씩 나누고, 목록이 바뀌어도 존재하는 페이지 범위 안에서 반환한다. */
export function shapePage(entries, requestedPage = 1) {
  const totalPages = Math.max(1, Math.ceil(entries.length / SHAPE_PAGE_SIZE));
  const page = Math.max(1, Math.min(totalPages, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1));
  return { page, totalPages, items: entries.slice((page - 1) * SHAPE_PAGE_SIZE, page * SHAPE_PAGE_SIZE) };
}
