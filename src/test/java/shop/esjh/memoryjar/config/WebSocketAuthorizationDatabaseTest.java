package shop.esjh.memoryjar.config;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import shop.esjh.memoryjar.entity.RefreshToken;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.jwt.SessionValidityService;
import shop.esjh.memoryjar.repository.*;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import static org.assertj.core.api.Assertions.*;

/** 외부 소켓 없이 300명·16개 작업 스레드의 실제 DB 검사 수와 대기 포함 응답 시간을 비교한다. */
@DataJpaTest(showSql=false,properties="spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import({JpaAuditConfig.class,SessionValidityService.class})
@Transactional(propagation=Propagation.NOT_SUPPORTED)
class WebSocketAuthorizationDatabaseTest extends AbstractMariaDbRepositoryTest {
    @Autowired UserRepository users;
    @Autowired JarMemberRepository members;
    @Autowired SessionValidityService sessions;
    @Autowired PlatformTransactionManager manager;
    @Autowired EntityManagerFactory factory;
    @Autowired JdbcTemplate jdbc;
    record Peer(long id,String session,long jar) {}
    List<Peer> peers(int count) {
        return new TransactionTemplate(manager).execute(tx->{
            String batch=UUID.randomUUID().toString();var owner=saveUser(batch,batch+"@example.com","시험");
            var jar=saveJar(owner,"배달 권한 시험",LocalDateTime.now().plusDays(1));
            List<Peer> peers=new ArrayList<>();
            for(int i=0;i<count;i++){
                String id=UUID.randomUUID().toString();var user=saveUser(id,id+"@example.com","시험");
                saveJarMember(jar,user,JarRole.MEMBER,LocalDateTime.now());
                var token=RefreshToken.builder().user(user).tokenHash(id.replace("-","")+"a".repeat(32))
                        .sessionId(id).expiresAt(now().plusHours(1)).build();entityManager.persist(token);
                peers.add(new Peer(user.getId(),id,jar.getJarId()));
            }
            entityManager.flush();return peers;
        });
    }
    LocalDateTime now(){return LocalDateTime.now(ZoneId.of("Asia/Seoul"));}
    @Test void combinedCheckRejectsRevokedSessionMemberAndDeletedJar() {
        var peer=peers(1).get(0);
        assertThat(sessions.isCurrentJarSession(peer.id(),0,peer.session(),peer.jar())).isTrue();
        jdbc.update("UPDATE refresh_tokens SET revoked_at=NOW() WHERE session_id=?",peer.session());
        assertThat(sessions.isCurrentJarSession(peer.id(),0,peer.session(),peer.jar())).isFalse();
        jdbc.update("UPDATE refresh_tokens SET revoked_at=NULL WHERE session_id=?",peer.session());
        jdbc.update("UPDATE jar_members SET deleted_at=NOW() WHERE jar_id=? AND user_id=?",peer.jar(),peer.id());
        assertThat(sessions.isCurrentJarSession(peer.id(),0,peer.session(),peer.jar())).isFalse();
        jdbc.update("UPDATE jar_members SET deleted_at=NULL WHERE jar_id=? AND user_id=?",peer.jar(),peer.id());
        jdbc.update("UPDATE jars SET deleted_at=NOW() WHERE jar_id=?",peer.jar());
        assertThat(sessions.isCurrentJarSession(peer.id(),0,peer.session(),peer.jar())).isFalse();
    }
    @Test void threeHundredRecipientsUseThreeHundredQueriesInsteadOfSixHundred() throws Exception {
        var peers=peers(300);var statistics=factory.unwrap(SessionFactory.class).getStatistics();statistics.setStatisticsEnabled(true);
        // 쿼리 계획·접속 초기 준비를 양쪽 모두 한 번 수행하고 실제 비교를 시작한다.
        var p=peers.get(0);sessions.isCurrent(p.id(),0,p.session());members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(p.jar(),p.id());
        sessions.isCurrentJarSession(p.id(),0,p.session(),p.jar());
        statistics.clear();var before=run(peers,false);long oldQueries=statistics.getPrepareStatementCount();
        statistics.clear();var after=run(peers,true);long newQueries=statistics.getPrepareStatementCount();
        assertThat(oldQueries).isEqualTo(600);assertThat(newQueries).isEqualTo(300);
        System.out.println("AUTHORIZATION_300 "+Map.of("beforeQueries",oldQueries,"afterQueries",newQueries,
                "beforeMeanMs",mean(before),"afterMeanMs",mean(after),"beforeP95Ms",p95(before),"afterP95Ms",p95(after),"threads",16));
    }
    List<Long> run(List<Peer> peers,boolean combined) throws Exception {
        var executor=Executors.newFixedThreadPool(16);
        try {
            List<Callable<Long>> tasks=peers.stream().map(p->(Callable<Long>)()->{
                long start=System.nanoTime();boolean allowed=combined?sessions.isCurrentJarSession(p.id(),0,p.session(),p.jar()):
                        sessions.isCurrent(p.id(),0,p.session())&&members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(p.jar(),p.id());
                assertThat(allowed).isTrue();return System.nanoTime()-start;
            }).toList();
            List<Long> times=new ArrayList<>();for(var task:executor.invokeAll(tasks,30,TimeUnit.SECONDS))times.add(task.get());return times;
        } finally {executor.shutdownNow();}
    }
    double mean(List<Long> times){return times.stream().mapToLong(Long::longValue).average().orElseThrow()/1_000_000d;}
    double p95(List<Long> times){return times.stream().sorted().toList().get((int)Math.ceil(times.size()*.95)-1)/1_000_000d;}
}
