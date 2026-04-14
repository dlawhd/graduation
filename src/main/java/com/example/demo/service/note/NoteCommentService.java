package com.example.demo.service.note;

import com.example.demo.dto.note.request.NoteCommentCreateRequest;
import com.example.demo.dto.note.request.NoteCommentUpdateRequest;
import com.example.demo.dto.note.response.NoteCommentItem;
import com.example.demo.dto.note.response.NoteCommentListResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteComment;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteCommentRepository;
import com.example.demo.repository.note.NoteRepository;
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

    public NoteCommentService(
            NoteCommentRepository noteCommentRepository,
            NoteRepository noteRepository,
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            UserRepository userRepository
    ) {
        this.noteCommentRepository = noteCommentRepository;
        this.noteRepository = noteRepository;
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.userRepository = userRepository;
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

        // 6. 댓글 엔티티 만들기
        NoteComment comment = NoteComment.builder()
                .note(note)
                .user(currentUser)
                .content(normalizedContent)
                .build();

        // 7. 저장
        NoteComment savedComment = noteCommentRepository.save(comment);

        // 8. 응답 DTO 반환
        return toItem(savedComment);
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

        // 5. 오래된 댓글부터 가져오기
        List<NoteCommentItem> items = noteCommentRepository
                .findByNote_NoteIdOrderByCreatedAtAscCommentIdAsc(noteId)
                .stream()
                .map(this::toItem)
                .toList();

        // 6. 응답 반환
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

        // 9. 응답 DTO 반환
        return toItem(comment);
    }

    /*
     * 댓글 삭제
     *
     * 규칙:
     * - 저금통 active 멤버만 가능
     * - 작성자 본인만 가능
     *
     * NoteComment 엔티티에 soft delete 설정이 들어가 있으므로 delete()를 호출하면 DB에서 바로 지워지는 게 아니라
     * deleted_at 시간이 찍히는 방식으로 동작
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

        // 3. active 멤버 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 댓글을 삭제할 수 있어.");

        // 4. 이 저금통 안의 쪽지인지 확인
        getNoteOrThrow(jarId, noteId);

        // 5. 이 쪽지에 속한 댓글인지 확인
        NoteComment comment = getCommentOrThrow(noteId, commentId);

        // 6. 댓글 작성자 본인인지 확인
        validateCommentOwner(comment, currentUserId, "작성자 본인만 댓글을 삭제할 수 있어.");

        // 7. soft delete
        noteCommentRepository.delete(comment);
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
    private NoteCommentItem toItem(NoteComment comment) {
        return new NoteCommentItem(
                comment.getCommentId(),
                comment.getUser().getId(),
                comment.getUser().getName(),
                comment.getContent(),
                toOffsetDateTime(comment.getCreatedAt()),
                toOffsetDateTime(comment.getUpdatedAt())
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
}