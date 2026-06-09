package shop.esjh.memoryjar.service.jar;

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
import shop.esjh.memoryjar.model.notification.NotificationPayload;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.jar.JarInviteRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.repository.jar.JarRepository;
import shop.esjh.memoryjar.service.chat.ChatSystemMessageService;
import shop.esjh.memoryjar.service.notification.NotificationService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

// 저금통 만들기
// 내가 들어간 저금통 목록 보기, 저금통 상세 보기, 멤버 목록 보기, 초대코드 만들기, 초대코드로 참여하기
@Service
@Transactional(readOnly = true)
public class JarService {

    private final JarOpenService jarOpenService;

    // 우리 서비스는 한국 시간 기준으로 응답을 맞춘다고 생각하고 +09:00으로 변환
    private static final ZoneOffset KST_OFFSET = ZoneOffset.ofHours(9);

    // 초대코드 기본 정책
    // 요청값이 비어 있으면 이 기본값을 사용
    private static final int DEFAULT_EXPIRES_HOURS = 24;
    private static final int DEFAULT_MAX_USES = 1;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final JarRepository jarRepository;
    private final JarMemberRepository jarMemberRepository;
    private final JarInviteRepository jarInviteRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final JarMemberRealtimeService jarMemberRealtimeService;
    private final ChatSystemMessageService chatSystemMessageService;

    public JarService(
            JarRepository jarRepository,
            JarMemberRepository jarMemberRepository,
            JarInviteRepository jarInviteRepository,
            UserRepository userRepository,
            JarOpenService jarOpenService,
            NotificationService notificationService,
            JarMemberRealtimeService jarMemberRealtimeService,
            ChatSystemMessageService chatSystemMessageService
    ) {
        this.jarRepository = jarRepository;
        this.jarMemberRepository = jarMemberRepository;
        this.jarInviteRepository = jarInviteRepository;
        this.userRepository = userRepository;
        this.jarOpenService = jarOpenService;
        this.notificationService = notificationService;
        this.jarMemberRealtimeService = jarMemberRealtimeService;
        this.chatSystemMessageService = chatSystemMessageService;
    }

    // 저금통을 새로 만드는 메서드야.
    // 꼭 같이 해야 하는 일: jars 테이블에 저금통 저장, jar_members 테이블에 OWNER 한 줄 저장
    @Transactional
    public JarCreateResponse createJar(Long currentUserId, JarCreateRequest request) {

        // 1. 현재 로그인한 사용자 찾기
        User currentUser = getUserOrThrow(currentUserId);

        // 2. openAt 변환값을 먼저 변수에 담아두기
        LocalDateTime openAt = request.openAt();

        // 3. 저금통 엔티티 만들기
        Jar jar = Jar.builder()
                .owner(currentUser)
                .name(request.name())
                .description(request.description())
                .theme(request.theme())
                .maxMembers(request.maxMembers())
                .openAt(openAt)
                .openMode(request.openMode())
                .lockLevel(request.lockLevel())
                .build();

        // 4. 저금통 먼저 저장
        Jar savedJar = jarRepository.save(jar);

        // 5. 만든 사람을 OWNER 멤버로도 저장
        JarMember ownerMember = JarMember.createOwner(savedJar, currentUser);
        jarMemberRepository.save(ownerMember);

        // 6. 응답 만들기
        return new JarCreateResponse(
                savedJar.getJarId(),
                savedJar.getName(),
                toKstOffsetDateTime(savedJar.getOpenAt()),
                savedJar.getOpenMode(),
                savedJar.getLockLevel(),
                JarRole.OWNER,
                toKstOffsetDateTime(savedJar.getCreatedAt())
        );
    }

