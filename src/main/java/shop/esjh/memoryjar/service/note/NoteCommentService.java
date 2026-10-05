package shop.esjh.memoryjar.service.note;

import shop.esjh.memoryjar.dto.note.request.NoteCommentCreateRequest;
import shop.esjh.memoryjar.dto.note.request.NoteCommentUpdateRequest;
import shop.esjh.memoryjar.dto.note.response.NoteCommentItem;
import shop.esjh.memoryjar.dto.note.response.NoteCommentListResponse;
import shop.esjh.memoryjar.dto.note.response.NoteCommentPageResponse;
import shop.esjh.memoryjar.dto.note.response.NoteRealtimeEventResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteComment;
import shop.esjh.memoryjar.model.notification.NotificationPayload;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.repository.note.NoteCommentRepository;
import shop.esjh.memoryjar.repository.note.NoteRepository;
import shop.esjh.memoryjar.service.notification.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.ZoneId;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/*
 *
 * 이번 댓글 규칙
 * - 저금통 active 멤버만 가능
 * - 오픈 전에도 댓글 가능
 * - 수정/삭제는 작성자 본인만 가능
 * - 댓글 정렬은 오래된 순서가 위
 */
@Service
@Transactional(readOnly = true)
public class NoteCommentService {

    // 화면 응답 시간을 한국 시간(+09:00)으로 맞출 때 사용
    private static final ZoneOffset KST_OFFSET = ZoneOffset.ofHours(9);

    private final NoteCommentRepository noteCommentRepository;
    private final NoteRepository noteRepository;
    private final JarRepository jarRepository;
    private final JarMemberRepository jarMemberRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final NoteRealtimeService noteRealtimeService;

    public NoteCommentService(
            NoteCommentRepository noteCommentRepository,
            NoteRepository noteRepository,
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            UserRepository userRepository,
            NotificationService notificationService,
            NoteRealtimeService noteRealtimeService
    ) {
        this.noteCommentRepository = noteCommentRepository;
        this.noteRepository = noteRepository;
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.noteRealtimeService = noteRealtimeService;
    }

