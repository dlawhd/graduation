package com.example.demo.service.note;

import com.example.demo.dto.note.request.NoteCreateRequest;
import com.example.demo.dto.note.response.NoteCreateResponse;
import com.example.demo.dto.note.response.NoteDetailResponse;
import com.example.demo.dto.note.response.NoteListItem;
import com.example.demo.dto.note.response.NoteListResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Service
@Transactional(readOnly = true)
public class NoteService {

    // 우리 서비스 응답 시간을 한국 시간(+09:00)으로 맞출 때 사용
    private static final ZoneOffset KST_OFFSET = ZoneOffset.ofHours(9);

    private final NoteRepository noteRepository;
    private final JarRepository jarRepository;
    private final JarMemberRepository jarMemberRepository;
    private final UserRepository userRepository;

    public NoteService(
            NoteRepository noteRepository,
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            UserRepository userRepository
    ) {
        this.noteRepository = noteRepository;
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.userRepository = userRepository;
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

        // 4. Note 엔티티 만들기
        Note note = Note.builder()
                .jar(jar)
                .author(currentUser)
                .title(request.title())
                .content(request.content())
                .isEncrypted(false) // 지금 Phase 3에서는 아직 AES 안 쓰니까 false
                .noteDate(request.noteDate())
                .location(request.location())
                .build();

        // 5. 저장
        Note savedNote = noteRepository.save(note);

        // 6. 응답 반환
        return new NoteCreateResponse(
                savedNote.getNoteId(),
                savedNote.getJar().getJarId(),
                savedNote.getAuthor().getId(),
                savedNote.getTitle(),
                savedNote.getContent(),
                savedNote.isEncrypted(),
                savedNote.getNoteDate(),
                savedNote.getLocation(),
                toOffsetDateTime(savedNote.getCreatedAt())
        );
    }

    // 현재 사용자 찾기
    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없어."
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

        // 4. Note -> NoteListItem 변환
        List<NoteListItem> items = notePage.getContent().stream()
                .map(note -> toNoteListItem(note, jar))
                .toList();

        // 5. 응답 반환
        return new NoteListResponse(
                items,
                notePage.getNumber(),
                notePage.getSize(),
                notePage.getTotalElements(),
                notePage.getTotalPages()
        );
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
        return toNoteDetailResponse(note, jar);
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

    // 현재 사용자가 저금통 active 멤버인지 검사
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
        return !jar.getOpenAt().isAfter(LocalDateTime.now());
    }

    // 목록 응답 만들기
    private NoteListItem toNoteListItem(Note note, Jar jar) {

        // 이미 오픈된 저금통이면 진짜 내용 그대로 보여주기
        if (isJarOpen(jar)) {
            return new NoteListItem(
                    note.getNoteId(),
                    note.getTitle(),
                    makePreviewContent(note.getContent()),
                    note.getNoteDate(),
                    note.getLocation(),
                    note.getAuthor().getId(),
                    note.getAuthor().getName(),
                    note.isEncrypted(),
                    toOffsetDateTime(note.getCreatedAt())
            );
        }

        // 아직 오픈 전이면 lockLevel에 맞게 마스킹
        return toMaskedNoteListItem(note, jar.getLockLevel());
    }

    // 상세 응답 만들기
    private NoteDetailResponse toNoteDetailResponse(Note note, Jar jar) {

        // 이미 오픈된 저금통이면 진짜 내용 그대로 보여주기
        if (isJarOpen(jar)) {
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
                    toOffsetDateTime(note.getUpdatedAt())
            );
        }

        // 아직 오픈 전이면 lockLevel에 맞게 마스킹
        return toMaskedNoteDetailResponse(note, jar.getLockLevel());
    }

    // 목록용 마스킹
    private NoteListItem toMaskedNoteListItem(Note note, JarLockLevel lockLevel) {
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
                    null
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
                    toOffsetDateTime(note.getCreatedAt())
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
                    toOffsetDateTime(note.getCreatedAt())
            );
        };
    }

    // 상세용 마스킹
    private NoteDetailResponse toMaskedNoteDetailResponse(Note note, JarLockLevel lockLevel) {
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
                    null
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
                    toOffsetDateTime(note.getUpdatedAt())
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
                    toOffsetDateTime(note.getUpdatedAt())
            );
        };
    }
}