package shop.esjh.memoryjar.service.note;

import shop.esjh.memoryjar.dto.note.request.NoteCommentCreateRequest;
import shop.esjh.memoryjar.dto.note.request.NoteCommentUpdateRequest;
import shop.esjh.memoryjar.dto.note.response.NoteCommentItem;
import shop.esjh.memoryjar.dto.note.response.NoteCommentListResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteComment;
import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarTheme;
import shop.esjh.memoryjar.enums.note.NoteRealtimeEventType;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.repository.note.NoteCommentRepository;
import shop.esjh.memoryjar.repository.note.NoteRepository;
import shop.esjh.memoryjar.service.notification.NotificationService;
import shop.esjh.memoryjar.dto.note.response.NoteRealtimeEventResponse;

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
import static org.mockito.ArgumentMatchers.eq;

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

    @Mock
    private NoteRealtimeService noteRealtimeService;
    @BeforeEach
    void setUp() {
        noteCommentService = new NoteCommentService(
                noteCommentRepository,
                noteRepository,
                jarRepository,
                jarMemberRepository,
                userRepository,
                notificationService,
                noteRealtimeService
        );
    }

    @Test
    @DisplayName("댓글 생성 성공 - 최신 댓글 개수를 WebSocket 이벤트에 담는다")
    void createComment_success() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;

        User user = createUser(currentUserId, "댓글러");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);

        // 현재 로그인한 사용자를 정상적으로 찾는 상황
        when(userRepository.findById(currentUserId))
                .thenReturn(Optional.of(user));

        // 요청한 저금통을 정상적으로 찾는 상황
        when(jarRepository.findByJarId(jarId))
                .thenReturn(Optional.of(jar));

        // 로그인한 사용자가 현재 저금통의 활성 멤버인 상황
        when(
                jarMemberRepository
                        .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(
                                jarId,
                                currentUserId
                        )
        ).thenReturn(true);

        // 요청한 쪽지가 현재 저금통에 존재하는 상황
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId))
                .thenReturn(Optional.of(note));

        /*
         * 댓글 저장 시 DB가 commentId와 시간을 채워준 것처럼 만든다.
         */
        when(noteCommentRepository.save(any(NoteComment.class)))
                .thenAnswer(invocation -> {
                    NoteComment comment = invocation.getArgument(0);

                    ReflectionTestUtils.setField(
                            comment,
                            "commentId",
                            300L
                    );

                    ReflectionTestUtils.setField(
                            comment,
                            "createdAt",
                            LocalDateTime.of(2026, 4, 15, 10, 0)
                    );

                    ReflectionTestUtils.setField(
                            comment,
                            "updatedAt",
                            LocalDateTime.of(2026, 4, 15, 10, 0)
                    );

                    return comment;
                });

        /*
         * 새 댓글까지 DB에 반영된 이후
         * 해당 쪽지의 최신 댓글 개수가 1개라고 가정한다.
         */
        when(noteCommentRepository.countByNote_NoteId(noteId))
                .thenReturn(1L);

        // when
        NoteCommentItem response =
                noteCommentService.createComment(
                        currentUserId,
                        jarId,
                        noteId,
                        new NoteCommentCreateRequest(
                                "  댓글입니다  ",
                                null
                        )
                );

        // then
        /*
         * 저장된 댓글 엔티티를 꺼내서
         * 앞뒤 공백이 잘 제거됐는지 확인한다.
         */
        ArgumentCaptor<NoteComment> commentCaptor =
                ArgumentCaptor.forClass(NoteComment.class);

        verify(noteCommentRepository)
                .save(commentCaptor.capture());

        assertThat(commentCaptor.getValue().getContent())
                .isEqualTo("댓글입니다");

        assertThat(response.commentId())
                .isEqualTo(300L);

        assertThat(response.content())
                .isEqualTo("댓글입니다");

        /*
         * 저장 내용을 DB에 반영한 뒤
         * 최신 댓글 개수를 조회했는지 확인한다.
         */
        verify(noteCommentRepository).flush();

        verify(noteCommentRepository)
                .countByNote_NoteId(noteId);

        /*
         * WebSocket으로 전달한 이벤트를 꺼낸다.
         */
        ArgumentCaptor<NoteRealtimeEventResponse> eventCaptor =
                ArgumentCaptor.forClass(
                        NoteRealtimeEventResponse.class
                );

        verify(noteRealtimeService)
                .sendNoteEventAfterCommit(
                        eq(jarId),
                        eq(noteId),
                        eventCaptor.capture()
                );

        NoteRealtimeEventResponse sentEvent =
                eventCaptor.getValue();

        /*
         * 100번 쪽지에 댓글이 생성됐으며
         * 최신 댓글 개수 1개가 담겼는지 확인한다.
         */
        assertThat(sentEvent.jarId())
                .isEqualTo(jarId);

        assertThat(sentEvent.noteId())
                .isEqualTo(noteId);

        assertThat(sentEvent.type())
                .isEqualTo(
                        NoteRealtimeEventType.COMMENT_CREATED
                );

        assertThat(sentEvent.actorUserId())
                .isEqualTo(currentUserId);

        assertThat(sentEvent.commentId())
                .isEqualTo(300L);

        assertThat(sentEvent.parentCommentId())
                .isNull();

        assertThat(sentEvent.commentCount())
                .isEqualTo(1L);
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
    @DisplayName("대댓글 생성 성공 - 최신 댓글 개수를 WebSocket 이벤트에 담는다")
    void createComment_success_whenParentCommentExists() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        Long parentCommentId = 300L;

        User user = createUser(currentUserId, "댓글러");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);

        NoteComment parentComment =
                createComment(
                        parentCommentId,
                        note,
                        user,
                        "부모 댓글"
                );

        when(userRepository.findById(currentUserId))
                .thenReturn(Optional.of(user));

        when(jarRepository.findByJarId(jarId))
                .thenReturn(Optional.of(jar));

        when(
                jarMemberRepository
                        .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(
                                jarId,
                                currentUserId
                        )
        ).thenReturn(true);

        when(noteRepository.findByJarIdAndNoteId(jarId, noteId))
                .thenReturn(Optional.of(note));

        /*
         * 사용자가 선택한 부모 댓글이
         * 현재 쪽지 안에 존재한다고 가정한다.
         */
        when(
                noteCommentRepository
                        .findByCommentIdAndNote_NoteId(
                                parentCommentId,
                                noteId
                        )
        ).thenReturn(Optional.of(parentComment));

        /*
         * 대댓글이 저장되면 commentId와 시간이 생긴 것처럼 만든다.
         */
        when(noteCommentRepository.save(any(NoteComment.class)))
                .thenAnswer(invocation -> {
                    NoteComment comment = invocation.getArgument(0);

                    ReflectionTestUtils.setField(
                            comment,
                            "commentId",
                            301L
                    );

                    ReflectionTestUtils.setField(
                            comment,
                            "createdAt",
                            LocalDateTime.of(
                                    2026,
                                    4,
                                    15,
                                    10,
                                    10
                            )
                    );

                    ReflectionTestUtils.setField(
                            comment,
                            "updatedAt",
                            LocalDateTime.of(
                                    2026,
                                    4,
                                    15,
                                    10,
                                    10
                            )
                    );

                    return comment;
                });

        /*
         * 부모 댓글 1개와 새 대댓글 1개를 합쳐
         * 최신 댓글 총개수가 2개라고 가정한다.
         */
        when(noteCommentRepository.countByNote_NoteId(noteId))
                .thenReturn(2L);

        // when
        NoteCommentItem response =
                noteCommentService.createComment(
                        currentUserId,
                        jarId,
                        noteId,
                        new NoteCommentCreateRequest(
                                "  답글입니다  ",
                                parentCommentId
                        )
                );

        // then
        ArgumentCaptor<NoteComment> commentCaptor =
                ArgumentCaptor.forClass(NoteComment.class);

        verify(noteCommentRepository)
                .save(commentCaptor.capture());

        assertThat(
                commentCaptor
                        .getValue()
                        .getParentComment()
        ).isEqualTo(parentComment);

        assertThat(response.parentCommentId())
                .isEqualTo(parentCommentId);

        assertThat(response.content())
                .isEqualTo("답글입니다");

        assertThat(response.replies())
                .isEmpty();

        /*
         * 대댓글 저장 후에도 DB 반영과 최신 개수 조회가
         * 실행됐는지 확인한다.
         */
        verify(noteCommentRepository).flush();

        verify(noteCommentRepository)
                .countByNote_NoteId(noteId);

        ArgumentCaptor<NoteRealtimeEventResponse> eventCaptor =
                ArgumentCaptor.forClass(
                        NoteRealtimeEventResponse.class
                );

        verify(noteRealtimeService)
                .sendNoteEventAfterCommit(
                        eq(jarId),
                        eq(noteId),
                        eventCaptor.capture()
                );

        NoteRealtimeEventResponse sentEvent =
                eventCaptor.getValue();

        /*
         * 일반 댓글이 아니라
         * 대댓글 이벤트가 생성됐는지 확인한다.
         */
        assertThat(sentEvent.type())
                .isEqualTo(
                        NoteRealtimeEventType.COMMENT_REPLIED
                );

        assertThat(sentEvent.commentId())
                .isEqualTo(301L);

        assertThat(sentEvent.parentCommentId())
                .isEqualTo(parentCommentId);

        assertThat(sentEvent.commentCount())
                .isEqualTo(2L);
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
    @DisplayName("댓글 삭제 성공 - 삭제 후 최신 댓글 개수를 WebSocket 이벤트에 담는다")
    void deleteComment_success() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        Long commentId = 300L;

        User user = createUser(currentUserId, "댓글러");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);

        NoteComment comment =
                createComment(
                        commentId,
                        note,
                        user,
                        "삭제할 댓글"
                );

        when(userRepository.findById(currentUserId))
                .thenReturn(Optional.of(user));

        when(jarRepository.findByJarId(jarId))
                .thenReturn(Optional.of(jar));

        when(
                jarMemberRepository
                        .existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(
                                jarId,
                                currentUserId
                        )
        ).thenReturn(true);

        when(noteRepository.findByJarIdAndNoteId(jarId, noteId))
                .thenReturn(Optional.of(note));

        when(
                noteCommentRepository
                        .findByCommentIdAndNote_NoteId(
                                commentId,
                                noteId
                        )
        ).thenReturn(Optional.of(comment));

        /*
         * 삭제하려는 댓글 아래에 답글이 없는 상황이다.
         */
        when(
                noteCommentRepository
                        .findByParentComment_CommentIdOrderByCreatedAtAscCommentIdAsc(
                                commentId
                        )
        ).thenReturn(List.of());

        /*
         * 댓글 삭제 후 남아 있는 댓글 개수가 0개라고 가정한다.
         */
        when(noteCommentRepository.countByNote_NoteId(noteId))
                .thenReturn(0L);

        // when
        noteCommentService.deleteComment(
                currentUserId,
                jarId,
                noteId,
                commentId
        );

        // then
        /*
         * 실제 삭제 메서드가 호출됐는지 확인한다.
         */
        verify(noteCommentRepository)
                .delete(comment);

        /*
         * 삭제 내용을 반영한 뒤 최신 댓글 개수를
         * 다시 조회했는지 확인한다.
         */
        verify(noteCommentRepository).flush();

        verify(noteCommentRepository)
                .countByNote_NoteId(noteId);

        ArgumentCaptor<NoteRealtimeEventResponse> eventCaptor =
                ArgumentCaptor.forClass(
                        NoteRealtimeEventResponse.class
                );

        verify(noteRealtimeService)
                .sendNoteEventAfterCommit(
                        eq(jarId),
                        eq(noteId),
                        eventCaptor.capture()
                );

        NoteRealtimeEventResponse sentEvent =
                eventCaptor.getValue();

        /*
         * 삭제 이벤트에 삭제 후 댓글 개수 0이 담겼는지 확인한다.
         */
        assertThat(sentEvent.type())
                .isEqualTo(
                        NoteRealtimeEventType.COMMENT_DELETED
                );

        assertThat(sentEvent.commentId())
                .isEqualTo(commentId);

        assertThat(sentEvent.parentCommentId())
                .isNull();

        assertThat(sentEvent.commentCount())
                .isEqualTo(0L);
    }

    @Test
    @DisplayName("댓글 개수 맵 조회 성공 - 여러 쪽지의 댓글 수를 batch로 조회한다")
    void getCommentCountMapByNoteIds_success() {
        // given
        // 10번 쪽지는 댓글 2개, 11번 쪽지는 댓글 0개인 상황이다.
        // 실제 batch 쿼리는 댓글이 있는 10번 쪽지만 결과로 돌려줄 수 있다.
        when(noteCommentRepository.countCommentsByNoteIds(List.of(10L, 11L)))
                .thenReturn(List.of(commentCountView(10L, 2L)));

        // when
        var result = noteCommentService.getCommentCountMapByNoteIds(List.of(10L, 11L));

        // then
        assertThat(result).containsEntry(10L, 2L);
        assertThat(result).containsEntry(11L, 0L);

        // 이번 개선의 핵심: 쪽지마다 count 쿼리를 반복하지 않는다.
        verify(noteCommentRepository).countCommentsByNoteIds(List.of(10L, 11L));
        verify(noteCommentRepository, never()).countByNote_NoteId(10L);
        verify(noteCommentRepository, never()).countByNote_NoteId(11L);
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
                .theme(JarTheme.SPRING)
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

    private NoteCommentRepository.CommentCountView commentCountView(Long noteId, Long commentCount) {
        return new NoteCommentRepository.CommentCountView() {
            @Override
            public Long getNoteId() {
                return noteId;
            }

            @Override
            public Long getCommentCount() {
                return commentCount;
            }
        };
    }
}
