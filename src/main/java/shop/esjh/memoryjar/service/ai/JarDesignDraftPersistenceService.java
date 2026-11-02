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

    /** 생성 트랜잭션의 확정·취소를 기다린 뒤, 참조 없는 원본만 정리하도록 판단한다. */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW,
            isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public boolean mayDeleteOriginal(Long userId, String originalS3Key) {
        // 생성과 같은 사용자 행을 잠가, 저장 결과가 아직 확정 중인 상태에서 사진을 지우지 않는다.
        if (userRepository.findByIdForUpdate(userId).isEmpty()) return false;
        return draftRepository.countOriginalReferencesIncludingDeleted(userId, originalS3Key) == 0;
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
        return createDraft(userId,originalS3Key,bodyStyle,contentFrame,customBody,null);
    }

    /** 테두리 Key도 같은 INSERT에서 확정한다. 사진 창 경계는 변경 불가능한 스냅샷에 포함된다. */
    @Transactional
    public JarDesignDraft createDraft(Long userId,String originalS3Key,JarBodyStyle bodyStyle,JarPhotoFrameValue contentFrame,
                                     shop.esjh.memoryjar.dto.ai.CustomJarBodyValue customBody,String bodyArtworkS3Key) {
        shop.esjh.memoryjar.dto.ai.CustomJarBodyValue.validateFor(bodyStyle, customBody);
        // 이 잠금은 DB 기록 구간에서만 유지한다. S3 호출은 이 서비스 밖에서 끝난다.
        User owner = userRepository.findByIdForUpdate(userId)
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
        draft.setBodyArtworkS3Key(bodyArtworkS3Key);
        return draftRepository.save(draft);
    }
}
