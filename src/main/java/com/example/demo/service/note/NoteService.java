package com.example.demo.service.note;

import com.example.demo.dto.note.request.NoteCreateRequest;
import com.example.demo.dto.note.response.NoteCreateResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

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
        Jar jar = jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 3. 현재 사용자가 이 저금통의 active 멤버인지 검사
        boolean isActiveMember = jarMemberRepository
                .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId);

        if (!isActiveMember) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "현재 저금통 멤버만 쪽지를 작성할 수 있어."
            );
        }

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

    // LocalDateTime -> OffsetDateTime(+09:00) 변환
    private OffsetDateTime toOffsetDateTime(java.time.LocalDateTime localDateTime) {
        return localDateTime == null ? null : localDateTime.atOffset(KST_OFFSET);
    }
}