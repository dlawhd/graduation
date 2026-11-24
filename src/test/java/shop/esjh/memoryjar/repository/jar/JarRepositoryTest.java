package shop.esjh.memoryjar.repository.jar;

import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.jar.JarOpenReason;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * JarRepository의 soft delete, 목록 조회, 오픈 대상 조회 쿼리를 검증한다.
 */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=none")
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class JarRepositoryTest extends AbstractMariaDbRepositoryTest {

    @Autowired
    private JarRepository jarRepository;

    @Autowired private shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository drafts;
    @Autowired private JarMemberRepository memberships;

    @Test
    void personalFiltersApplyBeforePagingAndExcludeOtherAccountsAndDeletedMemberships() {
        var now = LocalDateTime.now();
        var owner = saveUser("shelf-owner", "shelf-owner@example.invalid", "나");
        var other = saveUser("shelf-other", "shelf-other@example.invalid", "다른 계정");
        var first = saveJar(owner,"우리 봄",now.plusDays(3));
        var second = saveJar(owner,"우리 여름",now.minusDays(1));
        var stranger = saveJar(other,"우리 비밀",now.minusDays(1));
        var deleted = saveJar(owner,"우리 탈퇴",now.plusDays(1));
        var firstMember = saveJarMember(first,owner,JarRole.OWNER,now);
        firstMember.changeFavorite(true);
        saveJarMember(second,owner,JarRole.OWNER,now);
        saveJarMember(stranger,other,JarRole.OWNER,now).changeFavorite(true);
        saveJarMember(deleted,owner,JarRole.OWNER,now).leave();
        flushAndClear();
        var page = jarRepository.searchMyJars(owner.getId(),"%우리%","ALL",false,now,PageRequest.of(0,1));
        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getTotalPages()).isEqualTo(2);
        assertThat(jarRepository.searchMyJars(owner.getId(),"%우리%","LOCKED",true,now,PageRequest.of(0,9)).getContent())
                .extracting(Jar::getJarId).containsExactly(first.getJarId());
        assertThat(jarRepository.searchMyJars(owner.getId(),"","OPEN",false,now,PageRequest.of(0,9)).getContent())
                .extracting(Jar::getJarId).containsExactly(second.getJarId());
        assertThat(jarRepository.searchMyJars(owner.getId(),"%비밀%","ALL",false,now,PageRequest.of(0,9))).isEmpty();
        var settings = memberships.findMyRolesByJarIdsAndUserId(java.util.List.of(first.getJarId(),second.getJarId(),stranger.getJarId()),owner.getId());
        assertThat(settings).hasSize(2);
        assertThat(settings.stream().filter(row -> row.getJarId().equals(first.getJarId())).findFirst().orElseThrow().getFavorite()).isTrue();
        assertThat(settings.stream().filter(row -> row.getJarId().equals(second.getJarId())).findFirst().orElseThrow().getFavorite()).isFalse();
    }

    @Test
    void openingRecordAlsoCountsAsOpenWhenScheduledTimeHasMoved() {
        var now = LocalDateTime.now();
        var owner = saveUser("shelf-event", "shelf-event@example.invalid", "나");
        var jar = saveJar(owner,"이미 열림",now.plusDays(3));
        saveJarMember(jar,owner,JarRole.OWNER,now);
        saveJarOpenEvent(jar,now.minusDays(1),JarOpenReason.SCHEDULED);
        flushAndClear();
        assertThat(jarRepository.searchMyJars(owner.getId(),"","OPEN",false,now,PageRequest.of(0,9)).getContent())
                .extracting(Jar::getJarId).containsExactly(jar.getJarId());
        assertThat(jarRepository.searchMyJars(owner.getId(),"","LOCKED",false,now,PageRequest.of(0,9))).isEmpty();
    }

    @Test
    void resumeListOnlyContainsOwnersActiveUnexpiredDraftsAndPaginates() {
        var now = LocalDateTime.now();
        var owner = saveUser("resume-owner","resume-owner@example.invalid","나");
        var other = saveUser("resume-other","resume-other@example.invalid","다른 계정");
        var active = shop.esjh.memoryjar.entity.ai.JarDesignDraft.builder().owner(owner).originalS3Key("test/active").expiresAt(now.plusDays(1)).build();
        entityManager.persist(active);
        entityManager.persist(shop.esjh.memoryjar.entity.ai.JarDesignDraft.builder().owner(other).originalS3Key("test/other").expiresAt(now.plusDays(1)).build());
        var expired = shop.esjh.memoryjar.entity.ai.JarDesignDraft.builder().owner(owner).originalS3Key("test/expired").expiresAt(now.plusDays(1)).build();
        entityManager.persist(expired);
        var terminal = shop.esjh.memoryjar.entity.ai.JarDesignDraft.builder().owner(owner).originalS3Key("test/terminal").expiresAt(now.plusDays(1)).build();
        org.springframework.test.util.ReflectionTestUtils.setField(terminal,"status",shop.esjh.memoryjar.enums.ai.JarDraftStatus.ABANDONED);
        entityManager.persist(terminal);
        flushAndClear();
        // 생성 시점보다 과거로 만료일을 넣을 수 없다는 DB 제약을 지킨 채 시간이 흐른 상황을 만든다.
        entityManager.createNativeQuery("update jar_design_drafts set created_at = :created, expires_at = :expired where draft_id = :id")
                .setParameter("created", now.minusDays(2)).setParameter("expired", now.minusSeconds(1)).setParameter("id", expired.getDraftId()).executeUpdate();
        var result = drafts.findResumable(owner.getId(),shop.esjh.memoryjar.enums.ai.JarDraftStatus.ACTIVE,now,PageRequest.of(0,1));
        assertThat(result.getContent()).extracting(shop.esjh.memoryjar.entity.ai.JarDesignDraft::getDraftId)
                .containsExactly(active.getDraftId());
        assertThat(result.hasNext()).isFalse();
        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(drafts.findResumable(owner.getId(),shop.esjh.memoryjar.enums.ai.JarDraftStatus.ACTIVE,now,PageRequest.of(1,1))).isEmpty();
    }

    @Test
    @DisplayName("findByJarId는 삭제되지 않은 저금통을 조회한다")
    void findByJarId_returnsActiveJar() {
        User owner = saveUser("owner-jar-find", "owner-find@example.com", "owner");
        Jar jar = saveJar(owner, "find-jar", LocalDateTime.now().plusDays(3));

        flushAndClear();

        assertThat(jarRepository.findByJarId(jar.getJarId()))
                .isPresent()
                .get()
                .extracting(Jar::getName)
                .isEqualTo("find-jar");
    }

    @Test
    @DisplayName("findByJarId는 soft delete 된 저금통을 제외한다")
    void findByJarId_excludesSoftDeletedJar() {
        User owner = saveUser("owner-jar-delete", "owner-delete@example.com", "owner");
        Jar jar = saveJar(owner, "deleted-jar", LocalDateTime.now().plusDays(3));

        jarRepository.delete(jar);
        flushAndClear();

        assertThat(jarRepository.findByJarId(jar.getJarId())).isEmpty();
    }

    @Test
    @DisplayName("findDetailByJarId는 owner를 함께 조회한다")
    void findDetailByJarId_fetchesOwner() {
        User owner = saveUser("owner-jar-detail", "owner-detail@example.com", "owner-name");
        Jar jar = saveJar(owner, "detail-jar", LocalDateTime.now().plusDays(1));

        flushAndClear();

        assertThat(jarRepository.findDetailByJarId(jar.getJarId()))
                .isPresent()
                .get()
                .extracting(found -> found.getOwner().getName())
                .isEqualTo("owner-name");
    }

    @Test
    @DisplayName("findMyJarsByUserId는 active membership만 updatedAt 내림차순으로 반환한다")
    void findMyJarsByUserId_returnsOnlyActiveJarsInUpdatedOrder() {
        User owner = saveUser("owner-jar-list", "owner-list@example.com", "owner");
        User member = saveUser("member-jar-list", "member-list@example.com", "member");
        Jar olderJar = saveJar(owner, "older-jar", LocalDateTime.now().plusDays(2));
        saveJarMember(olderJar, member, JarRole.MEMBER, LocalDateTime.now().minusDays(2));

        Jar newerJar = saveJar(owner, "newer-jar", LocalDateTime.now().plusDays(3));
        saveJarMember(newerJar, member, JarRole.MEMBER, LocalDateTime.now().minusDays(1));

        Jar leftJar = saveJar(owner, "left-jar", LocalDateTime.now().plusDays(4));
        var leftMember = saveJarMember(leftJar, member, JarRole.MEMBER, LocalDateTime.now());
        leftMember.leave();

        flushAndClear();

        Page<Jar> result = jarRepository.findMyJarsByUserId(member.getId(), PageRequest.of(0, 10));

        assertThat(result.getContent()).extracting(Jar::getName)
                .containsExactly("newer-jar", "older-jar");
    }

    @Test
    @DisplayName("findDueJarsWithoutOpenEvent는 열릴 시간이 지났고 오픈 이력이 없는 저금통만 조회한다")
    void findDueJarsWithoutOpenEvent_returnsOnlyDueJarsWithoutEvent() {
        User owner = saveUser("owner-jar-due", "owner-due@example.com", "owner");
        Jar dueJar = saveJar(owner, "due-jar", LocalDateTime.now().minusHours(1));
        Jar dueButOpenedJar = saveJar(owner, "opened-jar", LocalDateTime.now().minusHours(2));
        Jar futureJar = saveJar(owner, "future-jar", LocalDateTime.now().plusHours(2));
        saveJarOpenEvent(dueButOpenedJar, LocalDateTime.now().minusMinutes(30), JarOpenReason.SCHEDULED);

        flushAndClear();

        List<Jar> result = jarRepository.findDueJarsWithoutOpenEvent(LocalDateTime.now());

        assertThat(result).extracting(Jar::getName).containsExactly("due-jar");
        assertThat(result).extracting(Jar::getJarId)
                .doesNotContain(dueButOpenedJar.getJarId(), futureJar.getJarId());
    }

    @Test
    @DisplayName("existsByJarIdAndOwner_Id는 owner 여부를 확인한다")
    void existsByJarIdAndOwnerId_checksOwnerMatch() {
        User owner = saveUser("owner-jar-owner", "owner-owner@example.com", "owner");
        User other = saveUser("other-jar-owner", "other-owner@example.com", "other");
        Jar jar = saveJar(owner, "owner-check-jar", LocalDateTime.now().plusDays(1));

        flushAndClear();

        assertThat(jarRepository.existsByJarIdAndOwner_Id(jar.getJarId(), owner.getId())).isTrue();
        assertThat(jarRepository.existsByJarIdAndOwner_Id(jar.getJarId(), other.getId())).isFalse();
    }
}
