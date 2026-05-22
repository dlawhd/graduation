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