package shop.esjh.memoryjar.service.jar;

import shop.esjh.memoryjar.dto.jar.response.JarOpenSocketEventResponse;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarOpenEvent;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import shop.esjh.memoryjar.repository.jar.JarOpenEventRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.service.chat.ChatSystemMessageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.InOrder;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/*
 * JarOpenProcessorTest 역할
 *
 * 저금통 한 개를 여는 JarOpenProcessor가
 * 오픈 시간, 중복 오픈, 비관적 잠금 조회, 오픈 이벤트 저장,
 * WebSocket 이벤트 등록, 시스템 채팅 저장을 올바르게 처리하는지 확인한다.
 *
 * 주의:
 * 이 클래스는 Mockito 단위 테스트다.
 * 실제 DB 트랜잭션의 커밋과 롤백은 별도의 통합 테스트에서 확인해야 한다.
 */
@ExtendWith(MockitoExtension.class)
class JarOpenProcessorTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Mock
    private JarRepository jarRepository;

    @Mock
    private JarOpenEventRepository jarOpenEventRepository;

    @Mock
    private JarOpenRealtimeService jarOpenRealtimeService;

    @Mock
    private ChatSystemMessageService chatSystemMessageService;

    @InjectMocks
    private JarOpenProcessor jarOpenProcessor;

    @Test
    @DisplayName("트랜잭션 설정 - 저금통 한 개를 REQUIRES_NEW로 처리한다")
    void openIfDue_usesRequiresNewTransaction() throws NoSuchMethodException {
        // given:
        // 실제 JarOpenProcessor의 openIfDue 메서드를 찾는다.
        Method method = JarOpenProcessor.class.getMethod(
                "openIfDue",
                Long.class,
                JarOpenReason.class
        );

        // when:
        // 메서드에 붙어 있는 @Transactional 설정을 읽는다.
        Transactional transactional =
                method.getAnnotation(Transactional.class);

        // then:
        // openIfDue에는 반드시 @Transactional이 있어야 한다.
        assertThat(transactional).isNotNull();

        // 저금통 하나마다 새로운 트랜잭션을 만들도록
        // REQUIRES_NEW로 설정됐는지 확인한다.
        assertThat(transactional.propagation())
                .isEqualTo(Propagation.REQUIRES_NEW);
    }

    @Test
    @DisplayName("이미 열린 저금통이면 잠금을 먼저 얻은 뒤 중복 저장하지 않는다")
    void openIfDue_alreadyOpened_returnsTrueWithoutDuplicateEvent() {
        // given
        Long jarId = 10L;

        Jar jar = createJar(
                jarId,
                LocalDateTime.now(KST).minusHours(1)
        );

        /*
         * 저금통 잠금 조회는 정상적으로 성공한다고 가정한다.
         *
         * 이제 openIfDue()는 오픈 기록을 확인하기 전에
         * 반드시 이 잠금부터 얻는다.
         */
        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(jar));

        // 잠금을 얻고 확인해보니 이미 오픈 기록이 존재한다.
        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(true);

        // when
        boolean result = jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.SCHEDULED
        );

        // then
        assertThat(result).isTrue();

        /*
         * 이번 수정에서 가장 중요한 부분이다.
         *
         * 반드시:
         * 1. 저금통 LOCK
         * 2. 오픈 이벤트 존재 여부 확인
         *
         * 순서로 호출됐는지 검증한다.
         */
        InOrder inOrder = inOrder(
                jarRepository,
                jarOpenEventRepository
        );

        inOrder.verify(jarRepository)
                .findByJarIdForUpdate(jarId);

        inOrder.verify(jarOpenEventRepository)
                .existsByJar_JarId(jarId);

        // 이미 열린 저금통이므로 새로운 오픈 이벤트는 만들지 않는다.
        verify(jarOpenEventRepository, never())
                .save(any(JarOpenEvent.class));

        // 중복 WebSocket 이벤트와 SYSTEM 채팅도 만들지 않는다.
        verifyNoInteractions(
                jarOpenRealtimeService,
                chatSystemMessageService
        );
    }

    @Test
    @DisplayName("저금통이 없으면 404 예외를 던진다")
    void openIfDue_jarNotFound_throws404() {
        // given
        Long jarId = 999L;

        // 잠금 조회를 했지만 저금통이 존재하지 않는다.
        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.empty());

        // when & then
        assertThatThrownBy(() -> jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.SCHEDULED
        ))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        exception -> {
                            assertThat(exception.getStatusCode())
                                    .isEqualTo(HttpStatus.NOT_FOUND);

                            assertThat(exception.getReason())
                                    .isEqualTo("저금통을 찾을 수 없어.");
                        }
                );

        // 저금통이 없으므로 오픈 이벤트 조회/저장도 하지 않는다.
        verifyNoInteractions(jarOpenEventRepository);

        // WebSocket과 시스템 채팅도 실행하지 않는다.
        verifyNoInteractions(
                jarOpenRealtimeService,
                chatSystemMessageService
        );
    }

    @Test
    @DisplayName("잠금을 얻은 뒤 이미 열린 기록이 보이면 중복 저장하지 않는다")
    void openIfDue_openedAfterLock_returnsTrueWithoutDuplicateEvent() {
        // given
        Long jarId = 10L;

        Jar jar = createJar(
                jarId,
                LocalDateTime.now(KST).minusHours(1)
        );

        /*
         * 다른 요청이 먼저 이 저금통을 처리하고 있다고 생각해보자.
         *
         * 현재 요청은 findByJarIdForUpdate()에서 기다리게 되고,
         * 먼저 처리하던 요청이 커밋된 뒤 잠금을 얻는다.
         */
        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(jar));

        /*
         * 잠금을 얻은 다음 확인했을 때
         * 앞 요청이 이미 jar_open_events를 만들었다고 가정한다.
         */
        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(true);

        // when
        boolean result = jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.SCHEDULED
        );

        // then
        assertThat(result).isTrue();

        /*
         * 잠금을 먼저 잡고,
         * 그다음 오픈 여부를 확인하는 순서를 검증한다.
         */
        InOrder inOrder = inOrder(
                jarRepository,
                jarOpenEventRepository
        );

        inOrder.verify(jarRepository)
                .findByJarIdForUpdate(jarId);

        inOrder.verify(jarOpenEventRepository)
                .existsByJar_JarId(jarId);

        // 앞 요청이 이미 만들었으므로 또 INSERT하면 안 된다.
        verify(jarOpenEventRepository, never())
                .save(any(JarOpenEvent.class));

        // 중복 실시간 이벤트와 SYSTEM 채팅도 만들지 않는다.
        verifyNoInteractions(
                jarOpenRealtimeService,
                chatSystemMessageService
        );
    }

    @Test
    @DisplayName("오픈 시간이 미래면 false를 반환하고 이벤트와 채팅을 만들지 않는다")
    void openIfDue_futureJar_returnsFalseWithoutOpening() {
        // given
        Long jarId = 10L;

        // 하루 뒤에 열리는 저금통을 만든다.
        Jar futureJar = createJar(
                jarId,
                LocalDateTime.now(KST).plusDays(1)
        );

        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false);

        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(futureJar));

        // when
        boolean result = jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.SCHEDULED
        );

        // then
        assertThat(result).isFalse();

        // 아직 시간이 안 됐으므로 오픈 이벤트를 저장하지 않는다.
        verify(jarOpenEventRepository, never())
                .save(any(JarOpenEvent.class));

        // WebSocket과 시스템 채팅도 만들지 않는다.
        verifyNoInteractions(
                jarOpenRealtimeService,
                chatSystemMessageService
        );
    }

    @Test
    @DisplayName("오픈 시간이 지났으면 SCHEDULED 이벤트와 실시간 알림과 시스템 채팅을 만든다")
    void openIfDue_dueJar_opensWithScheduledReason() {
        // given
        Long jarId = 10L;
        LocalDateTime openAt =
                LocalDateTime.now(KST).minusHours(1);

        Jar dueJar = createJar(jarId, openAt);

        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false);

        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(dueJar));

        // when
        boolean result = jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.SCHEDULED
        );

        // then
        assertThat(result).isTrue();

        /*
         * 저장된 JarOpenEvent를 잡아서
         * 어떤 정보로 저장됐는지 확인한다.
         */
        ArgumentCaptor<JarOpenEvent> eventCaptor =
                ArgumentCaptor.forClass(JarOpenEvent.class);

        verify(jarOpenEventRepository)
                .save(eventCaptor.capture());

        JarOpenEvent savedEvent = eventCaptor.getValue();

        // 올바른 저금통이 저장돼야 한다.
        assertThat(savedEvent.getJar())
                .isSameAs(dueJar);

        // 실제 처리 시간이 아니라 약속한 openAt이 저장돼야 한다.
        assertThat(savedEvent.getOpenedAt())
                .isEqualTo(openAt);

        // 스케줄러가 열었으므로 SCHEDULED 사유여야 한다.
        assertThat(savedEvent.getReason())
                .isEqualTo(JarOpenReason.SCHEDULED);

        /*
         * WebSocket 이벤트 내용도 확인한다.
         */
        ArgumentCaptor<JarOpenSocketEventResponse> socketEventCaptor =
                ArgumentCaptor.forClass(
                        JarOpenSocketEventResponse.class
                );

        verify(jarOpenRealtimeService)
                .sendJarOpenedEventAfterCommit(
                        eq(jarId),
                        socketEventCaptor.capture()
                );

        JarOpenSocketEventResponse socketEvent =
                socketEventCaptor.getValue();

        assertThat(socketEvent.jarId())
                .isEqualTo(jarId);

        assertThat(socketEvent.eventType())
                .isEqualTo("JAR_OPENED");

        assertThat(socketEvent.isOpen())
                .isTrue();

        assertThat(socketEvent.openedAt())
                .isEqualTo(
                        openAt.atZone(KST).toOffsetDateTime()
                );

        assertThat(socketEvent.message())
                .isEqualTo("저금통이 열렸어요.");

        // 채팅방 SYSTEM 메시지도 만들어야 한다.
        verify(chatSystemMessageService)
                .createAndSendJarOpenedMessage(dueJar);
    }

    @Test
    @DisplayName("조회 보정 오픈이면 ACCESS_TRIGGERED 사유를 그대로 저장한다")
    void openIfDue_accessTriggered_savesAccessTriggeredReason() {
        // given
        Long jarId = 10L;
        LocalDateTime openAt =
                LocalDateTime.now(KST).minusDays(1);

        Jar dueJar = createJar(jarId, openAt);

        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false);

        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(dueJar));

        // when
        boolean result = jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.ACCESS_TRIGGERED
        );

        // then
        assertThat(result).isTrue();

        ArgumentCaptor<JarOpenEvent> eventCaptor =
                ArgumentCaptor.forClass(JarOpenEvent.class);

        verify(jarOpenEventRepository)
                .save(eventCaptor.capture());

        // 사용자가 조회해서 보정 오픈한 경우
        // ACCESS_TRIGGERED 사유가 저장돼야 한다.
        assertThat(eventCaptor.getValue().getReason())
                .isEqualTo(JarOpenReason.ACCESS_TRIGGERED);
    }

    @Test
    @DisplayName("시스템 채팅 저장이 실패하면 예외를 호출자에게 전달한다")
    void openIfDue_systemMessageFails_propagatesException() {
        // given
        Long jarId = 10L;

        Jar dueJar = createJar(
                jarId,
                LocalDateTime.now(KST).minusHours(1)
        );

        when(jarOpenEventRepository.existsByJar_JarId(jarId))
                .thenReturn(false);

        when(jarRepository.findByJarIdForUpdate(jarId))
                .thenReturn(Optional.of(dueJar));

        // 시스템 채팅 저장 과정에서 오류가 발생한다고 가정한다.
        when(chatSystemMessageService
                .createAndSendJarOpenedMessage(dueJar))
                .thenThrow(
                        new RuntimeException("시스템 채팅 저장 실패")
                );

        // when & then
        assertThatThrownBy(() -> jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.SCHEDULED
        ))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("시스템 채팅 저장 실패");

        /*
         * 채팅 저장 전까지는 다음 메서드가 호출된다.
         *
         * 실제 트랜잭션에서는:
         * - RuntimeException이 밖으로 전달됨
         * - 오픈 이벤트 INSERT 롤백
         * - afterCommit 실행 안 됨
         */
        verify(jarOpenEventRepository)
                .save(any(JarOpenEvent.class));

        verify(jarOpenRealtimeService)
                .sendJarOpenedEventAfterCommit(
                        eq(jarId),
                        any()
                );
    }

    /*
     * 테스트에 필요한 최소한의 Jar 엔티티를 만든다.
     *
     * openAt은 Builder로 넣고,
     * DB가 자동 생성하는 jarId는 테스트에서 직접 넣어준다.
     */
    private Jar createJar(
            Long jarId,
            LocalDateTime openAt
    ) {
        Jar jar = Jar.builder()
                .openAt(openAt)
                .build();

        ReflectionTestUtils.setField(
                jar,
                "jarId",
                jarId
        );

        return jar;
    }
}