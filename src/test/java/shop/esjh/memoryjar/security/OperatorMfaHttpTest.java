package shop.esjh.memoryjar.security;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import shop.esjh.memoryjar.controller.support.*;
import shop.esjh.memoryjar.config.exception.*;
import shop.esjh.memoryjar.service.support.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 모든 운영 REST 진입점이 공통 인증을 거치는지 검증한다. 여기서는 외부 서비스나 실제 서버를 실행하지 않는다. */
class OperatorMfaHttpTest {
    OperatorMfaService mfa;
    MockMvc mvc;
    SupportInquiryService service;
    SupportInquiryPersistenceService persistence;
    SupportConversationService conversations;
    SupportAttachmentService attachments;
    SupportAttachmentPersistenceService attachmentPersistence;

    @BeforeEach void setup() {
        mfa = mock(OperatorMfaService.class); service = mock(SupportInquiryService.class);
        persistence = mock(SupportInquiryPersistenceService.class); conversations = mock(SupportConversationService.class);
        attachments = mock(SupportAttachmentService.class); attachmentPersistence = mock(SupportAttachmentPersistenceService.class);
        mvc = MockMvcBuilders.standaloneSetup(new SupportAdminController(service, persistence, conversations, attachments, attachmentPersistence, mfa),
            new OperatorMfaController(mfa)).setControllerAdvice(new GlobalExceptionHandler(), new OperatorMfaExceptionHandler()).build();
    }

    @Test void everyInquiryReadAndMutationIsBlockedBeforeBusinessWork() throws Exception {
        doThrow(new OperatorMfaRequiredException()).when(mfa).requireVerified(any());
        var requests = List.of(Map.entry("GET", ""), Map.entry("GET", "/1"), Map.entry("GET", "/1/view"),
            Map.entry("GET", "/1/image"), Map.entry("GET", "/1/messages"), Map.entry("GET", "/1/attachments"),
            Map.entry("GET", "/1/attachments/2/image"), Map.entry("POST", "/1/review"), Map.entry("POST", "/1/reply"),
            Map.entry("POST", "/1/messages"), Map.entry("POST", "/1/resolve"), Map.entry("POST", "/1/reopen"));
        // 요청 본문이 없는 변경도 먼저 인증에서 거절되어 원문·첨부 서비스까지 도달하지 않는다.
        for (var request : requests) {
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .request(org.springframework.http.HttpMethod.valueOf(request.getKey()), "/api/v1/admin/support/inquiries" + request.getValue()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("OPERATOR_MFA_REQUIRED"))
                .andExpect(header().string("Cache-Control", "no-store"));
        }
        mvc.perform(multipart("/api/v1/admin/support/inquiries/1/attachments")
            .file("image", new byte[]{1}).param("requestId", UUID.randomUUID().toString()).param("shareScreenshot", "true"))
            .andExpect(status().isForbidden());
        verifyNoInteractions(service, persistence, conversations, attachments, attachmentPersistence);
    }

    @Test void malformedCodesNeverReachVerificationAndSecretsAreNotCached() throws Exception {
        mvc.perform(post("/api/v1/admin/support/mfa/verification").contentType("application/json")
            .content("{\"code\":\"123\",\"recovery\":false}"))
            .andExpect(status().isBadRequest()).andExpect(header().string("Cache-Control", "no-store"));
        verifyNoInteractions(mfa);
    }

    @Test void verifiedRequestsRetainExistingControllerAndApiEnvelope() throws Exception {
        var auth = new UsernamePasswordAuthenticationToken(Map.of("userId", "1"), null, List.of());
        mvc.perform(get("/api/v1/admin/support/inquiries").principal(auth)).andExpect(status().isOk());
        verify(mfa).requireVerified(auth);
        verify(persistence).list(1L, null, null, true);
    }
}
