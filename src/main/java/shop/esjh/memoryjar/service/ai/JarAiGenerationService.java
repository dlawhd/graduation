package shop.esjh.memoryjar.service.ai;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.entity.ai.JarAiGeneration;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiProvider;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;

/**
 * AI 요청을 시작하기 전에 후보 생성 기록을 안전하게 만든다.
 * 외부 제공자 호출은 아직 이 단계의 범위가 아니며, DB 트랜잭션을 길게 잡지 않기 위해 여기서 수행하지 않는다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class JarAiGenerationService {

    private final JarDesignDraftService draftService;
    private final JarAiGenerationRepository generationRepository;

    /**
     * Draft 잠금 안에서 PROCESSING 후보 존재를 검사한 뒤 새 요청 기록을 저장한다.
     * 같은 Draft를 잠그므로 동시에 두 요청이 모두 "진행 중 없음"을 보는 경쟁 상태를 막는다.
     */
    @Transactional
    public JarAiGeneration startGeneration(Long userId, Long draftId, JarAiStyle style,
                                            JarAiProvider provider, String model, String promptVersion,
                                            Long seed, String referenceImageVersion, String postprocessVersion) {
        JarDesignDraft draft = draftService.findOwnedActiveDraftForUpdate(userId, draftId);

        if (generationRepository.existsByDraft_DraftIdAndStatus(
                draft.getDraftId(), JarAiGenerationStatus.PROCESSING)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이 디자인 초안에는 이미 진행 중인 AI 생성이 있습니다.");
        }

        JarAiGeneration generation = JarAiGeneration.builder()
                .draft(draft)
                .aiStyle(style)
                .aiProvider(provider)
                .aiModel(model)
                .promptVersion(promptVersion)
                .seed(seed)
                .referenceImageVersion(referenceImageVersion)
                .postprocessVersion(postprocessVersion)
                .build();

        return generationRepository.save(generation);
    }
}
