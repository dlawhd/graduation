package com.example.demo.service.note;

import com.example.demo.dto.note.request.NoteCreateRequest;
import com.example.demo.dto.note.response.*;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteAttachment;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.note.NoteReactionEmoji;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteCommentRepository;
import com.example.demo.repository.note.NoteRepository;
import com.example.demo.service.jar.JarOpenService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class NoteService {

    // 우리 서비스 응답 시간을 한국 시간(+09:00)으로 맞출 때 사용
    private static final ZoneOffset KST_OFFSET = ZoneOffset.ofHours(9);

    private final JarOpenService jarOpenService;
    private final NoteRepository noteRepository;
    private final JarRepository jarRepository;
    private final JarMemberRepository jarMemberRepository;
    private final UserRepository userRepository;
    private final NoteAttachmentService noteAttachmentService;
    private final NoteReactionService noteReactionService;
    private final NoteCommentService noteCommentService;

    public NoteService(
            NoteRepository noteRepository,
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            UserRepository userRepository,
            JarOpenService jarOpenService,
            NoteAttachmentService noteAttachmentService,
            NoteReactionService noteReactionService,
            NoteCommentService noteCommentService
    ) {
        this.noteRepository = noteRepository;
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.userRepository = userRepository;
        this.jarOpenService = jarOpenService;
        this.noteAttachmentService = noteAttachmentService;
        this.noteReactionService = noteReactionService;
        this.noteCommentService = noteCommentService;
    }

    // 쪽지를 새로 작성하는 기능
    @Transactional
    public NoteCreateResponse createNote(
            Long currentUserId,
            Long jarId,
            NoteCreateRequest request
    ) {

        // 1. 현재 사용자 찾기
        User currentUser = getUserOrThrow(currentUserId);

        // 2. 저금통 찾기
        Jar jar = getJarOrThrow(jarId);

        // 3. 현재 사용자가 이 저금통의 active 멤버인지 검사
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 쪽지를 작성할 수 있어.");

        // 4. 태그 정리(중복 제거, 공백 제거, 너무 긴 글자 자르기 등을 해줌)
        List<String> normalizedTags = normalizeTags(request.tags());

        // 5. Note 엔티티 만들기
        Note note = Note.builder()
                .jar(jar)
                .author(currentUser)
                .title(request.title())
                .content(request.content())
                .isEncrypted(false) // 지금 Phase 3에서는 아직 AES 안 쓰니까 false
                .noteDate(request.noteDate())
                .location(request.location())
                .tags(normalizedTags)
                .build();

        // 6. 저장
        Note savedNote = noteRepository.save(note);

        // 7. 첨부가 있으면 "complete 끝난 내 파일"만 연결
        // 이제는 currentUserId + s3Key를 바탕으로 file_uploads에서 검증된 파일만 붙임
        noteAttachmentService.createAttachments(
                currentUserId,
                savedNote.getNoteId(),
                request.attachments()
        );

        // 8. 응답 반환
        return new NoteCreateResponse(
                savedNote.getNoteId(),
                savedNote.getJar().getJarId(),
                savedNote.getAuthor().getId(),
                savedNote.getTitle(),
                savedNote.getContent(),
                savedNote.isEncrypted(),
                savedNote.getNoteDate(),
                savedNote.getLocation(),
                safeTags(savedNote.getTags()),
                toOffsetDateTime(savedNote.getCreatedAt())
        );
    }

    // 현재 사용자 찾기, 없으면 404
    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없어."
                ));
    }



    // 태그를 예쁘게 정리하는 함수
    // 예:
    // [" 여행 ", "", "봄", "여행"] -> ["여행", "봄"]
    private List<String> normalizeTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return List.of();
        }

        return tags.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(tag -> !tag.isBlank())
                .map(tag -> tag.length() > 30 ? tag.substring(0, 30) : tag)
                .collect(Collectors.collectingAndThen(
                        Collectors.toCollection(LinkedHashSet::new),
                        List::copyOf
                ));
    }

    // 쪽지 목록 조회
    public NoteListResponse listNotes(
            Long currentUserId,
            Long jarId,
            int page,
            int size
    ) {

        // 1. 저금통 있는지 확인
        Jar jar = getJarOrThrow(jarId);

        // 2. 현재 사용자가 이 저금통 멤버인지 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 쪽지 목록을 볼 수 있어.");

        // 3. 페이지 조회
        Pageable pageable = PageRequest.of(page, size);
        Page<Note> notePage = noteRepository.findByJarId(jar.getJarId(), pageable);
        List<Note> notes = notePage.getContent();

        boolean jarOpen = isJarOpen(jar);

        // 4. 첨부파일을 한 번에 조회해서 noteId별로 묶어둠
        Map<Long, List<NoteAttachmentResponse>> attachmentMap = jarOpen
                ? getAttachmentResponseMap(notes)
                : Map.of();

        // 5. 리액션 개수도 noteId별로 한 번에 조회해서 묶어둠
        Map<Long, List<NoteReactionCountItem>> reactionMap = jarOpen
                ? noteReactionService.getCountMapByNoteIds(
                notes.stream()
                        .map(Note::getNoteId)
                        .toList()
        )
                : Map.of();

        // 6. 내가 각 쪽지에 누른 리액션도 noteId별로 한 번에 조회해서 묶어둠
        Map<Long, NoteReactionEmoji> myReactionMap = jarOpen
                ? noteReactionService.getMyReactionMapByNoteIds(
                currentUserId,
                notes.stream()
                        .map(Note::getNoteId)
                        .toList()
        )
                : Map.of();

        // 7. 댓글 개수도 noteId별로 한 번에 조회해서 묶어둠
        Map<Long, Long> commentCountMap = noteCommentService.getCommentCountMapByNoteIds(
                notes.stream()
                        .map(Note::getNoteId)
                        .toList()
        );

        // 8. 쪽지 목록을 화면용 DTO로 변환
        List<NoteListItem> items = notes.stream()
                .map(note -> toNoteListItem(
                        note,
                        jar,
                        jarOpen,
                        attachmentMap,
                        reactionMap,
                        myReactionMap,
                        commentCountMap))
                .toList();


        // 9. 응답 반환
        return new NoteListResponse(
                items,
                notePage.getNumber(),
                notePage.getSize(),
                notePage.getTotalElements(),
                notePage.getTotalPages()
        );
    }

    private List<NoteAttachmentResponse> toAttachmentResponses(Long noteId) {
        return noteAttachmentService.getAttachments(noteId).stream()
                .map(attachment -> new NoteAttachmentResponse(
                        attachment.getId(),
                        attachment.getSortOrder(),
                        attachment.getS3Key(),
                        attachment.getUrl(),
                        attachment.getThumbnailUrl(),
                        attachment.getContentType(),
                        attachment.getSize()
                ))
                .toList();
    }

    // 목록에서는 내용 전체 대신 미리보기만 짧게 보여주기
    private String makePreviewContent(String content) {
        if (content == null || content.isBlank()) {
            return "";
        }

        int maxLength = 30;
        if (content.length() <= maxLength) {
            return content;
        }

        return content.substring(0, maxLength) + "...";
    }

    // 쪽지 상세 조회
    public NoteDetailResponse getNoteDetail(
            Long currentUserId,
            Long jarId,
            Long noteId
    ) {

        // 1. 저금통 존재 확인
        Jar jar = getJarOrThrow(jarId);

        // 2. 현재 사용자가 이 저금통의 active 멤버인지 확인
        validateActiveMember(jarId, currentUserId, "현재 저금통 멤버만 쪽지를 볼 수 있어.");

        // 3. 이 저금통 안의 특정 쪽지 1개 찾기
        Note note = noteRepository.findByJarIdAndNoteId(jar.getJarId(), noteId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "쪽지를 찾을 수 없어."
                ));

        // 4. 응답 DTO로 변환
        return toNoteDetailResponse(currentUserId, note, jar);
    }

    // LocalDateTime -> OffsetDateTime(+09:00) 변환
    private OffsetDateTime toOffsetDateTime(java.time.LocalDateTime localDateTime) {
        return localDateTime == null ? null : localDateTime.atOffset(KST_OFFSET);
    }

    // 저금통 찾기
    private Jar getJarOrThrow(Long jarId) {
        return jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));
    }

    // 현재 사용자가 저금통 active 멤버인지 검사, 아니면 403
    private void validateActiveMember(Long jarId, Long currentUserId, String message) {
        boolean isActiveMember = jarMemberRepository
                .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId);

        if (!isActiveMember) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    message
            );
        }
    }

    // 저금통이 열렸는지 확인
    private boolean isJarOpen(Jar jar) {
        return jarOpenService.ensureOpenedIfDue(jar.getJarId());
    }

    // 목록 응답 만들기
    private NoteListItem toNoteListItem(
            Note note,
            Jar jar,
            boolean jarOpen,
            Map<Long, List<NoteAttachmentResponse>> attachmentMap,
            Map<Long, List<NoteReactionCountItem>> reactionMap,
            Map<Long, NoteReactionEmoji> myReactionMap,
            Map<Long, Long> commentCountMap
    ) {
        // 이미 계산한 jarOpen 값을 그대로 사용
        if (jarOpen) {
            return new NoteListItem(
                    note.getNoteId(),
                    note.getTitle(),
                    makePreviewContent(note.getContent()),
                    note.getNoteDate(),
                    note.getLocation(),
                    note.getAuthor().getId(),
                    note.getAuthor().getName(),
                    note.isEncrypted(),
                    toOffsetDateTime(note.getCreatedAt()),
                    safeTags(note.getTags()),
                    attachmentMap.getOrDefault(note.getNoteId(), List.of()),
                    myReactionMap.get(note.getNoteId()),
                    reactionMap.getOrDefault(note.getNoteId(), List.of()),
                    commentCountMap.getOrDefault(note.getNoteId(), 0L)
            );
        }

        return toMaskedNoteListItem(note, jar.getLockLevel(), commentCountMap);
    }

    // 상세 응답 만들기
    private NoteDetailResponse toNoteDetailResponse(
            Long currentUserId,
            Note note,
            Jar jar) {

        long commentCount = noteCommentService.countComments(note.getNoteId());

        // 이미 오픈된 저금통이면 진짜 내용 그대로 보여주기
        if (isJarOpen(jar)) {
            NoteReactionSummaryResponse reactionSummary =
                    noteReactionService.getSummary(
                            currentUserId,
                            jar.getJarId(),
                            note.getNoteId()
                    );

            return new NoteDetailResponse(
                    note.getNoteId(),
                    note.getJar().getJarId(),
                    note.getAuthor().getId(),
                    note.getAuthor().getName(),
                    note.getTitle(),
                    note.getContent(),
                    note.isEncrypted(),
                    note.getNoteDate(),
                    note.getLocation(),
                    toOffsetDateTime(note.getCreatedAt()),
                    toOffsetDateTime(note.getUpdatedAt()),
                    safeTags(note.getTags()),
                    toAttachmentResponses(note.getNoteId()),
                    reactionSummary.myReaction(),
                    reactionSummary.counts(),
                    commentCount
            );
        }

        // 아직 오픈 전이면 lockLevel에 맞게 마스킹
        return toMaskedNoteDetailResponse(note, jar.getLockLevel(), commentCount);
    }

    // 목록용 마스킹
    private NoteListItem toMaskedNoteListItem(
            Note note,
            JarLockLevel lockLevel,
            Map<Long, Long> commentCountMap) {
        long commentCount = commentCountMap.getOrDefault(note.getNoteId(), 0L);

        return switch (lockLevel) {

            // 완전 숨김: 제목/내용/날짜/장소 거의 다 숨김
            case HIDDEN -> new NoteListItem(
                    note.getNoteId(),
                    "오픈 전 쪽지",
                    "아직 열리기 전이야.",
                    null,
                    null,
                    null,
                    null,
                    note.isEncrypted(),
                    null,
                    List.of(),
                    List.of(),
                    null,
                    List.of(),
                    commentCount
            );

            // 메타만 공개: 날짜/장소는 보여주고 제목/내용은 숨김
            case META_ONLY -> new NoteListItem(
                    note.getNoteId(),
                    "오픈 전 쪽지",
                    "아직 내용은 비밀이야.",
                    note.getNoteDate(),
                    note.getLocation(),
                    null,
                    null,
                    note.isEncrypted(),
                    toOffsetDateTime(note.getCreatedAt()),
                    List.of(),
                    List.of(),
                    null,
                    List.of(),
                    commentCount
            );

            // 제목만 공개: 제목은 보이고 내용은 숨김
            case TITLE_ONLY -> new NoteListItem(
                    note.getNoteId(),
                    note.getTitle(),
                    "아직 내용은 비밀이야.",
                    note.getNoteDate(),
                    note.getLocation(),
                    null,
                    null,
                    note.isEncrypted(),
                    toOffsetDateTime(note.getCreatedAt()),
                    List.of(),
                    List.of(),
                    null,
                    List.of(),
                    commentCount
            );
        };
    }

    // 미리 다 가져와서 묶어둠
    private Map<Long, List<NoteAttachmentResponse>> getAttachmentResponseMap(List<Note> notes) {

        if (notes == null || notes.isEmpty()) {
            return Map.of();
        }

        // noteId만 뽑기
        List<Long> noteIds = notes.stream()
                .map(Note::getNoteId)
                .toList();

        List<NoteAttachment> attachments =
                noteAttachmentService.getAttachmentsByNoteIds(noteIds);

        return attachments.stream()
                .collect(Collectors.groupingBy(
                        attachment -> attachment.getNote().getNoteId(),
                        java.util.stream.Collectors.mapping(
                                attachment -> new NoteAttachmentResponse(
                                        attachment.getId(),
                                        attachment.getSortOrder(),
                                        attachment.getS3Key(),
                                        attachment.getUrl(),
                                        attachment.getThumbnailUrl(),
                                        attachment.getContentType(),
                                        attachment.getSize()
                                ),
                                java.util.stream.Collectors.toList()
                        )
                ));
    }

    // 상세용 마스킹
    private NoteDetailResponse toMaskedNoteDetailResponse(
            Note note,
            JarLockLevel lockLevel,
            long commentCount) {
        return switch (lockLevel) {

            // 완전 숨김: 제목, 내용, 날짜, 장소, 작성자 정보까지 다 숨김
            case HIDDEN -> new NoteDetailResponse(
                    note.getNoteId(),
                    note.getJar().getJarId(),
                    null,
                    null,
                    "오픈 전 쪽지",
                    "오픈 전이라 아직 내용을 볼 수 없어.",
                    note.isEncrypted(),
                    null,
                    null,
                    null,
                    null,
                    List.of(),
                    List.of(),
                    null,
                    List.of(),
                    commentCount
            );

            // 메타만 공개: 날짜, 장소 정도만 보여주고 나머지는 숨김
            case META_ONLY -> new NoteDetailResponse(
                    note.getNoteId(),
                    note.getJar().getJarId(),
                    null,
                    null,
                    "오픈 전 쪽지",
                    "오픈 전이라 아직 내용을 볼 수 없어.",
                    note.isEncrypted(),
                    note.getNoteDate(),
                    note.getLocation(),
                    toOffsetDateTime(note.getCreatedAt()),
                    toOffsetDateTime(note.getUpdatedAt()),
                    List.of(),
                    List.of(),
                    null,
                    List.of(),
                    commentCount
            );

            // 제목만 공개: 제목은 보여주고 내용은 숨김
            case TITLE_ONLY -> new NoteDetailResponse(
                    note.getNoteId(),
                    note.getJar().getJarId(),
                    null,
                    null,
                    note.getTitle(),
                    "오픈 전이라 아직 내용을 볼 수 없어.",
                    note.isEncrypted(),
                    note.getNoteDate(),
                    note.getLocation(),
                    toOffsetDateTime(note.getCreatedAt()),
                    toOffsetDateTime(note.getUpdatedAt()),
                    List.of(),
                    List.of(),
                    null,
                    List.of(),
                    commentCount
            );
        };
    }

    // null 방지용
    private List<String> safeTags(List<String> tags) {
        return tags == null ? List.of() : tags;
    }
}