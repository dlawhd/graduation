package shop.esjh.memoryjar.service.jar;

import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarOpenEvent;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import shop.esjh.memoryjar.repository.jar.JarOpenEventRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.service.chat.ChatSystemMessageService;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/*
 이 테스트 클래스는 JarOpenService가
 "언제 저금통을 열고", "언제 기록을 남기고", "언제 안 여는지"
 를 확인하는 역할을 해.
 */
@ExtendWith(MockitoExtension.class)
class JarOpenServiceTest {

    @Mock
    private JarOpenRealtimeService jarOpenRealtimeService;

    @Mock
    private ChatSystemMessageService chatSystemMessageService;

    @Mock
    private JarRepository jarRepository;

    @Mock
    private JarOpenEventRepository jarOpenEventRepository;

    @InjectMocks
    private JarOpenService jarOpenService;

    @Test
    @DisplayName("이미 열린 저금통인지 확인 - 오픈 이벤트가 있으면 true")
    void isOpened_true() {
        // given
        Long jarId = 1L;
        when(jarOpenEventRepository.existsByJar_JarId(jarId)).thenReturn(true);

        // when
        boolean result = jarOpenService.isOpened(jarId);

        // then
        assertThat(result).isTrue();
    }

    @Test
    @DisplayName("이미 열린 저금통인지 확인 - 오픈 이벤트가 없으면 false")
    void isOpened_false() {
        // given
        Long jarId = 1L;
        when(jarOpenEventRepository.existsByJar_JarId(jarId)).thenReturn(false);

        // when
        boolean result = jarOpenService.isOpened(jarId);

        // then
        assertThat(result).isFalse();
    }

    @Test
    @DisplayName("ensureOpenedIfDue - 이미 열려 있으면 바로 true를 반환하고 잠금 조회는 하지 않는다")
    void ensureOpenedIfDue_alreadyOpened_returnsTrue() {
        // given
        Long jarId = 1L;
        when(jarOpenEventRepository.existsByJar_JarId(jarId)).thenReturn(true);

        // when
        boolean result = jarOpenService.ensureOpenedIfDue(jarId);

        // then
        assertThat(result).isTrue();
        verify(jarRepository, never()).findByJarIdForUpdate(anyLong());
        verify(jarOpenEventRepository, never()).save(any(JarOpenEvent.class));
    }

