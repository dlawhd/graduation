package shop.esjh.memoryjar.dto.note.response;

import java.util.List;

/** 댓글을 평탄한 작은 페이지로 전달한다. parentCommentId로 연결하므로 답글 깊이를 제한하지 않는다. */
public record NoteCommentPageResponse(List<NoteCommentItem> items, boolean hasMore, Long nextCursor,
                                      long totalCount, boolean flat) { }
