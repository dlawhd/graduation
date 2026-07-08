package shop.esjh.memoryjar.service.jar;


import org.junit.jupiter.api.DisplayName;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import shop.esjh.memoryjar.dto.jar.request.*;
import shop.esjh.memoryjar.dto.jar.response.*;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.entity.jar.JarInvite;
import shop.esjh.memoryjar.entity.jar.JarMember;
import shop.esjh.memoryjar.enums.jar.JarLockLevel;
import shop.esjh.memoryjar.enums.jar.JarOpenMode;
import shop.esjh.memoryjar.enums.jar.JarRole;
import shop.esjh.memoryjar.enums.jar.JarTheme;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.jar.JarInviteRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.service.chat.ChatSystemMessageService;
import shop.esjh.memoryjar.service.notification.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JarServiceTest {

    @Mock
    private JarRepository jarRepository;

    @Mock
    private JarMemberRepository jarMemberRepository;

    @Mock
    private JarInviteRepository jarInviteRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private JarOpenService  jarOpenService;

    @Mock
    private JarService jarService;

    @Mock
    private NotificationService notificationService;

    @Mock
    private JarMemberRealtimeService jarMemberRealtimeService;

    @Mock
    private ChatSystemMessageService chatSystemMessageService;

    @BeforeEach
    void setUp() {
        jarService = new JarService(
                jarRepository,
                jarMemberRepository,
                jarInviteRepository,
                userRepository,
                jarOpenService,
                notificationService,
                jarMemberRealtimeService,
                chatSystemMessageService
        );
    }

    @Test
    void createJar는_저금통과_OWNER멤버를_함께_생성한다() {
        // given
        User user = User.builder()
                .id(1L)
                .email("test@test.com")
                .name("은서")
                .birthyear("2000")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        JarCreateRequest request = new JarCreateRequest(
                "우리 저금통",
                "1년 뒤에 열어보자",
                JarTheme.SPRING,
                2,
                LocalDateTime.of(2026, 12, 31, 0, 0, 0),
                JarOpenMode.ALL_AT_ONCE,
                JarLockLevel.HIDDEN
        );

        when(userRepository.findById(1L)).thenReturn(Optional.of(user));

        // save 된 Jar를 그대로 반환하면서, DB가 채워줄 값들을 테스트에서 직접 넣어줌
        when(jarRepository.save(any(Jar.class))).thenAnswer(invocation -> {
            Jar jar = invocation.getArgument(0);
            ReflectionTestUtils.setField(jar, "jarId", 100L);
            ReflectionTestUtils.setField(jar, "createdAt", LocalDateTime.of(2026, 3, 23, 10, 0));
            ReflectionTestUtils.setField(jar, "updatedAt", LocalDateTime.of(2026, 3, 23, 10, 0));
            return jar;
        });

        ArgumentCaptor<Jar> jarCaptor = ArgumentCaptor.forClass(Jar.class);
        ArgumentCaptor<JarMember> memberCaptor = ArgumentCaptor.forClass(JarMember.class);

        // when
        JarCreateResponse response = jarService.createJar(1L, request);

        // then
        verify(jarRepository).save(jarCaptor.capture());
        verify(jarMemberRepository).save(memberCaptor.capture());

        Jar savedJar = jarCaptor.getValue();
        JarMember savedOwnerMember = memberCaptor.getValue();

        assertThat(savedJar.getOwner()).isEqualTo(user);
        assertThat(savedJar.getName()).isEqualTo("우리 저금통");
        assertThat(savedJar.getMaxMembers()).isEqualTo(2);

        assertThat(savedOwnerMember.getUser()).isEqualTo(user);
        assertThat(savedOwnerMember.getRole()).isEqualTo(JarRole.OWNER);

        assertThat(response.jarId()).isEqualTo(100L);
        assertThat(response.name()).isEqualTo("우리 저금통");
        assertThat(response.myRole()).isEqualTo(JarRole.OWNER);
    }

    @Test
    void listMembers는_active멤버_목록을_반환한다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User otherUser = User.builder()
                .id(2L)
                .name("현수")
                .provider("NAVER")
                .providerId("naver-456")
                .build();

        Jar jar = Jar.builder()
                .owner(currentUser)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(2)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember myMember = JarMember.createOwner(jar, currentUser);
        JarMember otherMember = JarMember.createMember(jar, otherUser);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(myMember));
        when(jarMemberRepository.findActiveMembersWithUserByJarId(10L))
                .thenReturn(List.of(myMember, otherMember));

        // when
        JarMemberListResponse response = jarService.listMembers(1L, 10L);

        // then
        assertThat(response.items()).hasSize(2);
        assertThat(response.items().get(0).name()).isEqualTo("은서");
        assertThat(response.items().get(1).name()).isEqualTo("현수");
    }

    @Test
    void createInvite는_OWNER가_초대코드를_생성한다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        Jar jar = Jar.builder()
                .owner(currentUser)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(2)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, currentUser);

        JarInviteCreateRequest request = new JarInviteCreateRequest(24, 1);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));
        when(jarRepository.findByJarId(10L))
                .thenReturn(Optional.of(jar));
        when(userRepository.findById(1L))
                .thenReturn(Optional.of(currentUser));
        when(jarInviteRepository.findByCode(anyString()))
                .thenReturn(Optional.empty());

        when(jarInviteRepository.save(any(JarInvite.class))).thenAnswer(invocation -> {
            JarInvite invite = invocation.getArgument(0);
            ReflectionTestUtils.setField(invite, "inviteId", 500L);
            ReflectionTestUtils.setField(invite, "createdAt", LocalDateTime.of(2026, 3, 23, 12, 0));
            ReflectionTestUtils.setField(invite, "updatedAt", LocalDateTime.of(2026, 3, 23, 12, 0));
            return invite;
        });

        // when
        JarInviteCreateResponse response = jarService.createInvite(1L, 10L, request);

        // then
        assertThat(response.inviteId()).isEqualTo(500L);
        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.code()).isNotBlank();
        assertThat(response.maxUses()).isEqualTo(1);
        assertThat(response.usedCount()).isEqualTo(0);
        assertThat(response.isActive()).isTrue();
    }

    @Test
    void joinByInvite는_처음_참여를_성공시킨다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User owner = User.builder()
                .id(2L)
                .name("주인")
                .provider("NAVER")
                .providerId("naver-999")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarInvite invite = JarInvite.builder()
                .jar(jar)
                .createdBy(owner)
                .code("ABCD1234")
                .expiresAt(LocalDateTime.now().plusHours(24))
                .maxUses(1)
                .build();

        JarInviteJoinRequest request = new JarInviteJoinRequest("ABCD1234");

        when(userRepository.findById(1L)).thenReturn(Optional.of(currentUser));
        when(jarInviteRepository.findByCodeForUpdate("ABCD1234")).thenReturn(Optional.of(invite));
        when(jarRepository.findByJarIdForUpdate(10L)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.findAnyByJarIdAndUserIdIncludingDeleted(10L, 1L)).thenReturn(Optional.empty());
        when(jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(10L)).thenReturn(1L);

        // when
        JarInviteJoinResponse response = jarService.joinByInvite(1L, request);

        // then
        verify(jarMemberRepository).save(any(JarMember.class));
        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.name()).isEqualTo("우리 저금통");
        assertThat(response.myRole()).isEqualTo(JarRole.MEMBER);
        assertThat(invite.getUsedCount()).isEqualTo(1);
    }

    @Test
    void joinByInvite는_이미_active멤버면_예외가_난다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User owner = User.builder()
                .id(2L)
                .name("주인")
                .provider("NAVER")
                .providerId("naver-999")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarInvite invite = JarInvite.builder()
                .jar(jar)
                .createdBy(owner)
                .code("ABCD1234")
                .expiresAt(LocalDateTime.now().plusHours(24))
                .maxUses(1)
                .build();

        JarMember activeMember = JarMember.createMember(jar, currentUser);

        when(userRepository.findById(1L)).thenReturn(Optional.of(currentUser));
        when(jarInviteRepository.findByCodeForUpdate("ABCD1234")).thenReturn(Optional.of(invite));
        when(jarRepository.findByJarIdForUpdate(10L)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.findAnyByJarIdAndUserIdIncludingDeleted(10L, 1L))
                .thenReturn(Optional.of(activeMember));

        // when & then
        assertThatThrownBy(() -> jarService.joinByInvite(1L, new JarInviteJoinRequest("ABCD1234")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("이미 이 저금통의 멤버");
    }

    @Test
    void joinByInvite는_나갔던_멤버를_새로_저장하지_않고_재가입시킨다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User owner = User.builder()
                .id(2L)
                .name("주인")
                .provider("NAVER")
                .providerId("naver-999")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarInvite invite = JarInvite.builder()
                .jar(jar)
                .createdBy(owner)
                .code("ABCD1234")
                .expiresAt(LocalDateTime.now().plusHours(24))
                .maxUses(5)
                .build();

        // 예전에 들어왔다가 나간 멤버를 만듭니다.
        JarMember leftMember = JarMember.createMember(jar, currentUser);

        // leave()를 호출하면 leftAt과 deletedAt이 찍힌 "나간 멤버"가 됩니다.
        leftMember.leave();

        when(userRepository.findById(1L)).thenReturn(Optional.of(currentUser));
        when(jarInviteRepository.findByCodeForUpdate("ABCD1234")).thenReturn(Optional.of(invite));
        when(jarRepository.findByJarIdForUpdate(10L)).thenReturn(Optional.of(jar));

        // 핵심:
        // 삭제된 row까지 포함해서 기존 멤버를 찾는 메서드가 leftMember를 반환해야 합니다.
        when(jarMemberRepository.findAnyByJarIdAndUserIdIncludingDeleted(10L, 1L))
                .thenReturn(Optional.of(leftMember));

        when(jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(10L)).thenReturn(1L);

        // when
        JarInviteJoinResponse response = jarService.joinByInvite(
                1L,
                new JarInviteJoinRequest("ABCD1234")
        );

        // then
        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.myRole()).isEqualTo(JarRole.MEMBER);

        // 기존 row를 다시 살렸으므로 새 멤버 save는 호출되면 안 됩니다.
        verify(jarMemberRepository, never()).save(any(JarMember.class));

        // 재가입되었으므로 deletedAt과 leftAt이 다시 null이 되어야 합니다.
        assertThat(leftMember.getDeletedAt()).isNull();
        assertThat(leftMember.getLeftAt()).isNull();

        // 초대코드 사용 횟수는 1 증가해야 합니다.
        assertThat(invite.getUsedCount()).isEqualTo(1);
    }

    @Test
    void leaveJar는_MEMBER가_저금통에서_나갈수있다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        Jar jar = Jar.builder()
                .owner(currentUser)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember member = JarMember.createMember(jar, currentUser);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(member));

        // when
        JarLeaveResponse response = jarService.leaveJar(1L, 10L);

        // then
        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.leftAt()).isNotNull();
        assertThat(member.getLeftAt()).isNotNull();
        assertThat(member.isDeleted()).isTrue();
    }

    @Test
    void leaveJar는_OWNER면_예외가_난다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        Jar jar = Jar.builder()
                .owner(currentUser)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, currentUser);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));

        // when & then
        assertThatThrownBy(() -> jarService.leaveJar(1L, 10L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("OWNER는 저금통을 바로 나갈 수 없어");
    }

    @Test
    void listInvites는_OWNER가_초대코드목록을_볼수있다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        Jar jar = Jar.builder()
                .owner(currentUser)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, currentUser);

        JarInvite invite = JarInvite.builder()
                .jar(jar)
                .createdBy(currentUser)
                .code("ABCD1234")
                .expiresAt(LocalDateTime.now().plusHours(24))
                .maxUses(1)
                .build();
        ReflectionTestUtils.setField(invite, "inviteId", 100L);
        ReflectionTestUtils.setField(invite, "createdAt", LocalDateTime.of(2026, 3, 23, 12, 0));

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));
        when(jarInviteRepository.findAllByJarIdOrderByCreatedAtDesc(10L))
                .thenReturn(List.of(invite));

        // when
        JarInviteListResponse response = jarService.listInvites(1L, 10L);

        // then
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).inviteId()).isEqualTo(100L);
        assertThat(response.items().get(0).code()).isEqualTo("ABCD1234");
    }

    @Test
    void revokeInvite는_OWNER가_초대코드를_폐기할수있다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        Jar jar = Jar.builder()
                .owner(currentUser)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, currentUser);

        JarInvite invite = JarInvite.builder()
                .jar(jar)
                .createdBy(currentUser)
                .code("ABCD1234")
                .expiresAt(LocalDateTime.now().plusHours(24))
                .maxUses(1)
                .build();
        ReflectionTestUtils.setField(invite, "inviteId", 100L);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));
        when(jarInviteRepository.findByInviteIdAndJar_JarId(100L, 10L))
                .thenReturn(Optional.of(invite));

        // when
        JarInviteRevokeResponse response = jarService.revokeInvite(1L, 10L, 100L);

        // then
        assertThat(response.inviteId()).isEqualTo(100L);
        assertThat(response.revokedAt()).isNotNull();
        assertThat(invite.getRevokedAt()).isNotNull();
    }

    @Test
    void updateMemberRole은_OWNER가_MEMBER를_ADMIN으로_바꿀수있다() {
        // given
        User owner = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User memberUser = User.builder()
                .id(2L)
                .name("현수")
                .provider("NAVER")
                .providerId("naver-456")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, owner);
        JarMember targetMember = JarMember.createMember(jar, memberUser);
        ReflectionTestUtils.setField(targetMember, "updatedAt", LocalDateTime.of(2026, 3, 23, 21, 0));

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));
        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 2L))
                .thenReturn(Optional.of(targetMember));

        // when
        JarMemberRoleUpdateResponse response = jarService.updateMemberRole(
                1L,
                10L,
                2L,
                new JarMemberRoleUpdateRequest(JarRole.ADMIN)
        );

        // then
        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.userId()).isEqualTo(2L);
        assertThat(response.role()).isEqualTo(JarRole.ADMIN);
        assertThat(targetMember.getRole()).isEqualTo(JarRole.ADMIN);
    }

    @Test
    void kickMember는_ADMIN이_MEMBER를_강퇴할수있다() {
        // given
        User admin = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User memberUser = User.builder()
                .id(2L)
                .name("현수")
                .provider("NAVER")
                .providerId("naver-456")
                .build();

        Jar jar = Jar.builder()
                .owner(admin)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember adminMember = JarMember.createMember(jar, admin);
        adminMember.changeRole(JarRole.ADMIN);

        JarMember targetMember = JarMember.createMember(jar, memberUser);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(adminMember));
        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 2L))
                .thenReturn(Optional.of(targetMember));

        // when
        JarKickResponse response = jarService.kickMember(1L, 10L, 2L);

        // then
        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.kickedUserId()).isEqualTo(2L);
        assertThat(response.kickedAt()).isNotNull();
        assertThat(targetMember.getLeftAt()).isNotNull();
        assertThat(targetMember.isDeleted()).isTrue();
    }

    @Test
    void updateMemberRole은_OWNER로_변경하려하면_예외가_난다() {
        // given
        User owner = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User memberUser = User.builder()
                .id(2L)
                .name("현수")
                .provider("NAVER")
                .providerId("naver-456")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, owner);
        JarMember targetMember = JarMember.createMember(jar, memberUser);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));
        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 2L))
                .thenReturn(Optional.of(targetMember));

        // when & then
        assertThatThrownBy(() -> jarService.updateMemberRole(
                1L, 10L, 2L, new JarMemberRoleUpdateRequest(JarRole.OWNER)
        ))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("OWNER 역할 변경");
    }

    @Test
    void updateJar는_OWNER가_저금통설정을_수정할수있다() {
        // given
        User owner = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("원래 설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();

        ReflectionTestUtils.setField(jar, "jarId", 10L);
        ReflectionTestUtils.setField(jar, "updatedAt", LocalDateTime.of(2026, 3, 23, 22, 0));

        JarMember ownerMember = JarMember.createOwner(jar, owner);

        JarUpdateRequest request = new JarUpdateRequest(
                "우리 저금통(수정)",
                "설명 바꿈",
                JarTheme.WINTER,
                5,
                LocalDateTime.parse("2027-02-27T00:00:00"),
                JarOpenMode.ALL_AT_ONCE,
                JarLockLevel.META_ONLY
        );

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));
        when(jarRepository.findByJarId(10L))
                .thenReturn(Optional.of(jar));
        when(jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(10L))
                .thenReturn(2L);
        when(jarRepository.save(any(Jar.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // when
        JarUpdateResponse response = jarService.updateJar(1L, 10L, request);

        // then
        assertThat(jar.getName()).isEqualTo("우리 저금통(수정)");
        assertThat(jar.getDescription()).isEqualTo("설명 바꿈");
        assertThat(jar.getTheme()).isEqualTo(JarTheme.WINTER);
        assertThat(jar.getMaxMembers()).isEqualTo(5);

        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.updatedAt()).isNotNull();
    }

    @Test
    @DisplayName("열린 저금통에서도 기존 오픈 정책 값이 같으면 테마를 수정할 수 있다")
    void updateJar_allowsThemeChangeWhenOpenPolicyValuesAreUnchanged() {
        /*
         * given
         *
         * 이미 열려 있는 저금통이라고 가정한다.
         *
         * 프론트가 openAt, openMode, lockLevel을 함께 보내지만
         * 기존 값과 모두 같고 테마만 달라진 상황이다.
         */

        User owner = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        LocalDateTime originalOpenAt =
                LocalDateTime.of(2026, 7, 1, 18, 0);

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("원래 설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(originalOpenAt)
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();

        ReflectionTestUtils.setField(jar, "jarId", 10L);
        ReflectionTestUtils.setField(
                jar,
                "updatedAt",
                LocalDateTime.of(2026, 7, 10, 10, 0)
        );

        JarMember ownerMember = JarMember.createOwner(jar, owner);

        /*
         * 오픈 정책 값은 기존 값과 똑같고,
         * 테마만 SPRING에서 WINTER로 바꾼다.
         */
        JarUpdateRequest request = new JarUpdateRequest(
                "우리 저금통",
                "원래 설명",
                JarTheme.WINTER,
                3,
                originalOpenAt,
                JarOpenMode.ALL_AT_ONCE,
                JarLockLevel.HIDDEN
        );

        when(
                jarMemberRepository
                        .findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L)
        ).thenReturn(Optional.of(ownerMember));

        when(jarRepository.findByJarId(10L))
                .thenReturn(Optional.of(jar));

        when(
                jarMemberRepository
                        .countByJar_JarIdAndDeletedAtIsNull(10L)
        ).thenReturn(1L);

        when(jarRepository.save(any(Jar.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        /*
         * when
         *
         * 저금통 수정 실행
         */
        JarUpdateResponse response =
                jarService.updateJar(1L, 10L, request);

        /*
         * then
         *
         * 테마가 정상적으로 바뀌어야 한다.
         */
        assertThat(jar.getTheme()).isEqualTo(JarTheme.WINTER);
        assertThat(response.jarId()).isEqualTo(10L);

        /*
         * 오픈 정책 값이 실제로 달라지지 않았기 때문에
         * 이미 열린 저금통인지 확인하는 기능도 호출하지 않아야 한다.
         */
        verify(
                jarOpenService,
                never()
        ).ensureOpenedIfDue(anyLong());
    }

    @Test
    @DisplayName("열린 저금통에서 오픈 날짜를 실제로 바꾸면 수정할 수 없다")
    void updateJar_rejectsActualOpenPolicyChangeAfterJarOpened() {
        /*
         * given
         *
         * 기존 오픈 날짜와 다른 날짜를 요청하는 상황이다.
         */

        User owner = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        LocalDateTime originalOpenAt =
                LocalDateTime.of(2026, 7, 1, 18, 0);

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("원래 설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(originalOpenAt)
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();

        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, owner);

        /*
         * 기존 날짜와 다른 오픈 날짜를 보낸다.
         */
        JarUpdateRequest request = new JarUpdateRequest(
                null,
                null,
                null,
                null,
                originalOpenAt.plusDays(1),
                null,
                null
        );

        when(
                jarMemberRepository
                        .findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L)
        ).thenReturn(Optional.of(ownerMember));

        when(jarRepository.findByJarId(10L))
                .thenReturn(Optional.of(jar));

        /*
         * 이미 열린 저금통이라고 가정한다.
         */
        when(jarOpenService.ensureOpenedIfDue(10L))
                .thenReturn(true);

        /*
         * when & then
         *
         * 실제 오픈 정책을 바꾸므로 오류가 발생해야 한다.
         */
        assertThatThrownBy(
                () -> jarService.updateJar(1L, 10L, request)
        )
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining(
                        "이미 열린 저금통은 오픈 정책을 다시 바꿀 수 없어."
                );

        /*
         * 오류가 발생했으므로 저금통 저장은 실행되면 안 된다.
         */
        verify(jarRepository, never()).save(any(Jar.class));
    }

    @Test
    void updateJar는_현재멤버수보다_maxMembers를_작게_줄이면_예외가_난다() {
        // given
        User owner = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("원래 설명")
                .theme(JarTheme.SPRING)
                .maxMembers(5)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();

        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, owner);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));
        when(jarRepository.findByJarId(10L))
                .thenReturn(Optional.of(jar));
        when(jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(10L))
                .thenReturn(3L);

        // when & then
        assertThatThrownBy(() -> jarService.updateJar(
                1L,
                10L,
                new JarUpdateRequest(null, null, null, 2, null, null, null)
        ))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("현재 참여 중인 멤버 수보다");
    }

    @Test
    void deleteJar는_OWNER가_저금통을_삭제할수있다() {
        // given
        User owner = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User memberUser = User.builder()
                .id(2L)
                .name("현수")
                .provider("NAVER")
                .providerId("naver-456")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember ownerMember = JarMember.createOwner(jar, owner);
        JarMember member = JarMember.createMember(jar, memberUser);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(ownerMember));
        when(jarRepository.findByJarId(10L))
                .thenReturn(Optional.of(jar));
        when(jarMemberRepository.findActiveMembersWithUserByJarId(10L))
                .thenReturn(List.of(ownerMember, member));

        // when
        jarService.deleteJar(1L, 10L);

        // then
        verify(jarRepository).delete(jar);
        assertThat(ownerMember.getLeftAt()).isNotNull();
        assertThat(member.getLeftAt()).isNotNull();
        assertThat(ownerMember.isDeleted()).isTrue();
        assertThat(member.isDeleted()).isTrue();
    }

    @Test
    void deleteJar는_OWNER가_아니면_예외가_난다() {
        // given
        User memberUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User owner = User.builder()
                .id(2L)
                .name("주인")
                .provider("NAVER")
                .providerId("naver-456")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarMember member = JarMember.createMember(jar, memberUser);

        when(jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(10L, 1L))
                .thenReturn(Optional.of(member));

        // when & then
        assertThatThrownBy(() -> jarService.deleteJar(1L, 10L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("저금통 삭제는 OWNER만");
    }

    @Test
    void joinByInvite는_나갔던_ADMIN도_MEMBER로_초기화해서_재가입시킨다() {
        // given
        User currentUser = User.builder()
                .id(1L)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-123")
                .build();

        User owner = User.builder()
                .id(2L)
                .name("주인")
                .provider("NAVER")
                .providerId("naver-999")
                .build();

        Jar jar = Jar.builder()
                .owner(owner)
                .name("우리 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(3)
                .openAt(LocalDateTime.now().plusDays(30))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(jar, "jarId", 10L);

        JarInvite invite = JarInvite.builder()
                .jar(jar)
                .createdBy(owner)
                .code("ABCD1234")
                .expiresAt(LocalDateTime.now().plusHours(24))
                .maxUses(5)
                .build();

        // 예전에 ADMIN 권한을 가지고 있던 멤버를 준비합니다.
        JarMember leftAdminMember = JarMember.createMember(jar, currentUser);
        leftAdminMember.changeRole(JarRole.ADMIN);

        // 저금통을 나간 상태로 만들어, 재가입 대상 row가 되게 합니다.
        leftAdminMember.leave();

        when(userRepository.findById(1L)).thenReturn(Optional.of(currentUser));
        when(jarInviteRepository.findByCodeForUpdate("ABCD1234")).thenReturn(Optional.of(invite));
        when(jarRepository.findByJarIdForUpdate(10L)).thenReturn(Optional.of(jar));
        when(jarMemberRepository.findAnyByJarIdAndUserIdIncludingDeleted(10L, 1L))
                .thenReturn(Optional.of(leftAdminMember));
        when(jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(10L)).thenReturn(1L);

        // when
        JarInviteJoinResponse response = jarService.joinByInvite(
                1L,
                new JarInviteJoinRequest("ABCD1234")
        );

        // then
        // 초대코드로 다시 들어오는 사람은 예전 ADMIN 권한을 이어받지 않고 MEMBER가 됩니다.
        assertThat(response.myRole()).isEqualTo(JarRole.MEMBER);
        assertThat(leftAdminMember.getRole()).isEqualTo(JarRole.MEMBER);

        // 기존 row를 다시 살리는 흐름이므로 새 멤버를 추가 저장하지 않습니다.
        verify(jarMemberRepository, never()).save(any(JarMember.class));
    }

    @Test
    @DisplayName("listMyJars는 이미 열린 저금통을 batch로 확인하고 미래 저금통은 보정 오픈하지 않는다")
    void listMyJars_usesBatchOpenedJarIdsAndSkipsFutureJars() {
        // given
        Long currentUserId = 1L;

        User owner = User.builder()
                .id(currentUserId)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-1")
                .build();

        Jar openedJar = Jar.builder()
                .owner(owner)
                .name("이미 열린 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(5)
                .openAt(LocalDateTime.now().minusDays(1))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(openedJar, "jarId", 10L);

        Jar futureJar = Jar.builder()
                .owner(owner)
                .name("아직 미래 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(5)
                .openAt(LocalDateTime.now().plusDays(1))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(futureJar, "jarId", 20L);

        Page<Jar> jarPage = new PageImpl<>(
                List.of(openedJar, futureJar),
                PageRequest.of(0, 20),
                2
        );

        when(jarRepository.findMyJarsByUserId(eq(currentUserId), any(Pageable.class)))
                .thenReturn(jarPage);

        when(jarMemberRepository.countActiveMembersByJarIds(List.of(10L, 20L)))
                .thenReturn(List.of(
                        new TestJarMemberCountView(10L, 2L),
                        new TestJarMemberCountView(20L, 1L)
                ));

        when(jarMemberRepository.findMyRolesByJarIdsAndUserId(List.of(10L, 20L), currentUserId))
                .thenReturn(List.of(
                        new TestMyJarRoleView(10L, JarRole.OWNER),
                        new TestMyJarRoleView(20L, JarRole.MEMBER)
                ));

        // 10번 저금통은 이미 열린 기록이 있다고 가정한다.
        when(jarOpenService.findOpenedJarIdSet(List.of(10L, 20L)))
                .thenReturn(Set.of(10L));

        // when
        JarListResponse response = jarService.listMyJars(currentUserId, 0, 20);

        // then
        assertThat(response.items()).hasSize(2);
        assertThat(response.items().get(0).isOpen()).isTrue();
        assertThat(response.items().get(1).isOpen()).isFalse();

        // 미래 저금통은 아직 열릴 수 없으므로 ensureOpenedIfDue를 호출하지 않는다.
        verify(jarOpenService, never()).ensureOpenedIfDue(20L);

        // 이미 열린 저금통도 batch 결과로 판단했으므로 다시 보정 오픈하지 않는다.
        verify(jarOpenService, never()).ensureOpenedIfDue(10L);
    }

    @Test
    @DisplayName("listMyJars는 openAt이 지난 미오픈 저금통만 보정 오픈한다")
    void listMyJars_opensOnlyDueUnopenedJars() {
        // given
        Long currentUserId = 1L;

        User owner = User.builder()
                .id(currentUserId)
                .name("은서")
                .provider("NAVER")
                .providerId("naver-1")
                .build();

        Jar dueJar = Jar.builder()
                .owner(owner)
                .name("열릴 시간이 지난 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(5)
                .openAt(LocalDateTime.now().minusHours(1))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(dueJar, "jarId", 10L);

        Jar futureJar = Jar.builder()
                .owner(owner)
                .name("아직 미래 저금통")
                .description("설명")
                .theme(JarTheme.SPRING)
                .maxMembers(5)
                .openAt(LocalDateTime.now().plusDays(1))
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.HIDDEN)
                .build();
        ReflectionTestUtils.setField(futureJar, "jarId", 20L);

        Page<Jar> jarPage = new PageImpl<>(
                List.of(dueJar, futureJar),
                PageRequest.of(0, 20),
                2
        );

        when(jarRepository.findMyJarsByUserId(eq(currentUserId), any(Pageable.class)))
                .thenReturn(jarPage);

        when(jarMemberRepository.countActiveMembersByJarIds(List.of(10L, 20L)))
                .thenReturn(List.of(
                        new TestJarMemberCountView(10L, 1L),
                        new TestJarMemberCountView(20L, 1L)
                ));

        when(jarMemberRepository.findMyRolesByJarIdsAndUserId(List.of(10L, 20L), currentUserId))
                .thenReturn(List.of(
                        new TestMyJarRoleView(10L, JarRole.OWNER),
                        new TestMyJarRoleView(20L, JarRole.MEMBER)
                ));

        // 아직 열린 기록은 없다고 가정한다.
        when(jarOpenService.findOpenedJarIdSet(List.of(10L, 20L)))
                .thenReturn(Set.of());

        // 10번은 openAt이 지났으므로 보정 오픈 성공.
        when(jarOpenService.ensureOpenedIfDue(10L))
                .thenReturn(true);

        // when
        JarListResponse response = jarService.listMyJars(currentUserId, 0, 20);

        // then
        assertThat(response.items()).hasSize(2);
        assertThat(response.items().get(0).isOpen()).isTrue();
        assertThat(response.items().get(1).isOpen()).isFalse();

        // 시간이 지난 저금통만 보정 오픈한다.
        verify(jarOpenService).ensureOpenedIfDue(10L);

        // 미래 저금통은 보정 오픈하지 않는다.
        verify(jarOpenService, never()).ensureOpenedIfDue(20L);
    }

    private record TestJarMemberCountView(
            Long jarId,
            Long memberCount
    ) implements JarMemberRepository.JarMemberCountView {

        @Override
        public Long getJarId() {
            return jarId;
        }

        @Override
        public Long getMemberCount() {
            return memberCount;
        }
    }

    private record TestMyJarRoleView(
            Long jarId,
            JarRole role
    ) implements JarMemberRepository.MyJarRoleView {

        @Override
        public Long getJarId() {
            return jarId;
        }

        @Override
        public JarRole getRole() {
            return role;
        }
    }
}