    // 내가 현재 참여 중인 저금통 목록을 가져옴
    // 저금통 목록 화면에 필요한 memberCount / myRole은 batch 조회로 가져와 N+1 쿼리를 줄인다.
    public JarListResponse listMyJars(Long currentUserId, int page, int size) {

        // page, size는 너무 이상한 값이 들어오지 않게 간단히 보정
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), 100);

        Pageable pageable = PageRequest.of(safePage, safeSize);

        // 내가 active 멤버로 들어가 있는 저금통 목록 가져오기
        Page<Jar> jarPage = jarRepository.findMyJarsByUserId(currentUserId, pageable);

        // 현재 페이지에 있는 저금통들만 꺼낸다.
        List<Jar> jars = jarPage.getContent();

        // 현재 페이지에 저금통이 하나도 없으면 추가 조회 없이 빈 목록을 반환한다.
        if (jars.isEmpty()) {
            return new JarListResponse(
                    List.of(),
                    jarPage.getNumber(),
                    jarPage.getSize(),
                    jarPage.getTotalElements(),
                    jarPage.getTotalPages()
            );
        }

        // 현재 페이지에 있는 저금통 ID만 모은다.
        // 예: [1, 2, 3, 4, 5]
        List<Long> jarIds = jars.stream()
                .map(Jar::getJarId)
                .toList();

        // 저금통별 멤버 수를 한 번에 조회한 뒤 Map으로 바꾼다.
        // 예: {1=2, 2=5, 3=1}
        Map<Long, Long> memberCountMap = jarMemberRepository.countActiveMembersByJarIds(jarIds)
                .stream()
                .collect(Collectors.toMap(
                        JarMemberRepository.JarMemberCountView::getJarId,
                        JarMemberRepository.JarMemberCountView::getMemberCount
                ));

        // 저금통별 내 역할을 한 번에 조회한 뒤 Map으로 바꾼다.
        // 예: {1=OWNER, 2=MEMBER, 3=ADMIN}
        Map<Long, JarRole> myRoleMap = jarMemberRepository.findMyRolesByJarIdsAndUserId(jarIds, currentUserId)
                .stream()
                .collect(Collectors.toMap(
                        JarMemberRepository.MyJarRoleView::getJarId,
                        JarMemberRepository.MyJarRoleView::getRole
                ));

        // 각 저금통을 목록용 DTO로 변환한다.
        List<JarListItem> items = jars.stream()
                .map(jar -> {
                    Long jarId = jar.getJarId();

                    // 멤버 수가 없으면 0명으로 처리한다.
                    // 정상 상황에서는 active 멤버가 있기 때문에 보통 0은 나오지 않는다.
                    long memberCount = memberCountMap.getOrDefault(jarId, 0L);

                    // 현재 사용자의 역할을 가져온다.
                    JarRole myRole = myRoleMap.get(jarId);

                    // 내가 속한 저금통 목록인데 역할이 없으면 데이터가 꼬인 상황이므로 막는다.
                    if (myRole == null) {
                        throw new ResponseStatusException(
                                HttpStatus.FORBIDDEN,
                                "현재 저금통 멤버가 아니야."
                        );
                    }

                    return new JarListItem(
                            jarId,
                            jar.getName(),
                            jar.getTheme(),
                            jar.getDescription(),
                            Math.toIntExact(memberCount),
                            jar.getMaxMembers(),
                            toKstOffsetDateTime(jar.getOpenAt()),
                            jar.getOpenMode(),
                            jar.getLockLevel(),
                            isOpen(jar),
                            myRole,
                            toKstOffsetDateTime(jar.getUpdatedAt())
                    );
                })
                .toList();

        return new JarListResponse(
                items,
                jarPage.getNumber(),
                jarPage.getSize(),
                jarPage.getTotalElements(),
                jarPage.getTotalPages()
        );
    }

    // 저금통 상세 정보를 가져옴
    public JarDetailResponse getJarDetail(Long currentUserId, Long jarId) {

        // 1. 저금통 찾기
        Jar jar = jarRepository.findDetailByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 2. 현재 사용자가 active 멤버인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);

        // 3. 현재 active 멤버 수 세기
        long memberCount = jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(jarId);

        // 4. 상세 응답 만들기
        return new JarDetailResponse(
                jar.getJarId(),
                jar.getName(),
                jar.getDescription(),
                jar.getTheme(),
                jar.getOwner().getId(),
                (int) memberCount,
                jar.getMaxMembers(),
                toKstOffsetDateTime(jar.getOpenAt()),
                jar.getOpenMode(),
                jar.getLockLevel(),
                isOpen(jar),
                myMember.getRole(),
                toKstOffsetDateTime(jar.getCreatedAt()),
                toKstOffsetDateTime(jar.getUpdatedAt())
        );
    }

    // 저금통 멤버 목록을 가져옴
    public JarMemberListResponse listMembers(Long currentUserId, Long jarId) {

        // 1. 먼저 현재 사용자가 이 저금통 멤버인지 검사
        getActiveMemberOrThrow(jarId, currentUserId);

        // 2. active 멤버 전체 조회
        List<JarMember> members = jarMemberRepository.findActiveMembersWithUserByJarId(jarId);

        // 3. DTO로 변환
        List<JarMemberItem> items = members.stream()
                .map(member -> new JarMemberItem(
                        member.getUser().getId(),
                        member.getUser().getName(),

                        // 현재 User 엔티티에는 profileImageUrl 필드가 없어서 일단 null
                        null,

                        member.getRole(),
                        toKstOffsetDateTime(member.getJoinedAt())
                ))
                .toList();

        return new JarMemberListResponse(items);
    }

    // 초대코드를 만드는 메서드
    // OWNER / ADMIN 만 만들 수 있음, 기본 추천값: 24시간, 1회 사용
    @Transactional
    public JarInviteCreateResponse createInvite(
            Long currentUserId,
            Long jarId,
            JarInviteCreateRequest request
    ) {

        // 1. 현재 사용자가 이 저금통에서 OWNER / ADMIN 인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);
        if (!myMember.isAdminOrOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "초대코드는 OWNER 또는 ADMIN만 만들 수 있어."
            );
        }

        // 2. 저금통 찾기
        Jar jar = jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 3. 현재 사용자 찾기
        User currentUser = getUserOrThrow(currentUserId);

        // 4. 요청값이 비어 있으면 기본값 사용
        int expiresInHours = request.expiresInHours() != null
                ? request.expiresInHours()
                : DEFAULT_EXPIRES_HOURS;

        int maxUses = request.maxUses() != null
                ? request.maxUses()
                : DEFAULT_MAX_USES;

        // 5. 중복되지 않는 초대코드 생성
        String code = generateUniqueInviteCode();

        // 6. 초대장 만들기
        JarInvite invite = JarInvite.builder()
                .jar(jar)
                .createdBy(currentUser)
                .code(code)
                .expiresAt(LocalDateTime.now().plusHours(expiresInHours))
                .maxUses(maxUses)
                .build();

        JarInvite savedInvite = jarInviteRepository.save(invite);

        // 7. 응답 만들기
        return new JarInviteCreateResponse(
                savedInvite.getInviteId(),
                jar.getJarId(),
                savedInvite.getCode(),

                // 프론트 라우팅 규칙이 정해지면 여기는 그 주소로 바꾸면 돼.
                // 지금은 예시 링크 형태만 넣어둘게.
                "/invite/" + savedInvite.getCode(),

                toKstOffsetDateTime(savedInvite.getExpiresAt()),
                savedInvite.getMaxUses(),
                savedInvite.getUsedCount(),
                savedInvite.isAvailable(LocalDateTime.now()),
                toKstOffsetDateTime(savedInvite.getCreatedAt())
        );
    }

    // 초대코드로 저금통에 참여하는 메서드
    // 초대코드 검사, 이미 멤버인지 검사, 정원 초과 검사, 멤버 추가 또는 재활성화, usedCount 증가
    @Transactional
    public JarInviteJoinResponse joinByInvite(Long currentUserId, JarInviteJoinRequest request) {
        LocalDateTime now = LocalDateTime.now();

        // 1. 현재 사용자 찾기
        User currentUser = getUserOrThrow(currentUserId);

        // 2. 초대코드를 잠금 조회
        JarInvite invite = jarInviteRepository.findByCodeForUpdate(request.code())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "초대코드를 찾을 수 없어."
                ));

        // 3. 초대코드 사용 가능 여부 검사
        if (invite.isRevoked()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이미 폐기된 초대코드야."
            );
        }

        if (invite.isExpired(now)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이미 만료된 초대코드야."
            );
        }

        if (invite.isExhausted()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이미 최대 사용 횟수를 다 쓴 초대코드야."
            );
        }

        // 4. 정원 체크를 안전하게 하려고 저금통도 잠금 조회
        Long jarId = invite.getJar().getJarId();
        Jar jar = jarRepository.findByJarIdForUpdate(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 5. 기존 멤버 row가 있는지 확인합니다. 삭제된 row까지 포함해서 찾아야 함
        // 예전에 나가거나 강퇴된 사람은 jar_members에 deleted_at이 찍힌 상태로 남음
        // 이 row를 다시 살려야 UNIQUE(jar_id, user_id) 충돌이 안남
        Optional<JarMember> existingMemberOpt =
                jarMemberRepository.findAnyByJarIdAndUserIdIncludingDeleted(jarId, currentUserId);

        // 6. 이미 active 멤버면 다시 들어올 필요가 없어
        if (existingMemberOpt.isPresent() && existingMemberOpt.get().isActive()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이미 이 저금통의 멤버야."
            );
        }

        // 7. 현재 active 멤버 수 검사
        long activeMemberCount = jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(jarId);
        if (activeMemberCount >= jar.getMaxMembers()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "저금통 정원이 가득 찼어."
            );
        }

        // 8. 새 멤버를 만들거나, 기존 row를 재활성화
        JarMember joinedMember;
        if (existingMemberOpt.isPresent()) {

            // 예전에 들어왔다가 나간 사람이라면 재가입 처리
            joinedMember = existingMemberOpt.get();
            joinedMember.rejoin();

            // 참고:
            // 지금은 예전 role을 그대로 유지해.
            // 재가입 시 항상 MEMBER로 바꾸고 싶다면 아래 한 줄을 열면 돼.
            // joinedMember.changeRole(JarRole.MEMBER);
        } else {
            // 처음 들어오는 사람이면 새 row 생성
            joinedMember = JarMember.createMember(jar, currentUser);
            jarMemberRepository.save(joinedMember);
        }

        // 9. 초대코드 사용 횟수 증가
        invite.increaseUsedCount();

        // 9-1. 저금통 입장 알림에 담을 정보 만들기
        NotificationPayload payload = new NotificationPayload(
                jar.getJarId(),
                null,
                null,
                currentUser.getId(),
                currentUser.getName(),
                null
        );

        // 9-2. 현재 저금통 멤버들 중 "방금 들어온 사람 제외" 하고 알림 보내기
        List<User> receivers = jarMemberRepository.findActiveMembersWithUserByJarId(jarId)
                .stream()
                .map(JarMember::getUser)
                .filter(user -> !user.getId().equals(currentUserId))
                .toList();

        // 9-3. 알림 저장
        notificationService.notifyJarMemberJoined(receivers, jar, payload);

        // 9-4. 저금통 상세 화면을 보고 있는 사람들에게 "새 멤버가 들어왔어!" 실시간 이벤트 보내기
        jarMemberRealtimeService.sendMemberEventAfterCommit(
                jarId,
                JarMemberSocketEventResponse.memberJoined(
                        jar.getJarId(),
                        currentUser.getId(),
                        currentUser.getName(),
                        joinedMember.getRole()
                )
        );

        // 9-5. 채팅방에도 "누가 들어왔어요" 시스템 메시지를 남긴다.
        // 이 메시지는 chat_messages 테이블에 SYSTEM 타입으로 저장되고, /topic/jars/{jarId}/chat 으로 실시간 전송된다.
        chatSystemMessageService.createAndSendMemberJoinedMessage(
                jar,
                currentUser.getName()
        );

        // 10. 참여 성공 응답
        return new JarInviteJoinResponse(
                jar.getJarId(),
                jar.getName(),
                joinedMember.getRole(),
                toKstOffsetDateTime(joinedMember.getJoinedAt())
        );
    }

    // 저금통에서 나가는 기능
    // 현재 active 멤버만 나갈 수 있음, OWNER는 그냥 나가면 안 됌(owner_id 와 OWNER 멤버 정합성이 깨지기 때문)
    @Transactional
    public JarLeaveResponse leaveJar(Long currentUserId, Long jarId) {
        // 1. 현재 사용자가 이 저금통의 active 멤버인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);

        // 2. OWNER는 leave 금지
        if (myMember.isOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "OWNER는 저금통을 바로 나갈 수 없어. 먼저 소유권을 넘기거나 저금통을 종료해야 해."
            );
        }

        // 3. WebSocket 이벤트에 사용할 정보를 먼저 꺼내둔다.
        // leave()를 해도 user/role 정보는 남아 있지만, 초보자가 봤을 때 안전하게 먼저 변수로 빼두는 게 이해하기 쉽다.
        User leavingUser = myMember.getUser();
        JarRole leavingRole = myMember.getRole();

        // 4. 나가기 처리
        myMember.leave();

        // 5. 저금통 상세 화면을 보고 있는 사람들에게 "누가 나갔어!" 실시간 이벤트 보내기
        jarMemberRealtimeService.sendMemberEventAfterCommit(
                jarId,
                JarMemberSocketEventResponse.memberLeft(
                        jarId,
                        leavingUser.getId(),
                        leavingUser.getName(),
                        leavingRole
                )
        );

        // 6. 채팅방에도 "누가 나갔어요" 시스템 메시지를 남긴다.
        chatSystemMessageService.createAndSendMemberLeftMessage(
                myMember.getJar(),
                leavingUser.getName()
        );

        // 7. 응답 반환
        return new JarLeaveResponse(
                jarId,
                toKstOffsetDateTime(myMember.getLeftAt())
        );
    }

    // 저금통의 초대코드 목록을 조회하는 기능
    // OWNER / ADMIN 만 볼 수 있음
    public JarInviteListResponse listInvites(Long currentUserId, Long jarId) {

        // 1. 현재 사용자가 이 저금통의 관리자 이상인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);
        if (!myMember.isAdminOrOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "초대코드 목록은 OWNER 또는 ADMIN만 볼 수 있어."
            );
        }

        // 2. 초대코드 목록 조회
        List<JarInvite> invites = jarInviteRepository.findAllByJarIdOrderByCreatedAtDesc(jarId);

        // 3. DTO로 변환
        List<JarInviteItem> items = invites.stream()
                .map(invite -> new JarInviteItem(
                        invite.getInviteId(),
                        invite.getCode(),
                        toKstOffsetDateTime(invite.getExpiresAt()),
                        invite.getRevokedAt() == null ? null : toKstOffsetDateTime(invite.getRevokedAt()),
                        invite.getMaxUses(),
                        invite.getUsedCount(),
                        invite.isAvailable(LocalDateTime.now()),
                        invite.getCreatedBy().getId(),
                        toKstOffsetDateTime(invite.getCreatedAt())
                ))
                .toList();

        return new JarInviteListResponse(items);
    }

    // 초대코드를 폐기하는 기능
    // OWNER / ADMIN 만 가능
    @Transactional
    public JarInviteRevokeResponse revokeInvite(Long currentUserId, Long jarId, Long inviteId) {

        // 1. 현재 사용자가 관리자 이상인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);
        if (!myMember.isAdminOrOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "초대코드 폐기는 OWNER 또는 ADMIN만 할 수 있어."
            );
        }

        // 2. 초대코드 찾기
        JarInvite invite = jarInviteRepository.findByInviteIdAndJar_JarId(inviteId, jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "초대코드를 찾을 수 없어."
                ));

        // 3. 이미 폐기된 초대코드면 예외
        if (invite.isRevoked()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "이미 폐기된 초대코드야."
            );
        }

        // 4. 폐기 처리
        invite.revoke();

        // 5. 응답 반환
        return new JarInviteRevokeResponse(
                invite.getInviteId(),
                toKstOffsetDateTime(invite.getRevokedAt())
        );
    }

    // 저금통 멤버 역할을 바꾸는 기능
    // OWNER만 가능, 대상은 현재 active 멤버여야 함
    // OWNER로 바꾸는 건 지금 단계에서는 막음(owner_id 와 OWNER 멤버 정합성 문제가 생길 수 있음)
    @Transactional
    public JarMemberRoleUpdateResponse updateMemberRole(
            Long currentUserId,
            Long jarId,
            Long targetUserId,
            JarMemberRoleUpdateRequest request
    ) {
        // 1. 요청한 사람이 OWNER인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);
        if (!myMember.isOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "멤버 역할 변경은 OWNER만 할 수 있어."
            );
        }

        // 2. 대상 멤버 찾기
        JarMember targetMember = getActiveMemberOrThrow(jarId, targetUserId);

        // 3. OWNER 관련 역할 변경은 막기
        if (targetMember.isOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "OWNER의 역할은 변경할 수 없어."
            );
        }

        if (request.role() == JarRole.OWNER) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "지금은 OWNER 역할 변경을 지원하지 않아."
            );
        }

        // 4. WebSocket 이벤트에 사용할 사람 정보 꺼내기
        User actorUser = myMember.getUser();
        User targetUser = targetMember.getUser();

        // 5. 역할 변경
        targetMember.changeRole(request.role());

        // 6. 저금통 상세 화면을 보고 있는 사람들에게 "역할이 바뀌었어!" 실시간 이벤트 보내기
        jarMemberRealtimeService.sendMemberEventAfterCommit(
                jarId,
                JarMemberSocketEventResponse.memberRoleChanged(
                        jarId,
                        actorUser.getId(),
                        actorUser.getName(),
                        targetUser.getId(),
                        targetUser.getName(),
                        targetMember.getRole()
                )
        );

        // 7. 채팅방에도 "역할이 바뀌었어요" 시스템 메시지를 남긴다.
        chatSystemMessageService.createAndSendMemberRoleChangedMessage(
                targetMember.getJar(),
                targetUser.getName(),
                targetMember.getRole()
        );

        // 8. 응답 반환
        return new JarMemberRoleUpdateResponse(
                jarId,
                targetUserId,
                targetMember.getRole(),
                toKstOffsetDateTime(targetMember.getUpdatedAt())
        );
    }

    // 저금통 멤버를 강퇴하는 기능
    // ADMIN 이상 가능, 대상은 현재 active 멤버여야 함
    // OWNER는 강퇴할 수 없음, 자기 자신은 강퇴할 수 없음
    @Transactional
    public JarKickResponse kickMember(Long currentUserId, Long jarId, Long targetUserId) {
        // 1. 요청한 사람이 ADMIN 이상인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);
        if (!myMember.isAdminOrOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "멤버 강퇴는 ADMIN 이상만 할 수 있어."
            );
        }

        // 2. 자기 자신 강퇴 방지
        if (currentUserId.equals(targetUserId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "자기 자신은 강퇴할 수 없어."
            );
        }

        // 3. 대상 멤버 찾기
        JarMember targetMember = getActiveMemberOrThrow(jarId, targetUserId);

        // 4. OWNER는 강퇴 불가
        if (targetMember.isOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "OWNER는 강퇴할 수 없어."
            );
        }

        // 5. WebSocket 이벤트에 사용할 정보 먼저 꺼내기
        User actorUser = myMember.getUser();
        User targetUser = targetMember.getUser();
        JarRole targetRole = targetMember.getRole();

        // 6. 강퇴 처리
        targetMember.leave();

        // 7. 저금통 상세 화면을 보고 있는 사람들에게 "누가 강퇴됐어!" 실시간 이벤트 보내기
        jarMemberRealtimeService.sendMemberEventAfterCommit(
                jarId,
                JarMemberSocketEventResponse.memberKicked(
                        jarId,
                        actorUser.getId(),
                        actorUser.getName(),
                        targetUser.getId(),
                        targetUser.getName(),
                        targetRole
                )
        );

        // 8. 채팅방에도 "누가 내보내졌어요" 시스템 메시지를 남긴다.
        chatSystemMessageService.createAndSendMemberKickedMessage(
                targetMember.getJar(),
                targetUser.getName()
        );

        // 9. 응답 반환
        return new JarKickResponse(
                jarId,
                targetUserId,
                toKstOffsetDateTime(targetMember.getLeftAt())
        );
    }

    // 저금통 기본 설정을 수정하는 기능
    // OWNER / ADMIN 만 수정 가능, PATCH 방식이라서 들어온 값만 바꾸고 나머지는 그대로 둠
    // maxMembers는 현재 active 멤버 수보다 작게 줄일 수 없음
    @Transactional
    public JarUpdateResponse updateJar(Long currentUserId, Long jarId, JarUpdateRequest request) {

        // 1. 현재 사용자가 이 저금통에서 OWNER / ADMIN 인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);
        if (!myMember.isAdminOrOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "저금통 수정은 OWNER 또는 ADMIN만 할 수 있어."
            );
        }

        // 2. 저금통 찾기
        Jar jar = jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 2-1. 오픈 정책(openAt/openMode/lockLevel)을 바꾸려는 요청인지 먼저 확인
        boolean wantsToChangeOpenPolicy =
                request.openAt() != null ||
                        request.openMode() != null ||
                        request.lockLevel() != null;

        // 2-2. 오픈 정책을 바꾸려는 경우에만 "이미 열렸는지" 확인
        if (wantsToChangeOpenPolicy) {
            boolean alreadyOpened = jarOpenService.ensureOpenedIfDue(jarId);

            if (alreadyOpened) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "이미 열린 저금통은 오픈 정책을 다시 바꿀 수 없어."
                );
            }
        }

        // 3. 현재 값 가져오기
        String newName = jar.getName();
        String newDescription = jar.getDescription();
        JarTheme newTheme = jar.getTheme();
        int newMaxMembers = jar.getMaxMembers();
        LocalDateTime newOpenAt = jar.getOpenAt();
        JarOpenMode newOpenMode = jar.getOpenMode();
        JarLockLevel newLockLevel = jar.getLockLevel();

        // 4. 요청으로 들어온 값만 덮어쓰기
        if (request.name() != null) {
            // 공백만 들어온 이름은 막아두는 게 안전해
            if (!StringUtils.hasText(request.name())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "저금통 이름은 공백만 입력할 수 없어."
                );
            }
            newName = request.name();
        }

        if (request.description() != null) {
            newDescription = request.description();
        }

        if (request.theme() != null) {
            newTheme = request.theme();
        }

        if (request.maxMembers() != null) {
            long activeMemberCount = jarMemberRepository.countByJar_JarIdAndDeletedAtIsNull(jarId);

            // 현재 들어와 있는 사람 수보다 더 작게 줄이면 안 돼
            if (request.maxMembers() < activeMemberCount) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "현재 참여 중인 멤버 수보다 maxMembers를 작게 설정할 수 없어."
                );
            }

            newMaxMembers = request.maxMembers();
        }

        if (request.openAt() != null) {
            newOpenAt = request.openAt();
        }

        if (request.openMode() != null) {
            newOpenMode = request.openMode();
        }

        if (request.lockLevel() != null) {
            newLockLevel = request.lockLevel();
        }

        // 5. 엔티티 수정
        jar.updateInfo(
                newName,
                newDescription,
                newTheme,
                newMaxMembers,
                newOpenAt,
                newOpenMode,
                newLockLevel
        );

        // 6. updatedAt 값을 응답에 안정적으로 쓰기 위해 save
        Jar savedJar = jarRepository.save(jar);

        // 7. 응답 반환
        return new JarUpdateResponse(
                savedJar.getJarId(),
                toKstOffsetDateTime(savedJar.getUpdatedAt())
        );
    }

    // 저금통을 삭제(종료)하는 기능이야.
    // OWNER만 가능, 저금통은 soft delete 처리, 현재 active 멤버들도 같이 leave 처리해서 membership 상태를 정리해줘
    @Transactional
    public void deleteJar(Long currentUserId, Long jarId) {

        // 1. 현재 사용자가 이 저금통의 active 멤버인지 확인
        JarMember myMember = getActiveMemberOrThrow(jarId, currentUserId);

        // 2. OWNER만 삭제 가능
        if (!myMember.isOwner()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "저금통 삭제는 OWNER만 할 수 있어."
            );
        }

        // 3. 저금통 찾기
        Jar jar = jarRepository.findByJarId(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 4. 저금통을 삭제할 때, 그 저금통에 속한 멤버들도 더 이상 참여 중이 아니라고 표시
        List<JarMember> activeMembers = jarMemberRepository.findActiveMembersWithUserByJarId(jarId);
        for (JarMember member : activeMembers) {
            member.leave();
        }

        // 5. 저금통 soft delete
        jarRepository.delete(jar);
    }

    // userId로 사용자 찾기
    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "사용자를 찾을 수 없어."
                ));
    }

    // 현재 저금통의 active 멤버인지 검사
    private JarMember getActiveMemberOrThrow(Long jarId, Long userId) {
        return jarMemberRepository.findByJar_JarIdAndUser_IdAndDeletedAtIsNull(jarId, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.FORBIDDEN,
                        "현재 저금통 멤버가 아니야."
                ));
    }

    // 중복되지 않는 초대코드를 만들기 위한 간단한 메서드
    // 매우 드물게 중복이 날 수 있으니 몇 번 시도하다가 안 되면 예외를 던짐
    private String generateUniqueInviteCode() {
        for (int i = 0; i < 10; i++) {
            String code = UUID.randomUUID()
                    .toString()
                    .replace("-", "")
                    .substring(0, 8)
                    .toUpperCase();

            if (jarInviteRepository.findByCode(code).isEmpty()) {
                return code;
            }
        }

        throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "초대코드 생성에 실패했어. 다시 시도해줘."
        );
    }
    /*
     * DB에 저장된 LocalDateTime은 한국 시간 벽시계값이라고 가정하고
     * 응답용 OffsetDateTime(+09:00)으로 감싸주는 함수
     */
    private OffsetDateTime toKstOffsetDateTime(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            return null;
        }
        return localDateTime.atZone(ZoneId.of("Asia/Seoul")).toOffsetDateTime();
    }
    
    // 이제: 기록형 오픈 기준으로 판단
    private boolean isOpen(Jar jar) {
        return jarOpenService.ensureOpenedIfDue(jar.getJarId());
    }
}