    @Test
    @DisplayName("ensureOpenedIfDue - 저금통이 없으면 404 예외")
    void ensureOpenedIfDue_jarNotFound_throws404() {
        // given
        Long jarId = 999L;

        when(jarOpenEventRepository.existsByJar_JarId(jarId)).thenReturn(false);
        when(jarRepository.findByJarIdForUpdate(jarId)).thenReturn(Optional.empty());

        // when
        ResponseStatusException ex = catchThrowableOfType(
                () -> jarOpenService.ensureOpenedIfDue(jarId),
                ResponseStatusException.class
        );

        // then
        assertThat(ex).isNotNull();
        assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ex.getReason()).isEqualTo("저금통을 찾을 수 없어.");
    }

    @Test
    @DisplayName("ensureOpenedIfDue - 잠금 잡은 뒤 이미 열렸으면 저장하지 않고 true")
    void ensureOpenedIfDue_alreadyOpenedAfterLock_returnsTrue() {
        // given
        Long jarId = 1L;
        Jar jar = createPlainJar();

        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false, true);

        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(jar));

        // when
        boolean result = jarOpenService.ensureOpenedIfDue(jarId);

        // then
        assertThat(result).isTrue();
        verify(jarOpenEventRepository, never()).save(any(JarOpenEvent.class));
    }

    @Test
    @DisplayName("ensureOpenedIfDue - 아직 오픈 시간이 안 됐으면 false")
    void ensureOpenedIfDue_notDue_returnsFalse() {
        // given
        Long jarId = 2L;
        Jar futureJar = createJarWithOpenAtOnly(LocalDateTime.now().plusDays(1));

        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false, false);

        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(futureJar));

        // when
        boolean result = jarOpenService.ensureOpenedIfDue(jarId);

        // then
        assertThat(result).isFalse();
        verify(jarOpenEventRepository, never()).save(any(JarOpenEvent.class));
    }

    @Test
    @DisplayName("ensureOpenedIfDue - 열릴 시간이 지났으면 ACCESS_TRIGGERED 이유로 오픈 이벤트를 저장한다")
    void ensureOpenedIfDue_dueJar_savesAccessTriggeredEvent() {
        // given
        Long jarId = 1L;
        Jar dueJar = createJarWithOpenAtOnly(LocalDateTime.now().minusDays(1));

        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false, false);

        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(dueJar));

        when(jarOpenEventRepository.save(any(JarOpenEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        boolean result = jarOpenService.ensureOpenedIfDue(jarId);

        // then
        assertThat(result).isTrue();

        ArgumentCaptor<JarOpenEvent> captor = ArgumentCaptor.forClass(JarOpenEvent.class);
        verify(jarOpenEventRepository).save(captor.capture());

        JarOpenEvent savedEvent = captor.getValue();

        assertThat(ReflectionTestUtils.getField(savedEvent, "jar")).isEqualTo(dueJar);
        assertThat(ReflectionTestUtils.getField(savedEvent, "reason"))
                .isEqualTo(JarOpenReason.ACCESS_TRIGGERED);
        assertThat(ReflectionTestUtils.getField(savedEvent, "openedAt"))
                .isEqualTo(dueJar.getOpenAt());
    }

    @Test
    @DisplayName("openDueJars - 열 수 있는 저금통만 열고 개수를 반환한다")
    void openDueJars_opensOnlyDueJars_andReturnsCount() {
        // given
        Jar dueJar1 = createJarWithIdAndOpenAt(10L, LocalDateTime.now().minusHours(2));
        Jar dueJar2 = createJarWithIdAndOpenAt(20L, LocalDateTime.now().minusHours(1));

        when(jarRepository.findDueJarsWithoutOpenEvent(any(LocalDateTime.class)))
                .thenReturn(List.of(dueJar1, dueJar2));

        when(jarOpenEventRepository.existsByJar_JarId(10L))
                .thenReturn(false, false);
        when(jarOpenEventRepository.existsByJar_JarId(20L))
                .thenReturn(false, false);

        when(jarRepository.findByJarIdForUpdate(10L))
                .thenReturn(Optional.of(dueJar1));
        when(jarRepository.findByJarIdForUpdate(20L))
                .thenReturn(Optional.of(dueJar2));

        when(jarOpenEventRepository.save(any(JarOpenEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        int openedCount = jarOpenService.openDueJars();

        // then
        assertThat(openedCount).isEqualTo(2);
        verify(jarOpenEventRepository, times(2)).save(any(JarOpenEvent.class));
    }

    @Test
    @DisplayName("openDueJars - 목록에 미래 저금통이 섞여 있어도 아직 시간이 안 됐으면 열지 않는다")
    void openDueJars_futureJarInList_isNotOpened() {
        // given
        Jar dueJar = createJarWithIdAndOpenAt(10L, LocalDateTime.now().minusHours(2));
        Jar futureJar = createJarWithIdAndOpenAt(20L, LocalDateTime.now().plusHours(2));

        when(jarRepository.findDueJarsWithoutOpenEvent(any(LocalDateTime.class)))
                .thenReturn(List.of(dueJar, futureJar));

        when(jarOpenEventRepository.existsByJar_JarId(10L))
                .thenReturn(false, false);
        when(jarOpenEventRepository.existsByJar_JarId(20L))
                .thenReturn(false, false);

        when(jarRepository.findByJarIdForUpdate(10L))
                .thenReturn(Optional.of(dueJar));
        when(jarRepository.findByJarIdForUpdate(20L))
                .thenReturn(Optional.of(futureJar));

        when(jarOpenEventRepository.save(any(JarOpenEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        int openedCount = jarOpenService.openDueJars();

        // then
        assertThat(openedCount).isEqualTo(1);
        verify(jarOpenEventRepository, times(1)).save(any(JarOpenEvent.class));
    }

    @Test
    @DisplayName("GET 조회 보정 오픈 - openAt이 미래면 오픈 이벤트가 생기지 않는다")
    void ensureOpenedIfDue_futureOpenAt_doesNotCreateOpenEvent() {
        // given
        // 아직 열릴 시간이 안 된 저금통 ID
        Long jarId = 10L;

        // openAt이 미래인 저금통을 만든다.
        Jar futureJar = createJarWithOpenAtOnly(
                LocalDateTime.now().plusDays(1)
        );

        // 첫 번째 existsByJar_JarId:
        // 잠금 조회 전에 이미 열린 적 있는지 확인 → false
        //
        // 두 번째 existsByJar_JarId:
        // 잠금 조회 후 동시에 다른 요청이 열었는지 다시 확인 → false
        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false, false);

        // 오픈 처리 중 저금통 row를 잠금 조회했을 때 futureJar를 반환한다.
        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(futureJar));

        // when
        // GET 조회 중 호출되는 보정 오픈 메서드를 실행한다.
        boolean result = jarOpenService.ensureOpenedIfDue(jarId);

        // then
        // 아직 오픈 시간이 안 됐으므로 false를 반환한다.
        assertThat(result).isFalse();

        // 오픈 이벤트가 저장되면 안 된다.
        verify(jarOpenEventRepository, never()).save(any(JarOpenEvent.class));

        // WebSocket 오픈 이벤트도 나가면 안 된다.
        verify(jarOpenRealtimeService, never())
                .sendJarOpenedEventAfterCommit(anyLong(), any());

        // 채팅 시스템 메시지도 생성되면 안 된다.
        verify(chatSystemMessageService, never())
                .createAndSendJarOpenedMessage(any(Jar.class));
    }

    @Test
    @DisplayName("GET 조회 보정 오픈 - openAt이 과거면 ACCESS_TRIGGERED 오픈 이벤트가 생긴다")
    void ensureOpenedIfDue_pastOpenAt_createsAccessTriggeredOpenEvent() {
        // given
        // 이미 열릴 시간이 지난 저금통 ID
        Long jarId = 10L;

        LocalDateTime openAt = LocalDateTime.now().minusDays(1);

        // openAt이 과거인 저금통을 만든다.
        Jar dueJar = createJarWithIdAndOpenAt(jarId, openAt);

        // 아직 오픈 이벤트가 없다고 가정한다.
        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false, false);

        // 잠금 조회 시 dueJar를 반환한다.
        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(dueJar));

        // save가 호출되면 저장된 엔티티를 그대로 반환하게 한다.
        when(jarOpenEventRepository.save(any(JarOpenEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        // GET 조회 중 호출되는 보정 오픈 메서드를 실행한다.
        boolean result = jarOpenService.ensureOpenedIfDue(jarId);

        // then
        // 열릴 시간이 지났으므로 true를 반환한다.
        assertThat(result).isTrue();

        // 저장된 오픈 이벤트를 직접 잡아서 내용 확인
        ArgumentCaptor<JarOpenEvent> eventCaptor = ArgumentCaptor.forClass(JarOpenEvent.class);
        verify(jarOpenEventRepository).save(eventCaptor.capture());

        JarOpenEvent savedEvent = eventCaptor.getValue();

        // 어떤 저금통이 열렸는지 확인
        assertThat(savedEvent.getJar()).isEqualTo(dueJar);

        // GET 조회로 인해 보정 오픈된 것이므로 ACCESS_TRIGGERED 여야 한다.
        assertThat(savedEvent.getReason()).isEqualTo(JarOpenReason.ACCESS_TRIGGERED);

        // openedAt은 실제 처리 시간이 아니라 원래 약속된 openAt으로 저장한다.
        assertThat(savedEvent.getOpenedAt()).isEqualTo(openAt);

        // WebSocket 오픈 이벤트가 한 번 발행되어야 한다.
        verify(jarOpenRealtimeService, times(1))
                .sendJarOpenedEventAfterCommit(eq(jarId), any());

        // 채팅방 시스템 메시지도 한 번 생성되어야 한다.
        verify(chatSystemMessageService, times(1))
                .createAndSendJarOpenedMessage(dueJar);
    }

    @Test
    @DisplayName("GET 조회 보정 오픈 - 이미 오픈 이벤트가 있으면 여러 번 조회해도 중복 생성되지 않는다")
    void ensureOpenedIfDue_alreadyOpened_doesNotCreateDuplicateOpenEvent() {
        // given
        Long jarId = 10L;

        LocalDateTime openAt = LocalDateTime.now().minusDays(1);
        Jar dueJar = createJarWithIdAndOpenAt(jarId, openAt);

        // 호출 흐름:
        //
        // 첫 번째 GET:
        // 1) 아직 이벤트 없음 false
        // 2) 잠금 잡은 뒤에도 이벤트 없음 false
        // → 이벤트 1번 생성
        //
        // 두 번째 GET:
        // 3) 이미 이벤트 있음 true
        // → 바로 true 반환, save 안 함
        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false, false, true);

        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(dueJar));

        when(jarOpenEventRepository.save(any(JarOpenEvent.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        boolean firstResult = jarOpenService.ensureOpenedIfDue(jarId);
        boolean secondResult = jarOpenService.ensureOpenedIfDue(jarId);

        // then
        assertThat(firstResult).isTrue();
        assertThat(secondResult).isTrue();

        // 오픈 이벤트는 딱 1번만 저장되어야 한다.
        verify(jarOpenEventRepository, times(1)).save(any(JarOpenEvent.class));

        // 잠금 조회도 첫 번째 호출에서만 필요하다.
        verify(jarRepository, times(1)).findByJarIdForUpdate(jarId);

        // WebSocket 이벤트도 딱 1번만 나가야 한다.
        verify(jarOpenRealtimeService, times(1))
                .sendJarOpenedEventAfterCommit(eq(jarId), any());

        // 채팅 시스템 메시지도 딱 1번만 만들어져야 한다.
        verify(chatSystemMessageService, times(1))
                .createAndSendJarOpenedMessage(dueJar);
    }

    /*
     jarId와 openAt이 둘 다 필요한 테스트용 helper
     아직 시간이 안 됐는지 / 이미 지났는지 검사할 때 사용해.
     */
    private Jar createJarWithIdAndOpenAt(Long jarId, LocalDateTime openAt) {
        Jar jar = mock(Jar.class);
        when(jar.getJarId()).thenReturn(jarId);
        when(jar.getOpenAt()).thenReturn(openAt);
        return jar;
    }

    private Jar createPlainJar() {
        return mock(Jar.class);
    }

    private Jar createJarWithOpenAtOnly(LocalDateTime openAt) {
        Jar jar = mock(Jar.class);
        when(jar.getOpenAt()).thenReturn(openAt);
        return jar;
    }
}