package shop.esjh.memoryjar.service.jar;

import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import shop.esjh.memoryjar.repository.jar.JarOpenEventRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/*
 * JarOpenService 역할
 *
 * 이 서비스는 저금통 오픈 작업의 전체 흐름을 조정한다.
 *
 * 주요 역할:
 * 1. 이미 열린 저금통인지 조회한다.
 * 2. 조회 시점 보정 오픈을 JarOpenProcessor에 요청한다.
 * 3. 스케줄러가 찾은 여러 저금통을 하나씩 독립적으로 처리한다.
 * 4. 한 저금통이 실패해도 다음 저금통 처리를 계속한다.
 *
 * 실제 오픈 기록 저장과 SYSTEM 채팅 저장은
 * 저금통별 새 트랜잭션을 만드는 JarOpenProcessor가 담당한다.
 */
@Service
public class JarOpenService {

    private static final Logger log =
            LoggerFactory.getLogger(JarOpenService.class);

    private static final ZoneId KST =
            ZoneId.of("Asia/Seoul");

    private final JarRepository jarRepository;
    private final JarOpenEventRepository jarOpenEventRepository;
    private final JarOpenProcessor jarOpenProcessor;

    public JarOpenService(
            JarRepository jarRepository,
            JarOpenEventRepository jarOpenEventRepository,
            JarOpenProcessor jarOpenProcessor
    ) {
        this.jarRepository = jarRepository;
        this.jarOpenEventRepository = jarOpenEventRepository;
        this.jarOpenProcessor = jarOpenProcessor;
    }

    // jar_open_events 기록을 기준으로
    // 이미 열린 저금통인지 확인한다.
    @Transactional(readOnly = true)
    public boolean isOpened(Long jarId) {
        return jarOpenEventRepository.existsByJar_JarId(jarId);
    }

    /*
     * 사용자가 저금통을 조회했을 때
     * 오픈 시간이 지났다면 보정 오픈한다.
     *
     * 일반 조회 서비스는 이미 readOnly 트랜잭션 안에서 이 메서드를 호출할 수 있다.
     * 그런 요청마다 바로 REQUIRES_NEW로 들어가면 바깥 트랜잭션과 새 트랜잭션이
     * 각각 DB 커넥션을 필요로 해서, 동시 조회가 많을 때 Hikari 풀이 고갈될 수 있다.
     *
     * 따라서 이미 열린 저금통과 아직 오픈 시간이 오지 않은 저금통은
     * 가벼운 조회만으로 반환하고, 실제 보정 오픈이 필요한 순간에만
     * 별도 Spring Bean인 JarOpenProcessor의 REQUIRES_NEW 트랜잭션을 호출한다.
     */
    public boolean ensureOpenedIfDue(Long jarId) {
        // 이미 열린 저금통은 쓰기 잠금과 새 트랜잭션 없이 바로 응답한다.
        if (jarOpenEventRepository.existsByJar_JarId(jarId)) {
            return true;
        }

        LocalDateTime now = LocalDateTime.now(KST);

        // 아직 오픈 시간이 미래라면 실제 오픈 작업이 필요하지 않다.
        if (!jarRepository.existsByJarIdAndOpenAtLessThanEqual(jarId, now)) {
            return false;
        }

        // 오픈 시간이 지났지만 이벤트가 없는 경우에만 잠금 기반 보정 오픈을 수행한다.
        return jarOpenProcessor.openIfDue(
                jarId,
                JarOpenReason.ACCESS_TRIGGERED
        );
    }

    /*
     * 스케줄러가 호출하는 여러 저금통 오픈 처리 메서드
     *
     * 이 메서드 자체에는 @Transactional을 붙이지 않는다.
     * 각 저금통은 JarOpenProcessor의 REQUIRES_NEW에서 따로 처리한다.
     */
    public int openDueJars() {

        LocalDateTime now = LocalDateTime.now(KST);

        // 오픈 시간이 지났고
        // 아직 오픈 기록이 없는 저금통 목록을 조회한다.
        List<Jar> dueJars =
                jarRepository.findDueJarsWithoutOpenEvent(now);

        int openedCount = 0;

        for (Jar jar : dueJars) {
            Long jarId = jar.getJarId();

            try {
                // 저금통 한 개마다 새로운 트랜잭션을 시작한다.
                boolean opened = jarOpenProcessor.openIfDue(
                        jarId,
                        JarOpenReason.SCHEDULED
                );

                if (opened) {
                    openedCount++;
                }
            } catch (RuntimeException exception) {
                /*
                 * 한 저금통이 실패해도 여기서 예외를 잡는다.
                 *
                 * JarOpenProcessor의 트랜잭션은 이미 롤백됐고,
                 * 반복문은 다음 저금통 처리를 계속한다.
                 */
                log.error(
                        "[JAR_OPEN_FAILED] 저금통 자동 오픈 실패. jarId={}",
                        jarId,
                        exception
                );
            }
        }

        return openedCount;
    }

    /*
     * 여러 저금통 중 이미 열린 저금통 ID를
     * 한 번에 조회한다.
     */
    @Transactional(readOnly = true)
    public Set<Long> findOpenedJarIdSet(List<Long> jarIds) {
        if (jarIds == null || jarIds.isEmpty()) {
            return Set.of();
        }

        return new HashSet<>(
                jarOpenEventRepository.findOpenedJarIdsByJarIds(jarIds)
        );
    }
}
