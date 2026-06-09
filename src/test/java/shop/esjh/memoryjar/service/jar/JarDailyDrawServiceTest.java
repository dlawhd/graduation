package shop.esjh.memoryjar.service.jar;

import shop.esjh.memoryjar.dto.dailydraw.response.DailyDrawHistoryResponse;
import shop.esjh.memoryjar.dto.dailydraw.response.DailyDrawResponse;
import shop.esjh.memoryjar.dto.dailydraw.response.DailyDrawTodayResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarDailyDraw;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.repository.jar.JarDailyDrawRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.repository.note.NoteAttachmentRepository;
import shop.esjh.memoryjar.repository.note.NoteRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/*
 * JarDailyDrawServiceTest
 *
 * 이 테스트 클래스는 JarDailyDrawService가
 * "오늘의 추억 한 장"을 올바르게 뽑고, 조회하고, 예외  처리하는지 확인하는 역할을 한다.
 *
 * 쉽게 말하면:
 * - 열린 DAILY_DRAW 저금통에서 오늘 카드가 새로 뽑히는지
 * - 오늘 카드가 이미 있으면 다시 뽑지 않는지
 * - 이미 뽑힌 쪽지는 후보에서 제외하는 Repository를 호출하는지
 * - 멤버가 아니거나, 아직 열리지 않았거나, DAILY_DRAW 방식이 아니면 막는지
 * 확인하는 테스트다.
 */
@ExtendWith(MockitoExtension.class)
class JarDailyDrawServiceTest {

    // 저금통 조회, 잠금 조회를 대신해주는 Mock
    @Mock
    private JarRepository jarRepository;

    // 현재 사용자가 저금통 멤버인지 확인하는 Mock
    @Mock
    private JarMemberRepository jarMemberRepository;

    // Daily Draw 기록 조회/저장을 대신하는 Mock
    @Mock
    private JarDailyDrawRepository jarDailyDrawRepository;

    // 아직 뽑히지 않은 쪽지 후보 조회를 대신하는 Mock
    @Mock
    private NoteRepository noteRepository;

    // 오늘 카드에 붙은 첨부파일 조회를 대신하는 Mock
    @Mock
    private NoteAttachmentRepository noteAttachmentRepository;

    // 저금통이 열렸는지 확인하는 Mock
    @Mock
    private JarOpenService jarOpenService;

    @Mock
    private JarDailyDrawRealtimeService jarDailyDrawRealtimeService;

    // 위 Mock들을 주입받아서 테스트할 실제 Service
    @InjectMocks
    private JarDailyDrawService jarDailyDrawService;



