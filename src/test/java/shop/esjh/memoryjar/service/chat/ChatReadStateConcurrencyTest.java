package shop.esjh.memoryjar.service.chat;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.dto.chat.request.ChatReadRequest;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.chat.ChatMessage;
import shop.esjh.memoryjar.entity.chat.ChatReadState;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.repository.chat.ChatMessageRepository;
import shop.esjh.memoryjar.repository.chat.ChatReadStateRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;

import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/*
 * ChatReadStateConcurrencyTest 역할
 *
 * 사용자의 첫 채팅 읽음 상태가 아직 없는 상황에서
 * 읽음 요청 두 개가 동시에 들어와도:
 *
 * - UNIQUE 제약 오류가 발생하지 않는지
 * - 두 요청이 모두 성공하는지
 * - 읽음 row가 하나만 생성되는지
 * - 가장 최신 메시지까지 읽은 상태가 남는지
 *
 * 실제 MariaDB를 사용해 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(
        replace = AutoConfigureTestDatabase.Replace.NONE
)
@Import({
        JpaAuditConfig.class,
        ChatService.class
})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ChatReadStateConcurrencyTest
        extends AbstractMariaDbRepositoryTest {

    @Autowired
    private ChatService chatService;

    @Autowired
    private ChatMessageRepository chatMessageRepository;

    @Autowired
    private ChatReadStateRepository chatReadStateRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private EntityManager testEntityManager;

    @Test
    @DisplayName("첫 읽음 요청 두 개가 동시에 들어와도 하나의 읽음 상태에 최신 메시지가 저장된다")
    void concurrentFirstReadRequests_createOneStateAndKeepLatestMessage()
            throws Exception {

        // 테스트 데이터는 스레드를 시작하기 전에 별도 트랜잭션에서 저장하고 커밋한다.
        TestData testData = createCommittedTestData();

        ExecutorService executor =
                Executors.newFixedThreadPool(2);

        CountDownLatch readyLatch =
                new CountDownLatch(2);

        CountDownLatch startLatch =
                new CountDownLatch(1);

        try {
            Future<Void> olderReadFuture = executor.submit(() -> {
                readyLatch.countDown();
                startLatch.await();

                chatService.markAsRead(
                        testData.userId(),
                        testData.jarId(),
                        new ChatReadRequest(
                                testData.olderMessageId()
                        )
                );

                return null;
            });

            Future<Void> newerReadFuture = executor.submit(() -> {
                readyLatch.countDown();
                startLatch.await();

                chatService.markAsRead(
                        testData.userId(),
                        testData.jarId(),
                        new ChatReadRequest(
                                testData.newerMessageId()
                        )
                );

                return null;
            });

            // 두 스레드가 모두 출발 준비를 마칠 때까지 기다린다.
            assertThat(
                    readyLatch.await(
                            5,
                            TimeUnit.SECONDS
                    )
            ).isTrue();

            // 두 요청을 거의 동시에 출발시킨다.
            startLatch.countDown();

            /*
             * 두 요청 중 어느 것도
             * UNIQUE 제약 예외나 500 오류로 실패하면 안 된다.
             */
            assertThatCode(() -> {
                olderReadFuture.get(
                        10,
                        TimeUnit.SECONDS
                );

                newerReadFuture.get(
                        10,
                        TimeUnit.SECONDS
                );
            }).doesNotThrowAnyException();

        } finally {
            startLatch.countDown();
            executor.shutdownNow();
        }

        ReadStateResult result =
                readFinalState(testData);

        // 같은 저금통과 사용자의 읽음 row는 하나만 존재해야 한다.
        assertThat(result.rowCount())
                .isEqualTo(1L);

        // 요청 순서와 관계없이 가장 최신 메시지가 남아야 한다.
        assertThat(result.lastReadMessageId())
                .isEqualTo(testData.newerMessageId());
    }

    /*
     * 테스트 데이터를 별도 트랜잭션에서 만들고 바로 커밋한다.
     *
     * 커밋해야 다른 스레드의 트랜잭션에서도
     * 사용자, 저금통, 멤버, 메시지를 조회할 수 있다.
     */
    private TestData createCommittedTestData() {
        TransactionTemplate transactionTemplate =
                new TransactionTemplate(transactionManager);

        return transactionTemplate.execute(status -> {
            String unique = String.valueOf(System.nanoTime());

            User user = saveUser(
                    "chat-read-user-" + unique,
                    "chat-read-" + unique + "@example.com",
                    "읽음 사용자"
            );

            User sender = saveUser(
                    "chat-read-sender-" + unique,
                    "chat-read-sender-" + unique + "@example.com",
                    "메시지 작성자"
            );

            Jar jar = saveJar(
                    user,
                    "동시 읽음 테스트 저금통 " + unique,
                    LocalDateTime.now().plusDays(1)
            );

            saveJarMember(
                    jar,
                    user,
                    JarRole.OWNER,
                    LocalDateTime.now()
            );

            saveJarMember(
                    jar,
                    sender,
                    JarRole.MEMBER,
                    LocalDateTime.now()
            );

            ChatMessage olderMessage =
                    chatMessageRepository.save(
                            ChatMessage.createText(
                                    jar,
                                    sender,
                                    "먼저 읽을 메시지"
                            )
                    );

            ChatMessage newerMessage =
                    chatMessageRepository.save(
                            ChatMessage.createText(
                                    jar,
                                    sender,
                                    "더 최신 메시지"
                            )
                    );

            testEntityManager.flush();

            return new TestData(
                    user.getId(),
                    jar.getJarId(),
                    olderMessage.getMessageId(),
                    newerMessage.getMessageId()
            );
        });
    }

    /*
     * 동시 요청이 모두 끝난 후
     * 실제 DB에 남은 읽음 row 개수와 마지막 메시지를 확인한다.
     */
    private ReadStateResult readFinalState(
            TestData testData
    ) {
        TransactionTemplate transactionTemplate =
                new TransactionTemplate(transactionManager);

        return transactionTemplate.execute(status -> {
            ChatReadState readState =
                    chatReadStateRepository
                            .findWithLastReadMessageByJarIdAndUserId(
                                    testData.jarId(),
                                    testData.userId()
                            )
                            .orElseThrow();

            Number rowCount = (Number) testEntityManager
                    .createNativeQuery("""
                            select count(*)
                            from chat_read_state
                            where jar_id = :jarId
                              and user_id = :userId
                              and deleted_at is null
                            """)
                    .setParameter(
                            "jarId",
                            testData.jarId()
                    )
                    .setParameter(
                            "userId",
                            testData.userId()
                    )
                    .getSingleResult();

            return new ReadStateResult(
                    rowCount.longValue(),
                    readState.getLastReadMessageId()
            );
        });
    }

    private record TestData(
            Long userId,
            Long jarId,
            Long olderMessageId,
            Long newerMessageId
    ) {
    }

    private record ReadStateResult(
            long rowCount,
            Long lastReadMessageId
    ) {
    }
}