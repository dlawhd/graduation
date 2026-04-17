package com.example.demo.service.jar;

import com.example.demo.dto.jar.request.*;
import com.example.demo.dto.jar.response.*;
import com.example.demo.entity.User;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.jar.JarInvite;
import com.example.demo.entity.jar.JarMember;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarRole;
import com.example.demo.enums.jar.JarTheme;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.jar.JarInviteRepository;
import com.example.demo.repository.jar.JarMemberRepository;
import com.example.demo.repository.jar.JarRepository;
import com.example.demo.service.notification.NotificationService;
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

    private JarService jarService;

    private NotificationService notificationService;

    @BeforeEach
    void setUp() {
        jarService = new JarService(
                jarRepository,
                jarMemberRepository,
                jarInviteRepository,
                userRepository,
                jarOpenService,
                notificationService
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
                JarTheme.CUSTOM,
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
        when(jarMemberRepository.findByJar_JarIdAndUser_Id(10L, 1L)).thenReturn(Optional.empty());
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
                .theme(JarTheme.CUSTOM)
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
        when(jarMemberRepository.findByJar_JarIdAndUser_Id(10L, 1L))
                .thenReturn(Optional.of(activeMember));

        // when & then
        assertThatThrownBy(() -> jarService.joinByInvite(1L, new JarInviteJoinRequest("ABCD1234")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("이미 이 저금통의 멤버");
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                JarTheme.FAMILY,
                5,
                LocalDateTime.parse("2027-02-27T00:00:00+09:00"),
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
        assertThat(jar.getTheme()).isEqualTo(JarTheme.FAMILY);
        assertThat(jar.getMaxMembers()).isEqualTo(5);

        assertThat(response.jarId()).isEqualTo(10L);
        assertThat(response.updatedAt()).isNotNull();
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
                .theme(JarTheme.CUSTOM)
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
}