package com.example.demo.service.note;

import com.example.demo.dto.note.response.NoteReactionCountItem;
import com.example.demo.dto.note.response.NoteReactionSummaryResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteReaction;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarTheme;
import com.example.demo.enums.note.NoteReactionEmoji;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.repository.note.NoteReactionRepository;
import com.example.demo.repository.note.NoteRepository;
import com.example.demo.service.jar.JarOpenService;
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
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

// 이 테스트는 NoteReactionService의 핵심 규칙이 맞는지 확인하는 역할을 한다.
// 리액션은 "처음 누르면 생성", "같은 걸 다시 누르면 취소", "다른 걸 누르면 변경" 규칙이 중요해서
// 그 흐름이 서비스에서 안전하게 지켜지는지 먼저 막아두기 위해 만든다.
@ExtendWith(MockitoExtension.class)
class NoteReactionServiceTest {

    @Mock
    private NoteReactionRepository noteReactionRepository;

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

    @Mock
    private NoteReactionService noteReactionService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private NoteRealtimeService noteRealtimeService;

    @BeforeEach
    void setUp() {
        // 다른 계층 없이 서비스 규칙만 보기 위해 mock repository로 서비스를 만든다.
        noteReactionService = new NoteReactionService(
                noteReactionRepository,
                noteRepository,
                jarRepository,
                jarMemberRepository,
                userRepository,
                jarOpenService,
                notificationService,
                noteRealtimeService
        );
    }

    @Test
    @DisplayName("리액션 생성 - 아직 누른 리액션이 없으면 새 리액션을 저장한다")
    void react_createsNewReactionWhenNothingExists() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;

