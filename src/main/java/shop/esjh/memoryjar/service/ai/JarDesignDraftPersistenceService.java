package shop.esjh.memoryjar.service.ai;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 이미 S3에 안전하게 저장된 원본 Key를 DB Draft로 짧게 기록한다.
 * S3·Rekognition 네트워크 호출과 분리해 DB 트랜잭션을 오래 유지하지 않는다.
 */
@Service
public class JarDesignDraftPersistenceService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final UserRepository userRepository;
    private final JarDesignDraftRepository draftRepository;
    private final AiDraftProperties properties;

    public JarDesignDraftPersistenceService(UserRepository userRepository,
                                            JarDesignDraftRepository draftRepository,
                                            AiDraftProperties properties) {
        this.userRepository = userRepository;
        this.draftRepository = draftRepository;
        this.properties = properties;
    }

    /**
     * 업로드 요청자가 현재도 존재할 때만 ACTIVE Draft를 생성하고 7일 만료 시각을 기록한다.
     */
    @Transactional
    public JarDesignDraft createDraft(Long userId, String originalS3Key) {
        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));

        LocalDateTime expiresAt = LocalDateTime.now(KST).plusDays(properties.getExpiresAfterDays());
        JarDesignDraft draft = JarDesignDraft.builder()
                .owner(owner)
                .originalS3Key(originalS3Key)
                .expiresAt(expiresAt)
                .build();

        return draftRepository.save(draft);
    }
}
