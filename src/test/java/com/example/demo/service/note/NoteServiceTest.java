package com.example.demo.service.note;

import com.example.demo.dto.note.request.NoteAttachmentCreateRequest;
import com.example.demo.dto.note.request.NoteCreateRequest;
import com.example.demo.dto.note.response.NoteCreateResponse;
import com.example.demo.dto.note.response.NoteDetailResponse;
import com.example.demo.dto.note.response.NoteListItem;
import com.example.demo.dto.note.response.NoteListResponse;
import com.example.demo.dto.note.response.NoteReactionSummaryResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarTheme;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteCommentRepository;
import com.example.demo.repository.note.NoteRepository;
import com.example.demo.service.jar.JarOpenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NoteServiceTest {

    @Mock
    private NoteRepository noteRepository;

    @Mock
    private JarRepository jarRepository;

    @Mock
    private JarMemberRepository jarMemberRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private JarOpenService jarOpenService;

    private NoteService noteService;

    @Mock
    private NoteAttachmentService noteAttachmentService;

    @Mock
    private NoteReactionService noteReactionService;

    @Mock
    private NoteCommentService noteCommentService;

    @Mock
    private NoteCommentRepository noteCommentRepository;

    @BeforeEach
    void setUp() {
        // 가짜 Repository들을 넣어서 NoteService만 단독으로 테스트
        noteService = new NoteService(
                noteRepository,
                jarRepository,
                jarMemberRepository,
                userRepository,
                jarOpenService,
                noteAttachmentService,
                noteReactionService,
                noteCommentService
        );

        // 댓글/리액션을 사용하지 않는 기존 테스트도 기본값으로 안전하게 동작하도록 둔다.
        lenient().when(noteReactionService.getCountMapByNoteIds(anyList())).thenReturn(java.util.Map.of());
        lenient().when(noteReactionService.getMyReactionMapByNoteIds(anyLong(), anyList())).thenReturn(java.util.Map.of());
        lenient().when(noteReactionService.getSummary(anyLong(), anyLong(), anyLong()))
                .thenReturn(new NoteReactionSummaryResponse(null, null, List.of()));
        lenient().when(noteCommentService.getCommentCountMapByNoteIds(anyList())).thenReturn(java.util.Map.of());
        lenient().when(noteCommentService.countComments(anyLong())).thenReturn(0L);
    }

    @Test
    void createNote_정상작성_성공() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        User user = createUser(1L, "은서");
        Jar jar = createJar(10L, LocalDateTime.now().plusDays(10), JarLockLevel.META_ONLY);

        NoteCreateRequest request = new NoteCreateRequest(
                "제목이야",
                "오늘 정말 즐거운 하루였어!",
                LocalDate.of(2026, 3, 31),
                "서울",
                List.of(),
                List.of("여행", "행복", "사랑")

        );

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);

        // save(...) 안에 들어간 Note를 직접 잡아서 검사하기 위한 도구
        ArgumentCaptor<Note> captor = ArgumentCaptor.forClass(Note.class);

        Note savedNote = Note.builder()
                .jar(jar)
                .author(user)
                .title(request.title())
                .content(request.content())
                .isEncrypted(false)
                .noteDate(request.noteDate())
                .location(request.location())
                .tags(List.of("여행", "행복", "사랑"))
                .build();

        setNoteFields(savedNote, 100L,
                LocalDateTime.of(2026, 3, 31, 14, 0),
                LocalDateTime.of(2026, 3, 31, 14, 0));

        when(noteRepository.save(any(Note.class))).thenReturn(savedNote);

        // when
        NoteCreateResponse response = noteService.createNote(currentUserId, jarId, request);

        // then
        verify(noteRepository).save(captor.capture());

        Note capturedNote = captor.getValue();
        assertThat(capturedNote.getJar()).isEqualTo(jar);
        assertThat(capturedNote.getAuthor()).isEqualTo(user);
        assertThat(capturedNote.getTitle()).isEqualTo("제목이야");
        assertThat(capturedNote.getContent()).isEqualTo("오늘 정말 즐거운 하루였어!");
        assertThat(capturedNote.isEncrypted()).isFalse();
        assertThat(capturedNote.getNoteDate()).isEqualTo(LocalDate.of(2026, 3, 31));
        assertThat(capturedNote.getLocation()).isEqualTo("서울");
        assertThat(capturedNote.getTags()).containsExactly("여행", "행복", "사랑");
        assertThat(response.noteId()).isEqualTo(100L);
        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.authorId()).isEqualTo(1L);
        assertThat(response.title()).isEqualTo("제목이야");
        assertThat(response.content()).isEqualTo("오늘 정말 즐거운 하루였어!");
        assertThat(response.isEncrypted()).isFalse();
        assertThat(response.createdAt()).isEqualTo(OffsetDateTime.parse("2026-03-31T14:00:00+09:00"));
    }

    @Test
    void createNote_사용자가없으면_예외() {
        // given
        when(userRepository.findById(1L)).thenReturn(Optional.empty());

        NoteCreateRequest request = new NoteCreateRequest(
                "제목",
                "내용",
                LocalDate.of(2026, 3, 31),
                "서울",
                List.of(),
                List.of()
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> noteService.createNote(1L, 10L, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode().value()).isEqualTo(404);
        assertThat(ex.getReason()).contains("사용자를 찾을 수 없어");
        verifyNoInteractions(jarRepository, jarMemberRepository, noteRepository);
    }

    @Test
    void createNote_저금통이없으면_예외() {
        // given
        User user = createUser(1L, "은서");

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(10L)).thenReturn(Optional.empty());

        NoteCreateRequest request = new NoteCreateRequest(
                "제목",
                "내용",
                LocalDate.of(2026, 3, 31),
                "서울",
                List.of(),
                List.of()
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> noteService.createNote(1L, 10L, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode().value()).isEqualTo(404);
        assertThat(ex.getReason()).contains("저금통을 찾을 수 없어");
        verify(noteRepository, never()).save(any());
    }

    @Test
    void createNote_저금통멤버가아니면_예외() {
        // given
        User user = createUser(1L, "은서");
        Jar jar = createJar(10L, LocalDateTime.now().plusDays(10), JarLockLevel.META_ONLY);

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(10L)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(false);

        NoteCreateRequest request = new NoteCreateRequest(
                "제목",
                "내용",
                LocalDate.of(2026, 3, 31),
                "서울",
                List.of(),
                List.of()
        );

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> noteService.createNote(1L, 10L, request),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode().value()).isEqualTo(403);
        assertThat(ex.getReason()).contains("현재 저금통 멤버만 쪽지를 작성할 수 있어");
        verify(noteRepository, never()).save(any());
    }

    @Test
    void listNotes_오픈된저금통이면_실제내용과작성자정보를보여준다() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar openJar = createJar(10L, LocalDateTime.now().minusDays(1), JarLockLevel.HIDDEN);
        User author = createUser(2L, "현수");

        String longContent = "이 내용은 서른 글자가 넘어가도록 일부러 길게 만든 테스트 문장이야!";

        Note note = Note.builder()
                .jar(openJar)
                .author(author)
                .title("진짜 제목")
                .content(longContent)
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 20))
                .location("부산")
                .build();

        setNoteFields(note, 101L,
                LocalDateTime.of(2026, 3, 20, 9, 0),
                LocalDateTime.of(2026, 3, 20, 9, 5));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(openJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarId(eq(jarId), any()))
                .thenReturn(new PageImpl<>(List.of(note), PageRequest.of(0, 10), 1));
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(noteAttachmentService.getAttachmentsByNoteIds(anyList())).thenReturn(List.of());

        // when
        NoteListResponse response = noteService.listNotes(currentUserId, jarId, 0, 10);

        // then
        assertThat(response.items()).hasSize(1);

        NoteListItem item = response.items().get(0);
        assertThat(item.noteId()).isEqualTo(101L);
        assertThat(item.title()).isEqualTo("진짜 제목");
        assertThat(item.previewContent()).endsWith("...");
        assertThat(item.authorId()).isEqualTo(2L);
        assertThat(item.authorName()).isEqualTo("현수");
        assertThat(item.createdAt()).isEqualTo(OffsetDateTime.parse("2026-03-20T09:00:00+09:00"));
    }

    @Test
    void listNotes_오픈전_HIDDEN이면_거의다숨긴다() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar lockedJar = createJar(10L, LocalDateTime.now().plusDays(3), JarLockLevel.HIDDEN);
        User author = createUser(2L, "현수");

        Note note = Note.builder()
                .jar(lockedJar)
                .author(author)
                .title("숨겨질 제목")
                .content("숨겨질 내용")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 20))
                .location("부산")
                .build();

        setNoteFields(note, 102L,
                LocalDateTime.of(2026, 3, 20, 9, 0),
                LocalDateTime.of(2026, 3, 20, 9, 5));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(lockedJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarId(eq(jarId), any()))
                .thenReturn(new PageImpl<>(List.of(note), PageRequest.of(0, 10), 1));

        // when
        NoteListResponse response = noteService.listNotes(currentUserId, jarId, 0, 10);

        // then
        NoteListItem item = response.items().get(0);
        assertThat(item.title()).isEqualTo("오픈 전 쪽지");
        assertThat(item.previewContent()).isEqualTo("아직 열리기 전이야.");
        assertThat(item.noteDate()).isNull();
        assertThat(item.location()).isNull();
        assertThat(item.authorId()).isNull();
        assertThat(item.authorName()).isNull();
        assertThat(item.createdAt()).isNull();
    }

    @Test
    void listNotes_오픈전_META_ONLY면_날짜와장소만보여준다() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar lockedJar = createJar(10L, LocalDateTime.now().plusDays(3), JarLockLevel.META_ONLY);
        User author = createUser(2L, "현수");

        Note note = Note.builder()
                .jar(lockedJar)
                .author(author)
                .title("숨겨질 제목")
                .content("숨겨질 내용")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 20))
                .location("부산")
                .build();

        setNoteFields(note, 103L,
                LocalDateTime.of(2026, 3, 20, 9, 0),
                LocalDateTime.of(2026, 3, 20, 9, 5));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(lockedJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarId(eq(jarId), any()))
                .thenReturn(new PageImpl<>(List.of(note), PageRequest.of(0, 10), 1));

        // when
        NoteListResponse response = noteService.listNotes(currentUserId, jarId, 0, 10);

        // then
        NoteListItem item = response.items().get(0);
        assertThat(item.title()).isEqualTo("오픈 전 쪽지");
        assertThat(item.previewContent()).isEqualTo("아직 내용은 비밀이야.");
        assertThat(item.noteDate()).isEqualTo(LocalDate.of(2026, 3, 20));
        assertThat(item.location()).isEqualTo("부산");
        assertThat(item.authorId()).isNull();
        assertThat(item.authorName()).isNull();
        assertThat(item.createdAt()).isEqualTo(OffsetDateTime.parse("2026-03-20T09:00:00+09:00"));
    }

    @Test
    void listNotes_오픈전_TITLE_ONLY면_제목만보여준다() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar lockedJar = createJar(10L, LocalDateTime.now().plusDays(3), JarLockLevel.TITLE_ONLY);
        User author = createUser(2L, "현수");

        Note note = Note.builder()
                .jar(lockedJar)
                .author(author)
                .title("보이는 제목")
                .content("숨겨질 내용")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 20))
                .location("부산")
                .build();

        setNoteFields(note, 104L,
                LocalDateTime.of(2026, 3, 20, 9, 0),
                LocalDateTime.of(2026, 3, 20, 9, 5));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(lockedJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarId(eq(jarId), any()))
                .thenReturn(new PageImpl<>(List.of(note), PageRequest.of(0, 10), 1));

        // when
        NoteListResponse response = noteService.listNotes(currentUserId, jarId, 0, 10);

        // then
        NoteListItem item = response.items().get(0);
        assertThat(item.title()).isEqualTo("보이는 제목");
        assertThat(item.previewContent()).isEqualTo("아직 내용은 비밀이야.");
        assertThat(item.noteDate()).isEqualTo(LocalDate.of(2026, 3, 20));
        assertThat(item.location()).isEqualTo("부산");
        assertThat(item.authorId()).isNull();
        assertThat(item.authorName()).isNull();
    }

    @Test
    void getNoteDetail_오픈된저금통이면_전체내용을보여준다() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 200L;

        Jar openJar = createJar(10L, LocalDateTime.now().minusDays(1), JarLockLevel.HIDDEN);
        User author = createUser(2L, "현수");

        Note note = Note.builder()
                .jar(openJar)
                .author(author)
                .title("상세 제목")
                .content("상세 내용 전체")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 25))
                .location("제주")
                .build();

        setNoteFields(note, 200L,
                LocalDateTime.of(2026, 3, 25, 10, 0),
                LocalDateTime.of(2026, 3, 25, 11, 0));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(openJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(noteAttachmentService.getAttachments(noteId)).thenReturn(List.of());

        // when
        NoteDetailResponse response = noteService.getNoteDetail(currentUserId, jarId, noteId);

        // then
        assertThat(response.noteId()).isEqualTo(200L);
        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.authorId()).isEqualTo(2L);
        assertThat(response.authorName()).isEqualTo("현수");
        assertThat(response.title()).isEqualTo("상세 제목");
        assertThat(response.content()).isEqualTo("상세 내용 전체");
        assertThat(response.noteDate()).isEqualTo(LocalDate.of(2026, 3, 25));
        assertThat(response.location()).isEqualTo("제주");
        assertThat(response.createdAt()).isEqualTo(OffsetDateTime.parse("2026-03-25T10:00:00+09:00"));
        assertThat(response.updatedAt()).isEqualTo(OffsetDateTime.parse("2026-03-25T11:00:00+09:00"));
    }

    @Test
    void getNoteDetail_오픈전_HIDDEN이면_상세도거의다숨긴다() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 201L;

        Jar lockedJar = createJar(10L, LocalDateTime.now().plusDays(5), JarLockLevel.HIDDEN);
        User author = createUser(2L, "현수");

        Note note = Note.builder()
                .jar(lockedJar)
                .author(author)
                .title("숨김 제목")
                .content("숨김 내용")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 25))
                .location("제주")
                .build();

        setNoteFields(note, 201L,
                LocalDateTime.of(2026, 3, 25, 10, 0),
                LocalDateTime.of(2026, 3, 25, 11, 0));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(lockedJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));

        // when
        NoteDetailResponse response = noteService.getNoteDetail(currentUserId, jarId, noteId);

        // then
        assertThat(response.authorId()).isNull();
        assertThat(response.authorName()).isNull();
        assertThat(response.title()).isEqualTo("오픈 전 쪽지");
        assertThat(response.content()).isEqualTo("오픈 전이라 아직 내용을 볼 수 없어.");
        assertThat(response.noteDate()).isNull();
        assertThat(response.location()).isNull();
        assertThat(response.createdAt()).isNull();
        assertThat(response.updatedAt()).isNull();
    }

    @Test
    void getNoteDetail_오픈전_META_ONLY면_날짜장소는보여준다() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 202L;

        Jar lockedJar = createJar(10L, LocalDateTime.now().plusDays(5), JarLockLevel.META_ONLY);
        User author = createUser(2L, "현수");

        Note note = Note.builder()
                .jar(lockedJar)
                .author(author)
                .title("숨김 제목")
                .content("숨김 내용")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 25))
                .location("제주")
                .build();

        setNoteFields(note, 202L,
                LocalDateTime.of(2026, 3, 25, 10, 0),
                LocalDateTime.of(2026, 3, 25, 11, 0));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(lockedJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));

        // when
        NoteDetailResponse response = noteService.getNoteDetail(currentUserId, jarId, noteId);

        // then
        assertThat(response.authorId()).isNull();
        assertThat(response.authorName()).isNull();
        assertThat(response.title()).isEqualTo("오픈 전 쪽지");
        assertThat(response.content()).isEqualTo("오픈 전이라 아직 내용을 볼 수 없어.");
        assertThat(response.noteDate()).isEqualTo(LocalDate.of(2026, 3, 25));
        assertThat(response.location()).isEqualTo("제주");
        assertThat(response.createdAt()).isEqualTo(OffsetDateTime.parse("2026-03-25T10:00:00+09:00"));
        assertThat(response.updatedAt()).isEqualTo(OffsetDateTime.parse("2026-03-25T11:00:00+09:00"));
    }

    @Test
    void getNoteDetail_오픈전_TITLE_ONLY면_제목만보여준다() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 203L;

        Jar lockedJar = createJar(10L, LocalDateTime.now().plusDays(5), JarLockLevel.TITLE_ONLY);
        User author = createUser(2L, "현수");

        Note note = Note.builder()
                .jar(lockedJar)
                .author(author)
                .title("보이는 제목")
                .content("숨김 내용")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 25))
                .location("제주")
                .build();

        setNoteFields(note, 203L,
                LocalDateTime.of(2026, 3, 25, 10, 0),
                LocalDateTime.of(2026, 3, 25, 11, 0));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(lockedJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));

        // when
        NoteDetailResponse response = noteService.getNoteDetail(currentUserId, jarId, noteId);

        // then
        assertThat(response.authorId()).isNull();
        assertThat(response.authorName()).isNull();
        assertThat(response.title()).isEqualTo("보이는 제목");
        assertThat(response.content()).isEqualTo("오픈 전이라 아직 내용을 볼 수 없어.");
        assertThat(response.noteDate()).isEqualTo(LocalDate.of(2026, 3, 25));
        assertThat(response.location()).isEqualTo("제주");
    }

    @Test
    void getNoteDetail_쪽지가없으면_예외() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 999L;

        Jar jar = createJar(10L, LocalDateTime.now().minusDays(1), JarLockLevel.HIDDEN);

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.empty());

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> noteService.getNoteDetail(currentUserId, jarId, noteId),
                ResponseStatusException.class
        );

        // then
        assertThat(ex.getStatusCode().value()).isEqualTo(404);
        assertThat(ex.getReason()).contains("쪽지를 찾을 수 없어");
    }

    @Test
    @DisplayName("잠금 상태 목록 조회 - 첨부를 불필요하게 조회하지 않는다")
    void listNotes_lockedJar_doesNotLoadAttachments() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar jar = mock(Jar.class);
        when(jar.getJarId()).thenReturn(jarId);
        when(jar.getLockLevel()).thenReturn(JarLockLevel.HIDDEN);

        Note note = mock(Note.class);
        when(note.getNoteId()).thenReturn(100L);
        when(note.isEncrypted()).thenReturn(false);

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);

        when(noteRepository.findByJarId(eq(jarId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(note), PageRequest.of(0, 10), 1));

        // 잠금 상태
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(false);

        // when
        NoteListResponse response = noteService.listNotes(currentUserId, jarId, 0, 10);

        // then
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).attachments()).isEmpty();

        verify(noteAttachmentService, never()).getAttachmentsByNoteIds(anyList());
    }

    @Test
    @DisplayName("쪽지 작성 성공 - 첨부가 있으면 첨부 연결 서비스를 호출한다")
    void createNote_withAttachments_callsAttachmentService() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        User user = createUser(1L, "은서");
        Jar jar = createJar(10L, LocalDateTime.now().plusDays(10), JarLockLevel.META_ONLY);

        List<NoteAttachmentCreateRequest> attachments = List.of(
                new NoteAttachmentCreateRequest("notes/10/file1.png"),
                new NoteAttachmentCreateRequest("notes/10/file2.png")
        );

        NoteCreateRequest request = new NoteCreateRequest(
                "첨부 있는 제목",
                "첨부 있는 내용",
                LocalDate.of(2026, 3, 31),
                "서울",
                attachments,
                List.of("여행")
        );

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);

        Note savedNote = Note.builder()
                .jar(jar)
                .author(user)
                .title(request.title())
                .content(request.content())
                .isEncrypted(false)
                .noteDate(request.noteDate())
                .location(request.location())
                .tags(List.of("여행"))
                .build();

        setNoteFields(savedNote, 555L,
                LocalDateTime.of(2026, 3, 31, 14, 0),
                LocalDateTime.of(2026, 3, 31, 14, 0));

        when(noteRepository.save(any(Note.class))).thenReturn(savedNote);

        // when
        noteService.createNote(currentUserId, jarId, request);

        // then
        verify(noteAttachmentService).createAttachments(
                currentUserId,
                555L,
                attachments
        );
    }

    @Test
    @DisplayName("오픈된 목록 조회 - 첨부를 한 번에 조회한다")
    void listNotes_openJar_loadsAttachments() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar openJar = createJar(10L, LocalDateTime.now().minusDays(1), JarLockLevel.HIDDEN);
        User author = createUser(2L, "현수");

        Note note = Note.builder()
                .jar(openJar)
                .author(author)
                .title("진짜 제목")
                .content("진짜 내용")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 3, 20))
                .location("부산")
                .build();

        setNoteFields(note, 101L,
                LocalDateTime.of(2026, 3, 20, 9, 0),
                LocalDateTime.of(2026, 3, 20, 9, 5));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(openJar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarId(eq(jarId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(note), PageRequest.of(0, 10), 1));
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(noteAttachmentService.getAttachmentsByNoteIds(List.of(101L))).thenReturn(List.of());

        // when
        noteService.listNotes(currentUserId, jarId, 0, 10);

        // then
        verify(noteAttachmentService).getAttachmentsByNoteIds(List.of(101L));
    }

    private User createUser(Long id, String name) {
        return User.builder()
                .id(id)
                .email("test@test.com")
                .name(name)
                .birthyear("2000")
                .provider("NAVER")
                .providerId("naver-" + id)
                .build();
    }

    private Jar createJar(Long jarId, LocalDateTime openAt, JarLockLevel lockLevel) {
        Jar jar = Jar.builder()
                .owner(createUser(999L, "방장"))
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(2)
                .openAt(openAt)
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(lockLevel)
                .build();

        ReflectionTestUtils.setField(jar, "jarId", jarId);
        return jar;
    }

    private void setNoteFields(Note note, Long noteId, LocalDateTime createdAt, LocalDateTime updatedAt) {
        ReflectionTestUtils.setField(note, "noteId", noteId);
        ReflectionTestUtils.setField(note, "createdAt", createdAt);
        ReflectionTestUtils.setField(note, "updatedAt", updatedAt);
    }
}
