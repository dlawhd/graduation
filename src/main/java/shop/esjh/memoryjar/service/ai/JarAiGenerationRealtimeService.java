package shop.esjh.memoryjar.service.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import shop.esjh.memoryjar.dto.ai.response.JarAiGenerationRealtimeEventResponse;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationErrorCode;
import shop.esjh.memoryjar.enums.ai.JarAiGenerationStatus;
import shop.esjh.memoryjar.enums.ai.JarAiStyle;

/**
 * 백그라운드 AI 생성이 끝나면 해당 Draft를 보고 있는 OWNER에게 상태 변경 신호를 보낸다.
 * WebSocket 전송 실패는 이미 DB에 저장된 생성 결과를 실패로 되돌리지 않는다.
 */
@Service
public class JarAiGenerationRealtimeService {

    private static final Logger log = LoggerFactory.getLogger(JarAiGenerationRealtimeService.class);

    private final SimpMessagingTemplate messagingTemplate;

    public JarAiGenerationRealtimeService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    /** 성공 또는 실패로 DB 반영이 끝난 뒤 Draft 전용 topic에 가벼운 갱신 신호를 보낸다. */
    public void sendCompleted(Long draftId, Long generationId, JarAiStyle style,
                              JarAiGenerationStatus status, JarAiGenerationErrorCode errorCode) {
        if (draftId == null || generationId == null || style == null || status == null) {
            return;
        }

        try {
            messagingTemplate.convertAndSend(
                    "/topic/design-drafts/" + draftId + "/generations",
                    new JarAiGenerationRealtimeEventResponse(draftId, generationId, style, status, errorCode)
            );
        } catch (RuntimeException exception) {
            // 생성 결과는 DB에 이미 확정됐으므로 실시간 알림 실패는 별도 복구 대상이며 상태를 되돌리지 않는다.
            log.warn("AI 생성 WebSocket 알림에 실패했습니다. draftId={} generationId={} status={}",
                    draftId, generationId, status);
        }
    }
}