    @Test
    @DisplayName("drawToday - 오늘 카드가 없으면 아직 안 뽑힌 쪽지 중 1장을 뽑아 저장한다")
    void drawToday_noTodayDraw_createsNewDraw() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));

        Jar jar = createJar(jarId, JarOpenMode.DAILY_DRAW);
        User author = createUser(2L, "은서");
        Note selectedNote = createNote(noteId, jar, author);
        JarDailyDraw savedDraw = createDailyDraw(1000L, jar, selectedNote, today);

        // 저금통이 존재한다고 가정
        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));

        // 현재 사용자가 active 멤버라고 가정
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);

        // 저금통이 이미 열려 있다고 가정
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);

        // 동시 뽑기 방지를 위한 잠금 조회 성공
        when(jarRepository.findByJarIdForUpdate(jarId)).thenReturn(Optional.of(jar));

        // 오늘 아직 뽑힌 카드가 없다고 가정
        when(jarDailyDrawRepository.findTodayWithNoteByJarIdAndDrawDate(eq(jarId), any(LocalDate.class)))
                .thenReturn(Optional.empty());

        // 아직 안 뽑힌 후보 쪽지가 1장 있다고 가정
        when(noteRepository.countDailyDrawCandidatesByJarId(jarId)).thenReturn(1L);

        // 후보 쪽지 1장을 반환
        when(noteRepository.findDailyDrawCandidatesByJarId(eq(jarId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(selectedNote)));

        // 저장하면 savedDraw가 반환된다고 가정
        when(jarDailyDrawRepository.saveAndFlush(any(JarDailyDraw.class))).thenReturn(savedDraw);

        // 첨부파일은 없는 상태로 가정
        when(noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId))
                .thenReturn(List.of());

        // when
        DailyDrawResponse result = jarDailyDrawService.drawToday(currentUserId, jarId);

        // then
        assertThat(result).isNotNull();
        assertThat(result.drawId()).isEqualTo(1000L);
        assertThat(result.jarId()).isEqualTo(jarId);
        assertThat(result.newlyDrawn()).isTrue();
        assertThat(result.note().noteId()).isEqualTo(noteId);
        assertThat(result.note().authorName()).isEqualTo("은서");
        assertThat(result.note().title()).isEqualTo("오늘의 추억");

        /*
         * saveAndFlush에 실제로 어떤 JarDailyDraw가 넘어갔는지 확인한다.
         * 이걸 확인하면 "선택된 쪽지"와 "저금통"으로 기록을 만들었는지 볼 수 있다.
         */
        ArgumentCaptor<JarDailyDraw> captor = ArgumentCaptor.forClass(JarDailyDraw.class);
        verify(jarDailyDrawRepository).saveAndFlush(captor.capture());

        JarDailyDraw capturedDraw = captor.getValue();

        assertThat(ReflectionTestUtils.getField(capturedDraw, "jar")).isEqualTo(jar);
        assertThat(ReflectionTestUtils.getField(capturedDraw, "note")).isEqualTo(selectedNote);
        assertThat(ReflectionTestUtils.getField(capturedDraw, "drawDate")).isInstanceOf(LocalDate.class);

        // 이미 뽑힌 쪽지는 제외하는 후보 조회 메서드가 호출됐는지 확인
        verify(noteRepository).countDailyDrawCandidatesByJarId(jarId);
        verify(noteRepository).findDailyDrawCandidatesByJarId(eq(jarId), any(Pageable.class));
    }

    @Test
    @DisplayName("drawToday - 오늘 카드가 이미 있으면 새로 뽑지 않고 기존 카드를 반환한다")
    void drawToday_existingTodayDraw_returnsExistingDraw() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));

        Jar jar = createJar(jarId, JarOpenMode.DAILY_DRAW);
        User author = createUser(2L, "은서");
        Note existingNote = createNote(noteId, jar, author);
        JarDailyDraw existingDraw = createDailyDraw(2000L, jar, existingNote, today);

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(jarRepository.findByJarIdForUpdate(jarId)).thenReturn(Optional.of(jar));

        // 오늘 카드가 이미 있다고 가정
        when(jarDailyDrawRepository.findTodayWithNoteByJarIdAndDrawDate(eq(jarId), any(LocalDate.class)))
                .thenReturn(Optional.of(existingDraw));

        when(noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId))
                .thenReturn(List.of());

        // when
        DailyDrawResponse result = jarDailyDrawService.drawToday(currentUserId, jarId);

        // then
        assertThat(result).isNotNull();
        assertThat(result.drawId()).isEqualTo(2000L);
        assertThat(result.newlyDrawn()).isFalse();
        assertThat(result.note().noteId()).isEqualTo(noteId);

        // 이미 오늘 카드가 있으므로 후보 조회/저장은 절대 하면 안 된다.
        verify(noteRepository, never()).countDailyDrawCandidatesByJarId(anyLong());
        verify(noteRepository, never()).findDailyDrawCandidatesByJarId(anyLong(), any(Pageable.class));
        verify(jarDailyDrawRepository, never()).saveAndFlush(any(JarDailyDraw.class));
    }

    @Test
    @DisplayName("drawToday - 저금통 멤버가 아니면 403 예외가 발생한다")
    void drawToday_notMember_throws403() {
        // given
        Long currentUserId = 99L;
        Long jarId = 10L;

        Jar jar = createJar(jarId, JarOpenMode.DAILY_DRAW);

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));

        // 현재 사용자가 active 멤버가 아니라고 가정
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(false);

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> jarDailyDrawService.drawToday(currentUserId, jarId),
                ResponseStatusException.class
        );

        // then
        assertThat(ex).isNotNull();
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ex.getReason()).isEqualTo("현재 저금통 멤버만 오늘의 추억 한 장을 볼 수 있어.");

        // 멤버가 아니면 오픈 확인이나 뽑기 로직까지 가면 안 된다.
        verifyNoInteractions(jarOpenService);
        verifyNoInteractions(noteRepository);
        verify(jarDailyDrawRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("drawToday - 아직 열리지 않은 저금통이면 400 예외가 발생한다")
    void drawToday_notOpened_throws400() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar jar = createJar(jarId, JarOpenMode.DAILY_DRAW);

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);

        // 아직 열리지 않았다고 가정
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(false);

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> jarDailyDrawService.drawToday(currentUserId, jarId),
                ResponseStatusException.class
        );

        // then
        assertThat(ex).isNotNull();
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("아직 열리지 않은 저금통이야. 오픈 이후에 오늘의 추억 한 장을 사용할 수 있어.");

        // 아직 안 열렸으면 잠금 조회/후보 조회/저장까지 가면 안 된다.
        verify(jarRepository, never()).findByJarIdForUpdate(anyLong());
        verifyNoInteractions(noteRepository);
        verify(jarDailyDrawRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("drawToday - 오늘 카드가 없지만 뽑을 후보 쪽지도 없으면 400 예외가 발생한다")
    void drawToday_noCandidate_throws400() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar jar = createJar(jarId, JarOpenMode.DAILY_DRAW);

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(jarRepository.findByJarIdForUpdate(jarId)).thenReturn(Optional.of(jar));

        // 오늘 카드는 아직 없음
        when(jarDailyDrawRepository.findTodayWithNoteByJarIdAndDrawDate(eq(jarId), any(LocalDate.class)))
                .thenReturn(Optional.empty());

        // 아직 안 뽑힌 후보 쪽지가 0장
        when(noteRepository.countDailyDrawCandidatesByJarId(jarId)).thenReturn(0L);

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> jarDailyDrawService.drawToday(currentUserId, jarId),
                ResponseStatusException.class
        );

        // then
        assertThat(ex).isNotNull();
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ex.getReason()).isEqualTo("아직 뽑을 수 있는 추억 쪽지가 없어.");

        // 후보가 없으면 저장하면 안 된다.
        verify(noteRepository, never()).findDailyDrawCandidatesByJarId(anyLong(), any(Pageable.class));
        verify(jarDailyDrawRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("getTodayDraw - 오늘 카드가 없으면 hasTodayDraw=false를 반환한다")
    void getTodayDraw_empty_returnsFalse() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar jar = createJar(jarId, JarOpenMode.DAILY_DRAW);

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);

        // 오늘 카드가 아직 없음
        when(jarDailyDrawRepository.findTodayWithNoteByJarIdAndDrawDate(eq(jarId), any(LocalDate.class)))
                .thenReturn(Optional.empty());

        // when
        DailyDrawTodayResponse result = jarDailyDrawService.getTodayDraw(currentUserId, jarId);

        // then
        assertThat(result).isNotNull();
        assertThat(result.hasTodayDraw()).isFalse();
        assertThat(result.dailyDraw()).isNull();
        assertThat(result.message()).isEqualTo("아직 오늘의 추억 한 장이 뽑히지 않았어요.");
    }

    @Test
    @DisplayName("getTodayDraw - 오늘 카드가 있으면 hasTodayDraw=true와 카드 정보를 반환한다")
    void getTodayDraw_found_returnsTodayDraw() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;
        Long noteId = 100L;
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));

        Jar jar = createJar(jarId, JarOpenMode.DAILY_DRAW);
        User author = createUser(2L, "은서");
        Note note = createNote(noteId, jar, author);
        JarDailyDraw draw = createDailyDraw(3000L, jar, note, today);

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);
        when(jarDailyDrawRepository.findTodayWithNoteByJarIdAndDrawDate(eq(jarId), any(LocalDate.class)))
                .thenReturn(Optional.of(draw));
        when(noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId))
                .thenReturn(List.of());

        // when
        DailyDrawTodayResponse result = jarDailyDrawService.getTodayDraw(currentUserId, jarId);

        // then
        assertThat(result).isNotNull();
        assertThat(result.hasTodayDraw()).isTrue();
        assertThat(result.dailyDraw()).isNotNull();
        assertThat(result.dailyDraw().drawId()).isEqualTo(3000L);
        assertThat(result.dailyDraw().newlyDrawn()).isFalse();
        assertThat(result.dailyDraw().note().noteId()).isEqualTo(noteId);
    }

    @Test
    @DisplayName("getHistory - Daily Draw 히스토리를 최신순 목록 응답으로 반환한다")
    void getHistory_success() {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        Jar jar = createJar(jarId, JarOpenMode.DAILY_DRAW);
        User author = createUser(2L, "은서");

        Note note1 = createNote(101L, jar, author);
        Note note2 = createNote(102L, jar, author);

        JarDailyDraw draw1 = createDailyDraw(1L, jar, note1, LocalDate.of(2026, 5, 4));
        JarDailyDraw draw2 = createDailyDraw(2L, jar, note2, LocalDate.of(2026, 5, 3));

        when(jarRepository.findByJarId(jarId)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, currentUserId))
                .thenReturn(true);
        when(jarOpenService.ensureOpenedIfDue(jarId)).thenReturn(true);

        when(jarDailyDrawRepository.findHistoryByJarId(eq(jarId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(draw1, draw2)));

        // when
        DailyDrawHistoryResponse result = jarDailyDrawService.getHistory(
                currentUserId,
                jarId,
                0,
                20
        );

        // then
        assertThat(result).isNotNull();
        assertThat(result.items()).hasSize(2);
        assertThat(result.items().get(0).drawId()).isEqualTo(1L);
        assertThat(result.items().get(0).noteId()).isEqualTo(101L);
        assertThat(result.items().get(0).title()).isEqualTo("오늘의 추억");
        assertThat(result.items().get(0).authorName()).isEqualTo("은서");

        verify(jarDailyDrawRepository).findHistoryByJarId(eq(jarId), any(Pageable.class));
    }

    /*
     * 테스트용 저금통 Mock 생성 메서드
     *
     * 여러 테스트에서 공통으로 쓰기 때문에
     * 어떤 테스트에서는 getJarId()만 쓰고,
     * 어떤 테스트에서는 getOpenMode()만 쓸 수 있다.
     *
     * Mockito는 "준비했는데 안 쓴 stubbing"을 기본적으로 에러로 보기 때문에
     * 공통 helper에서는 lenient()를 사용해서 테스트별 사용 차이를 허용한다.
     */
    private Jar createJar(Long jarId, JarOpenMode openMode) {
        Jar jar = mock(Jar.class);

        // 저금통 ID가 필요한 테스트에서 사용된다.
        lenient().when(jar.getJarId()).thenReturn(jarId);

        // DAILY_DRAW / ALL_AT_ONCE 검증에서 사용된다.
        lenient().when(jar.getOpenMode()).thenReturn(openMode);

        return jar;
    }

    /*
     * 테스트용 사용자 Mock 생성 메서드
     *
     * 어떤 테스트에서는 authorId만 쓰고,
     * 어떤 테스트에서는 authorName만 쓸 수 있으므로 lenient()로 둔다.
     */
    private User createUser(Long userId, String name) {
        User user = mock(User.class);

        // 작성자 ID가 필요한 응답 변환 테스트에서 사용된다.
        lenient().when(user.getId()).thenReturn(userId);

        // 작성자 이름이 필요한 응답 변환 테스트에서 사용된다.
        lenient().when(user.getName()).thenReturn(name);

        return user;
    }

    /*
     * 테스트용 쪽지 Mock 생성 메서드
     *
     * DailyDrawNoteResponse와 DailyDrawHistoryItem을 만들 때 필요한 값들을 넣어둔다.
     *
     * 다만 테스트마다 필요한 필드가 다르다.
     * 예:
     * - 오늘 카드 상세 응답은 content, tags, createdAt까지 사용
     * - 히스토리 응답은 title, authorName, noteDate, location 정도만 사용
     *
     * 그래서 공통 helper에서는 lenient()를 사용한다.
     */
    private Note createNote(Long noteId, Jar jar, User author) {
        Note note = mock(Note.class);

        lenient().when(note.getNoteId()).thenReturn(noteId);
        lenient().when(note.getJar()).thenReturn(jar);
        lenient().when(note.getAuthor()).thenReturn(author);
        lenient().when(note.getTitle()).thenReturn("오늘의 추억");
        lenient().when(note.getContent()).thenReturn("오늘 뽑힌 추억 쪽지 내용");
        lenient().when(note.isEncrypted()).thenReturn(false);
        lenient().when(note.getNoteDate()).thenReturn(LocalDate.of(2026, 5, 1));
        lenient().when(note.getLocation()).thenReturn("서울");
        lenient().when(note.getTags()).thenReturn(List.of("추억", "사진"));
        lenient().when(note.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 1, 10, 0));
        lenient().when(note.getUpdatedAt()).thenReturn(LocalDateTime.of(2026, 5, 1, 10, 0));

        return note;
    }

    /*
     * 테스트용 Daily Draw 기록 Mock 생성 메서드
     *
     * 테스트마다 drawId, jar, note, drawDate 중 일부만 사용할 수 있으므로
     * 공통 helper에서는 lenient()를 사용한다.
     */
    private JarDailyDraw createDailyDraw(
            Long drawId,
            Jar jar,
            Note note,
            LocalDate drawDate
    ) {
        JarDailyDraw dailyDraw = mock(JarDailyDraw.class);

        lenient().when(dailyDraw.getDrawId()).thenReturn(drawId);
        lenient().when(dailyDraw.getJar()).thenReturn(jar);
        lenient().when(dailyDraw.getNote()).thenReturn(note);
        lenient().when(dailyDraw.getDrawDate()).thenReturn(drawDate);

        return dailyDraw;
    }
}