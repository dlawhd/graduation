package com.example.demo.service.note;

import com.example.demo.dto.note.request.NoteCommentCreateRequest;
import com.example.demo.dto.note.request.NoteCommentUpdateRequest;
import com.example.demo.dto.note.response.NoteCommentItem;
import com.example.demo.dto.note.response.NoteCommentListResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteComment;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarTheme;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteCommentRepository;
import com.example.demo.repository.note.NoteRepository;
import com.example.demo.service.notification.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NoteCommentServiceTest {

    @Mock
    private NoteCommentRepository noteCommentRepository;

    @Mock
    private NoteRepository noteRepository;

    @Mock
    private JarRepository jarRepository;

    @Mock
    private JarMemberRepository jarMemberRepository;

    @Mock
    private UserRepository userRepository;

    private NoteCommentService noteCommentService;

    @Mock
    private NotificationService notificationService;

    @BeforeEach
    void setUp() {
        noteCommentService = new NoteCommentService(
                noteCommentRepository,
                noteRepository,
                jarRepository,
                jarMemberRepository,
                userRepository,
                notificationService
        );
    }

    @Test
    @DisplayName("댓글 생성 성공")
    void createComment_success() {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;

        User user = createUser(currentUserId, "댓글러");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteCommentRepository.save(any(NoteComment.class))).thenAnswer(invocation -> {
            NoteComment comment = invocation.getArgument(0);
            ReflectionTestUtils.setField(comment, "commentId", 300L);
            ReflectionTestUtils.setField(comment, "createdAt", LocalDateTime.of(2026, 4, 15, 10, 0));
            ReflectionTestUtils.setField(comment, "updatedAt", LocalDateTime.of(2026, 4, 15, 10, 0));
            return comment;
        });

        NoteCommentItem response = noteCommentService.createComment(
                currentUserId,
                jarId,
                noteId,
                new NoteCommentCreateRequest("  댓글입니다  ", null)
        );

        ArgumentCaptor<NoteComment> captor = ArgumentCaptor.forClass(NoteComment.class);
        verify(noteCommentRepository).save(captor.capture());

        assertThat(captor.getValue().getContent()).isEqualTo("댓글입니다");
        assertThat(response.commentId()).isEqualTo(300L);
        assertThat(response.content()).isEqualTo("댓글입니다");
    }

    @Test
    @DisplayName("댓글 목록 조회 성공")
    void getCommentList_success() {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;

        User user = createUser(currentUserId, "댓글러");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);
        NoteComment comment = createComment(300L, note, user, "첫 댓글");

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteCommentRepository.findByNote_NoteIdOrderByCreatedAtAscCommentIdAsc(noteId))
                .thenReturn(List.of(comment));

        NoteCommentListResponse response = noteCommentService.getCommentList(currentUserId, jarId, noteId);

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).content()).isEqualTo("첫 댓글");
    }

    @Test
    @DisplayName("대댓글 생성 성공")
    void createComment_success_whenParentCommentExists() {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        Long parentCommentId = 300L;

        User user = createUser(currentUserId, "댓글러");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);
        NoteComment parentComment = createComment(parentCommentId, note, user, "부모 댓글");

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteCommentRepository.findByCommentIdAndNote_NoteId(parentCommentId, noteId))
                .thenReturn(Optional.of(parentComment));
        when(noteCommentRepository.save(any(NoteComment.class))).thenAnswer(invocation -> {
            NoteComment comment = invocation.getArgument(0);
            ReflectionTestUtils.setField(comment, "commentId", 301L);
            ReflectionTestUtils.setField(comment, "createdAt", LocalDateTime.of(2026, 4, 15, 10, 10));
            ReflectionTestUtils.setField(comment, "updatedAt", LocalDateTime.of(2026, 4, 15, 10, 10));
            return comment;
        });

        NoteCommentItem response = noteCommentService.createComment(
                currentUserId,
                jarId,
                noteId,
                new NoteCommentCreateRequest("  답글입니다  ", parentCommentId)
        );

        ArgumentCaptor<NoteComment> captor = ArgumentCaptor.forClass(NoteComment.class);
        verify(noteCommentRepository).save(captor.capture());

        assertThat(captor.getValue().getParentComment()).isEqualTo(parentComment);
        assertThat(response.parentCommentId()).isEqualTo(parentCommentId);
        assertThat(response.content()).isEqualTo("답글입니다");
        assertThat(response.replies()).isEmpty();
    }

    @Test
    @DisplayName("대댓글 아래 대댓글 생성 차단")
    void createComment_badRequest_whenParentCommentIsReply() {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        Long rootCommentId = 300L;
        Long replyCommentId = 301L;

        User user = createUser(currentUserId, "댓글러");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);
        NoteComment rootComment = createComment(rootCommentId, note, user, "부모 댓글");
        NoteComment replyComment = createReply(replyCommentId, note, user, "대댓글", rootComment);

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteCommentRepository.findByCommentIdAndNote_NoteId(replyCommentId, noteId))
                .thenReturn(Optional.of(replyComment));

        ResponseStatusException exception = catchThrowableOfType(
                () -> noteCommentService.createComment(
                        currentUserId,
                        jarId,
                        noteId,
                        new NoteCommentCreateRequest("막힌 답글", replyCommentId)
                ),
                ResponseStatusException.class
        );

        assertThat(exception.getStatusCode().value()).isEqualTo(400);
        verify(noteCommentRepository, never()).save(any());
    }

    @Test
    @DisplayName("댓글 수정 성공")
    void updateComment_success() {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        Long commentId = 300L;

        User user = createUser(currentUserId, "댓글러");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);
        NoteComment comment = createComment(commentId, note, user, "원본");

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteCommentRepository.findByCommentIdAndNote_NoteId(commentId, noteId)).thenReturn(Optional.of(comment));

        NoteCommentItem response = noteCommentService.updateComment(
                currentUserId,
                jarId,
                noteId,
                commentId,
                new NoteCommentUpdateRequest("  수정본  ")
        );

        assertThat(comment.getContent()).isEqualTo("수정본");
        assertThat(response.content()).isEqualTo("수정본");
    }

    @Test
    @DisplayName("댓글 삭제 차단 - 작성자가 아니면 403")
    void deleteComment_forbidden_whenNotOwner() {
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        Long commentId = 300L;

        User loginUser = createUser(currentUserId, "로그인유저");
        User author = createUser(2L, "작성자");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, author);
        NoteComment comment = createComment(commentId, note, author, "남의 댓글");

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(loginUser));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteCommentRepository.findByCommentIdAndNote_NoteId(commentId, noteId)).thenReturn(Optional.of(comment));

        ResponseStatusException exception = catchThrowableOfType(
                () -> noteCommentService.deleteComment(currentUserId, jarId, noteId, commentId),
                ResponseStatusException.class
        );

        assertThat(exception.getStatusCode().value()).isEqualTo(403);
        assertThat(exception.getReason()).contains("본인");
        verify(noteCommentRepository, never()).delete(any());
    }

    @Test
    @DisplayName("댓글 개수 맵 조회 성공")
    void getCommentCountMapByNoteIds_success() {
        when(noteCommentRepository.countByNote_NoteId(10L)).thenReturn(2L);
        when(noteCommentRepository.countByNote_NoteId(11L)).thenReturn(0L);

        var result = noteCommentService.getCommentCountMapByNoteIds(List.of(10L, 11L));

        assertThat(result).containsEntry(10L, 2L);
        assertThat(result).containsEntry(11L, 0L);
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

    private Jar createJar(Long jarId) {
        Jar jar = Jar.builder()
                .owner(createUser(999L, "방장"))
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.COUPLE)
                .maxMembers(4)
                .openAt(LocalDateTime.now().plusDays(1))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();

        ReflectionTestUtils.setField(jar, "jarId", jarId);
        return jar;
    }

    private Note createNote(Long noteId, Jar jar, User author) {
        Note note = Note.builder()
                .jar(jar)
                .author(author)
                .title("제목")
                .content("내용")
                .isEncrypted(false)
                .noteDate(LocalDate.of(2026, 4, 1))
                .location("서울")
                .tags(List.of("추억"))
                .build();

        ReflectionTestUtils.setField(note, "noteId", noteId);
        return note;
    }

    private NoteComment createComment(Long commentId, Note note, User user, String content) {
        NoteComment comment = NoteComment.builder()
                .note(note)
                .user(user)
                .content(content)
                .build();

        ReflectionTestUtils.setField(comment, "commentId", commentId);
        ReflectionTestUtils.setField(comment, "createdAt", LocalDateTime.of(2026, 4, 15, 10, 0));
        ReflectionTestUtils.setField(comment, "updatedAt", LocalDateTime.of(2026, 4, 15, 10, 0));
        return comment;
    }

    private NoteComment createReply(
            Long commentId,
            Note note,
            User user,
            String content,
            NoteComment parentComment
    ) {
        NoteComment comment = NoteComment.builder()
                .note(note)
                .user(user)
                .content(content)
                .parentComment(parentComment)
                .build();

        ReflectionTestUtils.setField(comment, "commentId", commentId);
        ReflectionTestUtils.setField(comment, "createdAt", LocalDateTime.of(2026, 4, 15, 10, 10));
        ReflectionTestUtils.setField(comment, "updatedAt", LocalDateTime.of(2026, 4, 15, 10, 10));
        return comment;
    }
}
