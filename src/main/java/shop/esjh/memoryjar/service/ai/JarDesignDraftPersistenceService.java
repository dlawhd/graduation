package shop.esjh.memoryjar.service.ai;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;

import java.time.LocalDateTime;
import java.time.ZoneId;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;
import shop.esjh.memoryjar.entity.ai.JarPhotoFrame;

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
    public JarDesignDraft createDraft(Long userId, String originalS3Key, JarBodyStyle bodyStyle) {
        return createDraft(userId, originalS3Key, bodyStyle, null);
    }

    /** 정규화 여백 정보는 추가 이미지 디코딩이나 네트워크 호출 없이 같은 INSERT에 기록한다. */
    @Transactional
    public JarDesignDraft createDraft(Long userId, String originalS3Key, JarBodyStyle bodyStyle, JarPhotoFrameValue contentFrame) {
        return createDraft(userId, originalS3Key, bodyStyle, contentFrame, null);
    }

    /** 사용자 틀도 원본 메타데이터와 같은 INSERT에 저장한다. */
    @Transactional
    public JarDesignDraft createDraft(Long userId, String originalS3Key, JarBodyStyle bodyStyle, JarPhotoFrameValue contentFrame,
                                     shop.esjh.memoryjar.dto.ai.CustomJarBodyValue customBody) {
        shop.esjh.memoryjar.dto.ai.CustomJarBodyValue.validateFor(bodyStyle, customBody);
        User owner = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."));

        LocalDateTime expiresAt = LocalDateTime.now(KST).plusDays(properties.getExpiresAfterDays());
        JarDesignDraft draft = JarDesignDraft.builder()
                .owner(owner)
                .originalS3Key(originalS3Key)
                .bodyStyle(bodyStyle)
                .expiresAt(expiresAt)
                .build();

        if (contentFrame != null) draft.setOriginalContentFrame(new JarPhotoFrame(contentFrame));
        draft.setCustomBody(customBody);
        return draftRepository.save(draft);
    }
}