    // 댓글 작성
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public NoteCommentItem createComment(
            Long currentUserId,
            Long jarId,
            Long noteId,
            NoteCommentCreateRequest request
    ) {
        // 1. 현재 사용자 확인
        User currentUser = getUserOrThrow(currentUserId);

        // 2. 저금통 확인
        getJarOrThrow(jarId);

        // 3. 현재 사용자가 active 멤버인지 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 댓글을 작성할 수 있어.");

        // 4. 이 저금통 안의 쪽지인지 확인
        // 삭제와 작성이 같은 쪽지에서 겹치면 순서대로 처리해 삭제된 부모 아래 답글이 남지 않게 한다.
        Note note = getNoteForUpdate(jarId, noteId);

        // 5. 입력값 정리
        String normalizedContent = normalizeContent(request.content());

        // 6. 부모 댓글이 있으면 답글로 처리한다.
        NoteComment parentComment = null;

        if (request.parentCommentId() != null) {
            // 6-1. 사용자가 답글을 달려고 선택한 부모 댓글을 찾는다.
            parentComment = getCommentOrThrow(noteId, request.parentCommentId());

            // 6-2. 부모 댓글이 같은 쪽지 안에 있는 댓글인지 확인한다.
            // 다른 쪽지 댓글 아래에 답글이 달리는 실수를 막기 위한 안전장치다.
            validateParentCommentBelongsToNote(parentComment, noteId);
        }

        // 7. 댓글 엔티티 만들기
        NoteComment comment = NoteComment.builder()
                .note(note)
                .user(currentUser)
                .content(normalizedContent)
                .parentComment(parentComment)
                .build();

        // 8. 저장
        NoteComment savedComment = noteCommentRepository.save(comment);

        // 8-1. 알림 payload 만들기
        NotificationPayload payload = new NotificationPayload(
                jarId,                       // 어느 저금통인지
                noteId,                      // 어느 쪽지인지
                savedComment.getCommentId(), // 어느 댓글인지
                currentUser.getId(),         // 누가 행동했는지
                currentUser.getName(),       // 행동한 사람 이름
                null                         // 댓글 알림은 이모지 없음
        );

        // 8-2. 부모 댓글이 없으면 "내 쪽지에 댓글"
        if (parentComment == null) {
            notificationService.notifyNoteCommented(
                    note.getAuthor(),   // Note 엔티티 getter 이름에 맞게 확인
                    note.getJar(),
                    payload
            );
        } else {
            // 답글이면 "내 댓글에 답글"
            notificationService.notifyCommentReplied(
                    List.of(parentComment.getUser()),
                    note.getJar(),
                    payload
            );
        }

        // 9. 응답 DTO 만들기
        NoteCommentItem response =
                toItem(savedComment, List.of());

        /*
         * 10. 저장 내용을 DB에 먼저 반영한 뒤
         * 해당 쪽지의 최신 댓글 개수를 센다.
         *
         * 이 숫자를 WebSocket 이벤트에 넣으면
         * 프론트가 쪽지 목록 전체를 다시 조회하지 않아도 된다.
         */
        noteCommentRepository.flush();

        long commentCount =
                noteCommentRepository.countByNote_NoteId(noteId);

        // 11. 댓글 또는 답글 작성 이벤트 만들기
        NoteRealtimeEventResponse realtimeEvent;

        if (parentComment == null) {
            /*
             * 부모 댓글이 없으면 일반 댓글이다.
             */
            realtimeEvent =
                    NoteRealtimeEventResponse.commentCreated(
                            jarId,
                            noteId,
                            currentUser.getId(),
                            currentUser.getName(),
                            savedComment.getCommentId(),
                            commentCount
                    );
        } else {
            /*
             * 부모 댓글이 있으면 답글이다.
             */
            realtimeEvent =
                    NoteRealtimeEventResponse.commentReplied(
                            jarId,
                            noteId,
                            currentUser.getId(),
                            currentUser.getName(),
                            savedComment.getCommentId(),
                            parentComment.getCommentId(),
                            commentCount
                    );
        }

        /*
         * 12. DB 커밋 성공 후
         * 저금통 쪽지 목록과 상세 화면에 변경 사실을 알린다.
         */
        noteRealtimeService.sendNoteEventAfterCommit(
                jarId,
                noteId,
                realtimeEvent
        );

        // 13. 기존 REST 응답은 그대로 반환한다.
        return response;
    }

