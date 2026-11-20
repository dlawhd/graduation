package shop.esjh.memoryjar.security;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.http.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.controller.support.SupportAdminController;
import shop.esjh.memoryjar.config.exception.GlobalExceptionHandler;
import shop.esjh.memoryjar.service.support.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 추가 인증 제거 뒤에도 모든 운영 요청이 로그인·운영자 검사를 먼저 거치는지 확인한다. */
class SupportOperatorAccessHttpTest {
    SupportAuthorization authorization;
    SupportInquiryService service;
    SupportInquiryPersistenceService persistence;
    SupportConversationService conversations;
    SupportAttachmentService attachments;
    SupportAttachmentPersistenceService attachmentPersistence;
    MockMvc mvc;
    @BeforeEach void setup() {
        authorization = mock(SupportAuthorization.class); service = mock(SupportInquiryService.class);
        persistence = mock(SupportInquiryPersistenceService.class); conversations = mock(SupportConversationService.class);
        attachments = mock(SupportAttachmentService.class); attachmentPersistence = mock(SupportAttachmentPersistenceService.class);
        mvc = MockMvcBuilders.standaloneSetup(new SupportAdminController(service, persistence, conversations, attachments, attachmentPersistence, authorization))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }
    private UsernamePasswordAuthenticationToken auth() {
        return new UsernamePasswordAuthenticationToken(Map.of("userId", "1"), null, List.of());
    }
    private void deniedEverywhere(boolean authenticated) throws Exception {
        var requests = List.of(Map.entry("GET", ""), Map.entry("GET", "/1"), Map.entry("GET", "/1/view"),
                Map.entry("GET", "/1/image"), Map.entry("GET", "/1/messages"), Map.entry("GET", "/1/attachments"),
                Map.entry("GET", "/1/attachments/2/image"), Map.entry("POST", "/1/review"), Map.entry("POST", "/1/reply"),
                Map.entry("POST", "/1/messages"), Map.entry("POST", "/1/resolve"), Map.entry("POST", "/1/reopen"));
        for (var item : requests) {
            var request = request(HttpMethod.valueOf(item.getKey()), "/api/v1/admin/support/inquiries" + item.getValue());
            if (authenticated) request.principal(auth());
            mvc.perform(request).andExpect(status().is(authenticated ? 403 : 401))
                    .andExpect(header().string("Cache-Control", "no-store"));
        }
        var upload = multipart("/api/v1/admin/support/inquiries/1/attachments").file("image", new byte[]{1})
                .param("requestId", UUID.randomUUID().toString()).param("shareScreenshot", "true");
        if (authenticated) upload.principal(auth());
        mvc.perform(upload).andExpect(status().is(authenticated ? 403 : 401));
        verifyNoInteractions(service, persistence, conversations, attachments, attachmentPersistence);
    }
    @Test void anonymousCannotReadOrMutateInquiriesAndPhotos() throws Exception { deniedEverywhere(false); }
    @Test void ordinaryMemberCannotReadOrMutateInquiriesAndPhotos() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "운영자만 이용할 수 있습니다.")).when(authorization).requireOperator(1L);
        deniedEverywhere(true);
    }
    @Test void operatorCanEnterWithoutMfaConfiguration() throws Exception {
        mvc.perform(get("/api/v1/admin/support/inquiries").principal(auth())).andExpect(status().isOk());
        verify(authorization).requireOperator(1L);
        verify(persistence).list(1L, null, null, true);
    }
}