        User user = createUser(currentUserId, "테스터");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteReactionRepository.findByNote_NoteIdAndUser_Id(noteId, currentUserId))
                .thenReturn(Optional.empty());
        when(noteReactionRepository.countGroupedByNoteId(noteId))
                .thenReturn(List.of(reactionCountRow(noteId, NoteReactionEmoji.LOVE, 1L)));

        // when
        NoteReactionSummaryResponse response = noteReactionService.react(
                currentUserId,
                jarId,
                noteId,
                NoteReactionEmoji.LOVE
        );

        // then
        // 새 리액션을 정말 저장하는지 저장 직전 값을 잡아서 본다.
        ArgumentCaptor<NoteReaction> captor = ArgumentCaptor.forClass(NoteReaction.class);
        verify(noteReactionRepository).save(captor.capture());

        NoteReaction savedReaction = captor.getValue();
        assertThat(savedReaction.getNote()).isEqualTo(note);
        assertThat(savedReaction.getUser()).isEqualTo(user);
        assertThat(savedReaction.getEmoji()).isEqualTo(NoteReactionEmoji.LOVE);

        verify(noteReactionRepository).flush();

        assertThat(response.noteId()).isEqualTo(noteId);
        assertThat(response.myReaction()).isEqualTo(NoteReactionEmoji.LOVE);
        assertThat(response.counts())
                .extracting(NoteReactionCountItem::emoji, NoteReactionCountItem::count)
                .containsExactly(tuple(NoteReactionEmoji.LOVE, 1L));
    }

    @Test
    @DisplayName("리액션 토글 - 같은 이모지를 다시 누르면 기존 리액션을 삭제한다")
    void react_deletesReactionWhenSameEmojiIsClickedAgain() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 101L;

        User user = createUser(currentUserId, "테스터");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);
        NoteReaction existingReaction = NoteReaction.builder()
                .note(note)
                .user(user)
                .emoji(NoteReactionEmoji.LOVE)
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteReactionRepository.findByNote_NoteIdAndUser_Id(noteId, currentUserId))
                .thenReturn(Optional.of(existingReaction));
        when(noteReactionRepository.countGroupedByNoteId(noteId)).thenReturn(List.of());

        // when
        NoteReactionSummaryResponse response = noteReactionService.react(
                currentUserId,
                jarId,
                noteId,
                NoteReactionEmoji.LOVE
        );

        // then
        verify(noteReactionRepository).delete(existingReaction);
        verify(noteReactionRepository).flush();
        verify(noteReactionRepository, never()).save(any());

        assertThat(response.noteId()).isEqualTo(noteId);
        assertThat(response.myReaction()).isNull();
        assertThat(response.counts()).isEmpty();
    }

    @Test
    @DisplayName("리액션 변경 - 다른 이모지를 누르면 기존 리액션 값을 바꾼다")
    void react_changesReactionWhenDifferentEmojiIsClicked() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 102L;

        User user = createUser(currentUserId, "테스터");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);
        NoteReaction existingReaction = NoteReaction.builder()
                .note(note)
                .user(user)
                .emoji(NoteReactionEmoji.LOVE)
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteReactionRepository.findByNote_NoteIdAndUser_Id(noteId, currentUserId))
                .thenReturn(Optional.of(existingReaction));
        when(noteReactionRepository.countGroupedByNoteId(noteId))
                .thenReturn(List.of(reactionCountRow(noteId, NoteReactionEmoji.SMILE, 1L)));

        // when
        NoteReactionSummaryResponse response = noteReactionService.react(
                currentUserId,
                jarId,
                noteId,
                NoteReactionEmoji.SMILE
        );

        // then
        // 기존 row를 유지한 채 emoji만 바꾸는 규칙인지 확인한다.
        assertThat(existingReaction.getEmoji()).isEqualTo(NoteReactionEmoji.SMILE);

        verify(noteReactionRepository, never()).delete(any());
        verify(noteReactionRepository, never()).save(any());
        verify(noteReactionRepository).flush();

        assertThat(response.myReaction()).isEqualTo(NoteReactionEmoji.SMILE);
        assertThat(response.counts())
                .extracting(NoteReactionCountItem::emoji, NoteReactionCountItem::count)
                .containsExactly(tuple(NoteReactionEmoji.SMILE, 1L));
    }

    @Test
    @DisplayName("리액션 작성 차단 - 저금통이 아직 안 열렸으면 403을 던진다")
    void react_throwsWhenJarIsStillLocked() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 103L;

        User user = createUser(currentUserId, "테스터");
        Jar jar = createJar(jarId);

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(false);

        // when
        ResponseStatusException exception = catchThrowableOfType(
                () -> noteReactionService.react(currentUserId, jarId, noteId, NoteReactionEmoji.LOVE),
                ResponseStatusException.class
        );

        // then
        assertThat(exception.getStatusCode().value()).isEqualTo(403);
        assertThat(exception.getReason()).contains("리액션");
        verify(noteRepository, never()).findByJarIdAndNoteId(any(), any());
        verifyNoInteractions(noteReactionRepository);
    }

    @Test
    @DisplayName("리액션 삭제 - 기존 리액션이 없어도 에러 없이 빈 요약을 돌려준다")
    void deleteMyReaction_returnsEmptySummaryWhenNothingExists() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 105L;

        User user = createUser(currentUserId, "테스터");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteReactionRepository.findByNote_NoteIdAndUser_Id(noteId, currentUserId))
                .thenReturn(Optional.empty());
        when(noteReactionRepository.countGroupedByNoteId(noteId)).thenReturn(List.of());

        // when
        NoteReactionSummaryResponse response = noteReactionService.deleteMyReaction(
                currentUserId,
                jarId,
                noteId
        );

        // then
        // 지울 게 없어도 최신 상태는 다시 만들어서 프론트에 돌려준다.
        verify(noteReactionRepository).flush();
        verify(noteReactionRepository, never()).delete(any());

        assertThat(response.noteId()).isEqualTo(noteId);
        assertThat(response.myReaction()).isNull();
        assertThat(response.counts()).isEmpty();
    }

    @Test
    @DisplayName("리액션 삭제 차단 - 저금통이 아직 안 열렸으면 403을 던진다")
    void deleteMyReaction_throwsWhenJarIsStillLocked() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 106L;

        User user = createUser(currentUserId, "테스터");
        Jar jar = createJar(jarId);

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(false);

        // when
        ResponseStatusException exception = catchThrowableOfType(
                () -> noteReactionService.deleteMyReaction(currentUserId, jarId, noteId),
                ResponseStatusException.class
        );

        // then
        assertThat(exception.getStatusCode().value()).isEqualTo(403);
        assertThat(exception.getReason()).contains("리액션");
        verify(noteRepository, never()).findByJarIdAndNoteId(any(), any());
        verifyNoInteractions(noteReactionRepository);
    }

    @Test
    @DisplayName("리액션 요약 조회 - 내가 누른 이모지와 전체 개수를 함께 돌려준다")
    void getSummary_returnsMyReactionAndCounts() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 104L;

        User user = createUser(currentUserId, "테스터");
        Jar jar = createJar(jarId);
        Note note = createNote(noteId, jar, user);
        NoteReaction existingReaction = NoteReaction.builder()
                .note(note)
                .user(user)
                .emoji(NoteReactionEmoji.THANKFUL)
                .build();

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(noteRepository.findByJarIdAndNoteId(jarId, noteId)).thenReturn(Optional.of(note));
        when(noteReactionRepository.findByNote_NoteIdAndUser_Id(noteId, currentUserId))
                .thenReturn(Optional.of(existingReaction));
        when(noteReactionRepository.countGroupedByNoteId(noteId))
                .thenReturn(List.of(
                        reactionCountRow(noteId, NoteReactionEmoji.LOVE, 2L),
                        reactionCountRow(noteId, NoteReactionEmoji.THANKFUL, 1L)
                ));

        // when
        NoteReactionSummaryResponse response = noteReactionService.getSummary(currentUserId, jarId, noteId);

        // then
        assertThat(response.noteId()).isEqualTo(noteId);
        assertThat(response.myReaction()).isEqualTo(NoteReactionEmoji.THANKFUL);
        assertThat(response.counts())
                .extracting(NoteReactionCountItem::emoji, NoteReactionCountItem::count)
                .containsExactly(
                        tuple(NoteReactionEmoji.LOVE, 2L),
                        tuple(NoteReactionEmoji.THANKFUL, 1L)
                );
    }

    @Test
    @DisplayName("리액션 요약 조회 차단 - 저금통이 아직 안 열렸으면 403을 던진다")
    void getSummary_throwsWhenJarIsStillLocked() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 107L;

        User user = createUser(currentUserId, "테스터");
        Jar jar = createJar(jarId);

        when(userRepository.findById(currentUserId)).thenReturn(Optional.of(user));
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(false);

        // when
        ResponseStatusException exception = catchThrowableOfType(
                () -> noteReactionService.getSummary(currentUserId, jarId, noteId),
                ResponseStatusException.class
        );

        // then
        assertThat(exception.getStatusCode().value()).isEqualTo(403);
        assertThat(exception.getReason()).contains("리액션");
        verify(noteRepository, never()).findByJarIdAndNoteId(any(), any());
        verifyNoInteractions(noteReactionRepository);
    }

    @Test
    @DisplayName("리액션 개수 맵 조회 - noteId별로 리액션 개수를 묶어서 돌려준다")
    void getCountMapByNoteIds_groupsCountsByNoteId() {
        // given
        List<Long> noteIds = List.of(10L, 11L);

        when(noteReactionRepository.countGroupedByNoteIds(noteIds))
                .thenReturn(List.of(
                        reactionCountRow(10L, NoteReactionEmoji.LOVE, 2L),
                        reactionCountRow(10L, NoteReactionEmoji.SMILE, 1L),
                        reactionCountRow(11L, NoteReactionEmoji.CHEER, 3L)
                ));

        // when
        var result = noteReactionService.getCountMapByNoteIds(noteIds);

        // then
        assertThat(result.get(10L))
                .extracting(NoteReactionCountItem::emoji, NoteReactionCountItem::count)
                .containsExactly(
                        tuple(NoteReactionEmoji.LOVE, 2L),
                        tuple(NoteReactionEmoji.SMILE, 1L)
                );

        assertThat(result.get(11L))
                .extracting(NoteReactionCountItem::emoji, NoteReactionCountItem::count)
                .containsExactly(tuple(NoteReactionEmoji.CHEER, 3L));
    }

    @Test
    @DisplayName("리액션 개수 맵 조회 - 요청 noteId가 비어 있으면 빈 맵을 돌려준다")
    void getCountMapByNoteIds_returnsEmptyMapWhenRequestIsEmpty() {
        // when
        var result = noteReactionService.getCountMapByNoteIds(List.of());

        // then
        assertThat(result).isEmpty();
        verify(noteReactionRepository, never()).countGroupedByNoteIds(any());
    }

    @Test
    @DisplayName("내 리액션 맵 조회 - 내가 누른 리액션만 noteId별로 묶는다")
    void getMyReactionMapByNoteIds_returnsMyReactionMap() {
        // given
        Long currentUserId = 1L;
        List<Long> noteIds = List.of(10L, 11L, 12L);

        when(noteReactionRepository.findMyReactionsByUserIdAndNoteIds(currentUserId, noteIds))
                .thenReturn(List.of(
                        myReactionRow(10L, NoteReactionEmoji.LOVE),
                        myReactionRow(12L, NoteReactionEmoji.THANKFUL)
                ));

        // when
        var result = noteReactionService.getMyReactionMapByNoteIds(currentUserId, noteIds);

        // then
        assertThat(result)
                .containsEntry(10L, NoteReactionEmoji.LOVE)
                .containsEntry(12L, NoteReactionEmoji.THANKFUL);
        assertThat(result).doesNotContainKey(11L);
    }

    @Test
    @DisplayName("내 리액션 맵 조회 - 요청 noteId가 비어 있으면 빈 맵을 돌려준다")
    void getMyReactionMapByNoteIds_returnsEmptyMapWhenRequestIsEmpty() {
        // when
        var result = noteReactionService.getMyReactionMapByNoteIds(1L, List.of());

        // then
        assertThat(result).isEmpty();
        verify(noteReactionRepository, never()).findMyReactionsByUserIdAndNoteIds(any(), any());
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
                .openAt(LocalDateTime.now().plusDays(3))
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

    private NoteReactionRepository.ReactionCountView reactionCountRow(
            Long noteId,
            NoteReactionEmoji emoji,
            long count
    ) {
        return new NoteReactionRepository.ReactionCountView() {
            @Override
            public Long getNoteId() {
                return noteId;
            }

            @Override
            public NoteReactionEmoji getEmoji() {
                return emoji;
            }

            @Override
            public long getCount() {
                return count;
            }
        };
    }

    private NoteReactionRepository.MyReactionView myReactionRow(
            Long noteId,
            NoteReactionEmoji emoji
    ) {
        return new NoteReactionRepository.MyReactionView() {
            @Override
            public Long getNoteId() {
                return noteId;
            }

            @Override
            public NoteReactionEmoji getEmoji() {
                return emoji;
            }
        };
    }
}