    // 댓글 목록 조회
    /** 화면에서는 이 작은 평탄 페이지를 이어 붙이며 답글을 원하는 깊이까지 계속 작성한다. */
    public NoteCommentPageResponse getCommentPage(
            Long currentUserId, Long jarId, Long noteId, Long cursor, int size, Long focusId) {
        if (cursor == null || cursor < 0 || size < 1 || size > 100 || (focusId != null && focusId < 1)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "댓글 페이지 범위가 올바르지 않아.");
        }
        getUserOrThrow(currentUserId);
        getJarOrThrow(jarId);
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 댓글 목록을 볼 수 있어.");
        getNoteOrThrow(jarId, noteId);
        List<NoteComment> rows = noteCommentRepository.findPageAfter(noteId, cursor,
                PageRequest.of(0, size + 1));
        boolean hasMore = rows.size() > size;
        List<NoteCommentItem> items = new ArrayList<>(rows.stream().limit(size).map(c -> toItem(c, List.of())).toList());
        Long next = items.isEmpty() ? cursor : items.get(items.size() - 1).commentId();
        if (focusId != null) {
            // 알림/방금 쓴 답글로 이동할 때만 조상 경로를 덧붙인다. 앞선 모든 본문을 읽지 않는다.
            Map<Long, Long> parents = new HashMap<>();
            noteCommentRepository.findCommentLinks(noteId).forEach(link -> parents.put(link.getId(), link.getParentId()));
            Set<Long> path = new LinkedHashSet<>();
            Long id = focusId;
            while (id != null && parents.containsKey(id) && path.add(id)) id = parents.get(id);
            List<Long> ids = new ArrayList<>(path);
            for (int offset = 0; offset < ids.size(); offset += 100) {
                noteCommentRepository.findPathItems(noteId, ids.subList(offset, Math.min(offset + 100, ids.size())))
                        .stream().map(c -> toItem(c, List.of())).forEach(items::add);
            }
            items = items.stream().collect(Collectors.toMap(NoteCommentItem::commentId, c -> c, (a, b) -> a))
                    .values().stream().sorted(Comparator.comparing(NoteCommentItem::commentId)).toList();
        }
        return new NoteCommentPageResponse(items, hasMore, next,
                noteCommentRepository.countByNote_NoteId(noteId), true);
    }

    // 기존 클라이언트의 트리 응답은 호환용으로 유지한다.
    public NoteCommentListResponse getCommentList(
            Long currentUserId,
            Long jarId,
            Long noteId
    ) {
        // 1. 현재 사용자 확인
        getUserOrThrow(currentUserId);

        // 2. 저금통 확인
        getJarOrThrow(jarId);

        // 3. active 멤버 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 댓글 목록을 볼 수 있어.");

        // 4. 이 저금통 안의 쪽지인지 확인
        getNoteOrThrow(jarId, noteId);

        List<NoteComment> comments =
                noteCommentRepository.findByNote_NoteIdOrderByCreatedAtAscCommentIdAsc(noteId);

        List<NoteCommentItem> items = buildCommentTree(comments);

        // 5. 응답 반환
        return new NoteCommentListResponse(items);
    }

    /*
     * 댓글 수정
     *
     * 규칙:
     * - 저금통 active 멤버만 가능, 작성자 본인만 가능

     */
    @Transactional
    public NoteCommentItem updateComment(
            Long currentUserId,
            Long jarId,
            Long noteId,
            Long commentId,
            NoteCommentUpdateRequest request
    ) {
        // 1. 현재 사용자 확인
        getUserOrThrow(currentUserId);

        // 2. 저금통 확인
        getJarOrThrow(jarId);

        // 3. active 멤버 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 댓글을 수정할 수 있어.");

        // 4. 이 저금통 안의 쪽지인지 확인
        getNoteOrThrow(jarId, noteId);

        // 5. 이 쪽지에 속한 댓글인지 확인
        NoteComment comment = getCommentOrThrow(noteId, commentId);

        // 6. 댓글 작성자 본인인지 확인
        validateCommentOwner(comment, currentUserId, "작성자 본인만 댓글을 수정할 수 있어.");

        // 7. 입력값 정리
        String normalizedContent = normalizeContent(request.content());

        // 8. 내용 수정
        comment.updateContent(normalizedContent);

        // 9. 응답 DTO 만들기
        NoteCommentItem response = toItem(comment, List.of());

        // 10. 부모 댓글 id 꺼내기
        Long parentCommentId = comment.getParentComment() != null
                ? comment.getParentComment().getCommentId()
                : null;

        // 11. 댓글 수정 이벤트 보내기
        noteRealtimeService.sendNoteEventAfterCommit(
                jarId,
                noteId,
                NoteRealtimeEventResponse.commentUpdated(
                        jarId,
                        noteId,
                        currentUserId,
                        comment.getUser().getName(),
                        comment.getCommentId(),
                        parentCommentId
                )
        );

        // 12. 기존 REST 응답 반환
        return response;
    }

    /*
     * 댓글 삭제
     *
     * 규칙:
     * - 저금통 active 멤버만 가능
     * - 작성자 본인만 가능
     *
     * 삭제 정책:
     * - 댓글을 삭제하면 그 댓글 아래의 모든 답글도 함께 삭제한다.
     * - "삭제된 댓글입니다." 같은 문구는 남기지 않는다.
     * - 화면에서는 삭제 후 바로 안 보이게 한다.
     *
     * 예:
     * 댓글 A
     * └ 답글 B
     *   └ 답글 C
     *
     * 댓글 A를 삭제하면 A, B, C가 모두 삭제된다.
     * 답글 B를 삭제하면 B, C가 삭제되고 A는 남는다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void deleteComment(
            Long currentUserId,
            Long jarId,
            Long noteId,
            Long commentId
    ) {
        // 1. 현재 사용자 확인
        getUserOrThrow(currentUserId);

        // 2. 저금통 확인
        getJarOrThrow(jarId);

        // 3. 현재 사용자가 저금통 멤버인지 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 댓글을 삭제할 수 있어.");

        // 4. 이 저금통 안의 쪽지인지 확인
        getNoteForUpdate(jarId, noteId);

        // 5. 삭제하려는 댓글이 이 쪽지 안에 있는 댓글인지 확인
        NoteComment comment = getCommentOrThrow(noteId, commentId);

        // 6. 댓글 작성자 본인인지 확인
        validateCommentOwner(comment, currentUserId, "작성자 본인만 댓글을 삭제할 수 있어.");

        // 7. WebSocket 이벤트에 필요한 값은 삭제 전에 미리 꺼내둔다.
        Long parentCommentId = comment.getParentComment() != null
                ? comment.getParentComment().getCommentId()
                : null;

        Long deletedCommentId = comment.getCommentId();
        String actorName = comment.getUser().getName();

        /*
         * 8. 현재 댓글과 그 아래 모든 답글을 삭제한다.
         */
        deleteCommentWithChildren(comment);

        /*
         * 9. 삭제 내용을 DB에 먼저 반영한 뒤
         * 남아 있는 최신 댓글 개수를 다시 센다.
         *
         * 부모 댓글을 삭제하면 답글도 함께 삭제될 수 있으므로
         * 단순히 기존 개수에서 1만 빼면 정확하지 않을 수 있다.
         */
        noteCommentRepository.flush();

        long commentCount =
                noteCommentRepository.countByNote_NoteId(noteId);

        /*
         * 10. 최신 댓글 개수를 포함한 삭제 이벤트를 전송한다.
         */
        noteRealtimeService.sendNoteEventAfterCommit(
                jarId,
                noteId,
                NoteRealtimeEventResponse.commentDeleted(
                        jarId,
                        noteId,
                        currentUserId,
                        actorName,
                        deletedCommentId,
                        parentCommentId,
                        commentCount
                )
        );
    }

    /*
     * 현재 사용자 찾기
     * 없으면 404
     */
    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없어."
                ));
    }

    /*
     * 저금통 찾기
     * 없으면 404
     */
    private Jar getJarOrThrow(Long jarId) {
        return jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));
    }

    /*
     * 현재 사용자가 이 저금통의 active 멤버인지 확인
     * 아니면 403
     */
    private void validateActiveMember(Long jarId, Long currentUserId, String message) {
        boolean isActiveMember = jarMemberRepository
                .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId);

        if (!isActiveMember) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, message);
        }
    }

    /*
     * 이 저금통 안의 특정 쪽지 1개 찾기
     * 없으면 404

     * 왜 jarId와 noteId를 같이 보냐면?
     * 다른 저금통의 쪽지를 잘못 건드리는 걸 막기 위해서
     */
    private Note getNoteOrThrow(Long jarId, Long noteId) {
        return noteRepository.findByJarIdAndNoteId(jarId, noteId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "쪽지를 찾을 수 없어."
                ));
    }

    /** 댓글 작성·하위 답글 삭제가 경합할 때 사용할 안정적인 잠금 기준은 부모 쪽지다. */
    private Note getNoteForUpdate(Long jarId, Long noteId) {
        return noteRepository.findByJarIdAndNoteIdForUpdate(jarId, noteId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "쪽지를 찾을 수 없어."));
    }

    /*
     * 이 쪽지 안의 특정 댓글 1개 찾기
     * 없으면 404

     * 왜 noteId와 commentId를 같이 보냐면?
     * 다른 쪽지의 댓글을 실수로 수정/삭제하지 않게 하려고
     */
    private NoteComment getCommentOrThrow(Long noteId, Long commentId) {
        return noteCommentRepository.findByCommentIdAndNote_NoteId(commentId, noteId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "댓글을 찾을 수 없어."
                ));
    }

    /*
     * 댓글 작성자 본인인지 검사
     * 아니면 403
     */
    private void validateCommentOwner(NoteComment comment, Long currentUserId, String message) {
        if (!comment.isOwner(currentUserId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, message);
        }
    }

    /*
     * 댓글 내용을 저장하기 전에 정리하는 함수
     *
     * 예:
     * "  안녕  " -> "안녕"
     *
     * DTO의 @NotBlank가 이미 1차 검증을 해주지만
     * 서비스에서도 한 번 trim 해두면 더 깔끔
     */
    private String normalizeContent(String content) {
        if (content == null) {
            return null;
        }
        return content.trim();
    }

    /*
     * Entity -> 화면용 DTO 변환
     */
    private NoteCommentItem toItem(NoteComment comment, List<NoteCommentItem> replies) {
        return new NoteCommentItem(
                comment.getCommentId(),
                comment.getUser().getId(),
                comment.getUser().getName(),
                comment.getParentComment() != null ? comment.getParentComment().getCommentId() : null,
                comment.getContent(),
                toOffsetDateTime(comment.getCreatedAt()),
                toOffsetDateTime(comment.getUpdatedAt()),
                replies
        );
    }

    /*
     * LocalDateTime -> OffsetDateTime(+09:00) 변환
     *
     * NoteService와 같은 방식으로 맞춰서
     * 응답 시간이 화면에서 일관되게 보이게 한다.
     */
    private OffsetDateTime toOffsetDateTime(LocalDateTime localDateTime) {
        return localDateTime == null ? null : localDateTime.atOffset(KST_OFFSET);
    }


    @Transactional(readOnly = true)
    public long countComments(Long noteId) {
        return noteCommentRepository.countByNote_NoteId(noteId);
    }

    @Transactional(readOnly = true)
    public Map<Long, Long> getCommentCountMapByNoteIds(List<Long> noteIds) {
        if (noteIds == null || noteIds.isEmpty()) {
            return Map.of();
        }

        /*
         * 여러 쪽지의 댓글 개수를 한 번에 조회한다.
         *
         * 예전 방식:
         * - 쪽지 목록에 20개가 있으면 countByNote_NoteId 쿼리가 20번 나갈 수 있었다.
         *
         * 개선 방식:
         * - noteIds 전체를 IN 조건으로 한 번에 넘긴다.
         * - DB가 noteId별 댓글 개수를 GROUP BY로 계산한다.
         * - 댓글이 0개인 쪽지는 쿼리 결과에 없을 수 있으므로 서비스에서 0L을 채운다.
         */
        Map<Long, Long> countedMap = noteCommentRepository.countCommentsByNoteIds(noteIds).stream()
                .collect(Collectors.toMap(
                        NoteCommentRepository.CommentCountView::getNoteId,
                        NoteCommentRepository.CommentCountView::getCommentCount
                ));

        // 기존 메서드처럼 요청받은 noteId는 모두 Map에 포함시킨다.
        // 댓글이 없는 쪽지는 0L로 넣어 목록 DTO에서 안전하게 사용할 수 있게 한다.
        return noteIds.stream()
                .distinct()
                .collect(Collectors.toMap(
                        noteId -> noteId,
                        noteId -> countedMap.getOrDefault(noteId, 0L)
                ));
    }

    /*
     * 댓글 목록을 트리 형태로 만드는 함수다.
     *
     * 예:
     * 댓글 A
     * └ 답글 B
     *   └ 답글 C
     *
     * 쉽게 말하면:
     * DB에는 댓글이 한 줄씩 저장되어 있지만,
     * 화면에는 댓글 안에 replies가 들어있는 구조로 보내야 한다.
     */
    private List<NoteCommentItem> buildCommentTree(List<NoteComment> comments) {
        // 1. 부모 댓글 id 기준으로 자식 댓글들을 묶는다.
        Map<Long, List<NoteComment>> childrenMap = comments.stream()
                .filter(NoteComment::isReply)
                .collect(Collectors.groupingBy(
                        comment -> comment.getParentComment().getCommentId()
                ));

        // 2. 부모가 없는 최상위 댓글부터 시작한다.
        return comments.stream().filter(NoteComment::isRootComment)
                .map(root -> toItemWithChildren(root, childrenMap)).toList();
    }

    /*
     * 댓글 1개를 DTO로 바꾸면서,
     * 그 댓글 아래 답글들도 계속 붙여주는 함수다.
     *
     * 반복형 트리 조립으로 깊은 답글도 호출 스택 제한 없이 내려갈 수 있다.
     */
    private NoteCommentItem toItemWithChildren(
            NoteComment comment,
            Map<Long, List<NoteComment>> childrenMap
    ) {
        // 자기 자신을 호출하지 않고, 자식 DTO부터 조립해 호출 스택이 답글 깊이에 비례하지 않게 한다.
        List<NoteComment> subtree = new ArrayList<>();
        ArrayDeque<NoteComment> queue = new ArrayDeque<>();
        queue.add(comment);
        while (!queue.isEmpty()) {
            NoteComment current = queue.removeFirst();
            subtree.add(current);
            queue.addAll(childrenMap.getOrDefault(current.getCommentId(), List.of()));
        }
        Map<Long, NoteCommentItem> converted = new HashMap<>();
        for (int index = subtree.size() - 1; index >= 0; index--) {
            NoteComment current = subtree.get(index);
            converted.put(current.getCommentId(), toItem(current, childrenMap
                    .getOrDefault(current.getCommentId(), List.of()).stream()
                    .map(child -> converted.get(child.getCommentId())).toList()));
        }
        return converted.get(comment.getCommentId());
    }


    private void validateParentCommentBelongsToNote(NoteComment parentComment, Long noteId) {
        if (parentComment != null && !parentComment.isNote(noteId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "같은 쪽지의 댓글에만 답글을 달 수 있어."
            );
        }
    }

    /*
     * 댓글과 그 아래 모든 답글을 함께 삭제하는 함수다.
     *
     * 쉽게 말하면:
     * - 현재 댓글 아래 답글들을 찾는다.
     * - 각 답글 아래에 또 답글이 있으면 그것도 먼저 삭제한다.
     * - 마지막에 현재 댓글을 삭제한다.
     *
     * 이렇게 하면 댓글 A를 삭제할 때
     * A 아래의 B, C, D까지 모두 화면에서 사라진다.
     */
    private void deleteCommentWithChildren(NoteComment comment) {
        // 1. 재귀 대신 작업 큐에서 ID만 읽는다. 한 SQL의 IN 크기는 최대 500개다.
        ArrayDeque<Long> pending = new ArrayDeque<>();
        Set<Long> visited = new HashSet<>();
        pending.add(comment.getCommentId());
        LocalDateTime now = LocalDateTime.now(ZoneId.of("Asia/Seoul"));
        while (!pending.isEmpty()) {
            List<Long> batch = new ArrayList<>();
            while (!pending.isEmpty() && batch.size() < 500) {
                Long id = pending.removeFirst();
                if (visited.add(id)) batch.add(id);
            }
            if (batch.isEmpty()) continue;
            // 2. 부모를 지우기 전에 바로 아래 자식 ID를 확보한다.
            pending.addAll(noteCommentRepository.findChildIds(batch));
            // 3. Entity별 DELETE 대신 묶음 soft delete한다. 기존 삭제 정책과 이벤트는 유지한다.
            noteCommentRepository.softDeleteIds(batch, now);
        }
    }
}
