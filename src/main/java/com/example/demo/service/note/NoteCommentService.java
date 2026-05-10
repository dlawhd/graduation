package com.example.demo.service.note;

import com.example.demo.dto.note.request.NoteCommentCreateRequest;
import com.example.demo.dto.note.request.NoteCommentUpdateRequest;
import com.example.demo.dto.note.response.NoteCommentItem;
import com.example.demo.dto.note.response.NoteCommentListResponse;
import com.example.demo.dto.note.response.NoteRealtimeEventResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteComment;
import com.example.demo.model.notification.NotificationPayload;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteCommentRepository;
import com.example.demo.repository.note.NoteRepository;
import com.example.demo.service.notification.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
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
    @Transactional
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
        Note note = getNoteOrThrow(jarId, noteId);

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
        NoteCommentItem response = toItem(savedComment, List.of());

        // 10. 댓글/답글 작성 이벤트 만들기
        NoteRealtimeEventResponse realtimeEvent;

        if (parentComment == null) {
            // 일반 댓글이면 COMMENT_CREATED 이벤트
            realtimeEvent = NoteRealtimeEventResponse.commentCreated(
                    jarId,
                    noteId,
                    currentUser.getId(),
                    currentUser.getName(),
                    savedComment.getCommentId()
            );
        } else {
            // 답글이면 COMMENT_REPLIED 이벤트
            realtimeEvent = NoteRealtimeEventResponse.commentReplied(
                    jarId,
                    noteId,
                    currentUser.getId(),
                    currentUser.getName(),
                    savedComment.getCommentId(),
                    parentComment.getCommentId()
            );
        }

        // 11. DB 커밋 성공 후 WebSocket으로 쪽지 상세 화면에 알려주기
        noteRealtimeService.sendNoteEventAfterCommit(jarId, noteId, realtimeEvent);

        // 12. 기존 REST 응답은 그대로 반환
        return response;
    }

    // 댓글 목록 조회
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
    @Transactional
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
        getNoteOrThrow(jarId, noteId);

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
         * 8. 삭제 대상 댓글과 그 아래 답글들을 전부 삭제한다.
         *
         * 핵심:
         * - 먼저 자식 답글들을 삭제한다.
         * - 그 다음 현재 댓글을 삭제한다.
         *
         * 이유:
         * - 부모를 먼저 삭제하면 자식 답글을 찾기 애매해질 수 있다.
         * - 아래에서부터 지우면 댓글 트리가 깔끔하게 정리된다.
         */
        deleteCommentWithChildren(comment);

        // 9. 댓글 삭제 이벤트 보내기
        // 프론트는 이 이벤트를 받으면 댓글 목록을 다시 조회해서 화면을 최신 상태로 맞춘다.
        noteRealtimeService.sendNoteEventAfterCommit(
                jarId,
                noteId,
                NoteRealtimeEventResponse.commentDeleted(
                        jarId,
                        noteId,
                        currentUserId,
                        actorName,
                        deletedCommentId,
                        parentCommentId
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

        return noteIds.stream()
                .collect(Collectors.toMap(
                        noteId -> noteId,
                        noteCommentRepository::countByNote_NoteId
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
        return comments.stream()
                .filter(NoteComment::isRootComment)
                .map(rootComment -> toItemWithChildren(rootComment, childrenMap))
                .toList();
    }

    /*
     * 댓글 1개를 DTO로 바꾸면서,
     * 그 댓글 아래 답글들도 계속 붙여주는 함수다.
     *
     * 이 함수가 자기 자신을 다시 부르기 때문에
     * 답글의 답글까지 계속 내려갈 수 있다.
     */
    private NoteCommentItem toItemWithChildren(
            NoteComment comment,
            Map<Long, List<NoteComment>> childrenMap
    ) {
        // 1. 현재 댓글 바로 아래에 달린 답글들을 찾는다.
        List<NoteComment> children = childrenMap.getOrDefault(
                comment.getCommentId(),
                List.of()
        );

        // 2. 자식 답글들도 다시 같은 방식으로 변환한다.
        List<NoteCommentItem> replies = children.stream()
                .map(child -> toItemWithChildren(child, childrenMap))
                .toList();

        // 3. 현재 댓글 + 그 아래 답글 목록을 응답 DTO로 만든다.
        return toItem(comment, replies);
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
        // 1. 현재 댓글 바로 아래에 달린 답글들을 찾는다.
        List<NoteComment> childComments =
                noteCommentRepository.findByParentComment_CommentIdOrderByCreatedAtAscCommentIdAsc(
                        comment.getCommentId()
                );

        // 2. 자식 답글들도 같은 방식으로 먼저 삭제한다.
        for (NoteComment childComment : childComments) {
            deleteCommentWithChildren(childComment);
        }

        // 3. 자식들을 모두 지운 뒤 현재 댓글을 삭제한다.
        // NoteComment 엔티티에 soft delete가 적용되어 있다면 deleted_at이 찍힌다.
        noteCommentRepository.delete(comment);
    }
}