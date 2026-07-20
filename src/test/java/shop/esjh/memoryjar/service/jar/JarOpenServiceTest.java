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

import java.time.ZoneId;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/*
 * JarOpenServiceTest 역할
 *
 * 여러 저금통의 오픈 작업을 조정하는 서비스가
 * 저금통마다 Processor를 호출하는지 확인한다.
 *
 * 실제 오픈 기록 저장과 SYSTEM 채팅 저장은
 * JarOpenProcessorTest에서 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class JarOpenServiceTest {

    @Mock
    private JarRepository jarRepository;

    @Mock
    private JarOpenEventRepository jarOpenEventRepository;

    @Mock
    private JarOpenProcessor jarOpenProcessor;

    @InjectMocks
    private JarOpenService jarOpenService;

    @Test
    @DisplayName("이미 열린 저금통인지 확인 - 오픈 이벤트가 있으면 true")
    void isOpened_true() {
        // given
        Long jarId = 1L;

        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(true);

        // when
        boolean result = jarOpenService.isOpened(jarId);

        // then
        assertThat(result).isTrue();
    }

    @Test
    @DisplayName("조회 보정 오픈 - Processor에 ACCESS_TRIGGERED 처리를 요청한다")
    void ensureOpenedIfDue_delegatesToProcessor() {
        // given
        Long jarId = 10L;

        when(jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.ACCESS_TRIGGERED
        )).thenReturn(true);

        // when
        boolean result = jarOpenService.ensureOpenedIfDue(jarId);

        // then
        assertThat(result).isTrue();

        verify(jarOpenProcessor).openIfDue(
                jarId,
                JarOpenReason.ACCESS_TRIGGERED
        );
    }

    @Test
    @DisplayName("스케줄러 오픈 - 모든 저금통이 성공하면 성공 개수를 반환한다")
    void openDueJars_allSuccess_returnsOpenedCount() {
        // given
        Jar firstJar = createJarWithId(10L);
        Jar secondJar = createJarWithId(20L);

        when(jarRepository.findDueJarsWithoutOpenEvent(
                any(LocalDateTime.class)
        )).thenReturn(List.of(firstJar, secondJar));

        when(jarOpenProcessor.openIfDue(
                10L,
                JarOpenReason.SCHEDULED
        )).thenReturn(true);

        when(jarOpenProcessor.openIfDue(
                20L,
                JarOpenReason.SCHEDULED
        )).thenReturn(true);

        // when
        int openedCount = jarOpenService.openDueJars();

        // then
        assertThat(openedCount).isEqualTo(2);
    }

    @Test
    @DisplayName("스케줄러 오픈 - 한 저금통이 실패해도 다른 저금통은 정상 처리한다")
    void openDueJars_oneJarFails_continuesOtherJars() {
        // given
        Jar failedJar = createJarWithId(10L);
        Jar successJar = createJarWithId(20L);

        when(jarRepository.findDueJarsWithoutOpenEvent(
                any(LocalDateTime.class)
        )).thenReturn(List.of(failedJar, successJar));

        // 첫 번째 저금통은 독립 트랜잭션에서 실패한다.
        when(jarOpenProcessor.openIfDue(
                10L,
                JarOpenReason.SCHEDULED
        )).thenThrow(new RuntimeException("시스템 채팅 저장 실패"));

        // 두 번째 저금통은 첫 번째와 무관하게 정상 처리된다.
        when(jarOpenProcessor.openIfDue(
                20L,
                JarOpenReason.SCHEDULED
        )).thenReturn(true);

        // when
        int openedCount = jarOpenService.openDueJars();

        // then
        // 정상 처리된 두 번째 저금통만 성공 개수에 포함된다.
        assertThat(openedCount).isEqualTo(1);

        verify(jarOpenProcessor).openIfDue(
                10L,
                JarOpenReason.SCHEDULED
        );

        verify(jarOpenProcessor).openIfDue(
                20L,
                JarOpenReason.SCHEDULED
        );
    }

    /*
     * jarId만 필요한 스케줄러 테스트용 저금통 Mock이다.
     */
    private Jar createJarWithId(Long jarId) {
        Jar jar = mock(Jar.class);

        when(jar.getJarId()).thenReturn(jarId);

        return jar;
    }
}