package shop.esjh.memoryjar.controller.onboarding;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import shop.esjh.memoryjar.auth.OAuth2SuccessHandler;
import shop.esjh.memoryjar.dto.onboarding.response.OnboardingProgressItemResponse;
import shop.esjh.memoryjar.dto.onboarding.response.OnboardingProgressResponse;
import shop.esjh.memoryjar.enums.onboarding.OnboardingStatus;
import shop.esjh.memoryjar.enums.onboarding.OnboardingTutorialKey;
import shop.esjh.memoryjar.jwt.JwtAuthenticationFilter;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.service.onboarding.OnboardingService;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(OnboardingController.class)
@AutoConfigureMockMvc(addFilters = false)
@ActiveProfiles("test")
class OnboardingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OnboardingService onboardingService;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @MockitoBean
    private OAuth2SuccessHandler oAuth2SuccessHandler;

    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @Test
    @DisplayName("내 온보딩 상태 조회 성공")
    void getMyProgress_success() throws Exception {
        // given
        OnboardingProgressResponse response =
                new OnboardingProgressResponse(
                        1,
                        List.of(
                                new OnboardingProgressItemResponse(
                                        OnboardingTutorialKey.WELCOME,
                                        true,
                                        OnboardingStatus.COMPLETED,
                                        LocalDateTime.of(
                                                2026,
                                                8,
                                                3,
                                                14,
                                                0
                                        )
                                ),
                                new OnboardingProgressItemResponse(
                                        OnboardingTutorialKey.JAR_LIST,
                                        false,
                                        null,
                                        null
                                )
                        )
                );

        when(onboardingService.getMyProgress(1L))
                .thenReturn(response);

        // when & then
        mockMvc.perform(
                        get("/api/v1/me/onboarding")
                                .principal(authWithUserId(1L))
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(1))
                .andExpect(jsonPath("$.data.items[0].tutorialKey")
                        .value("WELCOME"))
                .andExpect(jsonPath("$.data.items[0].handled")
                        .value(true))
                .andExpect(jsonPath("$.data.items[0].status")
                        .value("COMPLETED"))
                .andExpect(jsonPath("$.data.items[1].tutorialKey")
                        .value("JAR_LIST"))
                .andExpect(jsonPath("$.data.items[1].handled")
                        .value(false));

        verify(onboardingService).getMyProgress(1L);
    }

    @Test
    @DisplayName("온보딩 완료 상태 저장 성공")
    void finish_success() throws Exception {
        // given
        OnboardingProgressItemResponse response =
                new OnboardingProgressItemResponse(
                        OnboardingTutorialKey.WELCOME,
                        true,
                        OnboardingStatus.COMPLETED,
                        LocalDateTime.of(
                                2026,
                                8,
                                3,
                                14,
                                10
                        )
                );

        when(onboardingService.finish(
                1L,
                OnboardingTutorialKey.WELCOME,
                OnboardingStatus.COMPLETED
        )).thenReturn(response);

        // when & then
        mockMvc.perform(
                        put("/api/v1/me/onboarding/WELCOME")
                                .principal(authWithUserId(1L))
                                .contentType(APPLICATION_JSON)
                                .content("""
                                         {
                                           "status": "COMPLETED"
                                         }
                                         """)
                )
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.tutorialKey")
                        .value("WELCOME"))
                .andExpect(jsonPath("$.data.handled")
                        .value(true))
                .andExpect(jsonPath("$.data.status")
                        .value("COMPLETED"));

        verify(onboardingService).finish(
                1L,
                OnboardingTutorialKey.WELCOME,
                OnboardingStatus.COMPLETED
        );
    }

    @Test
    @DisplayName("지원하지 않는 온보딩 종류는 400을 반환한다")
    void finish_badRequestWhenTutorialKeyIsInvalid()
            throws Exception {
        mockMvc.perform(
                        put("/api/v1/me/onboarding/UNKNOWN")
                                .principal(authWithUserId(1L))
                                .contentType(APPLICATION_JSON)
                                .content("""
                                         {
                                           "status": "COMPLETED"
                                         }
                                         """)
                )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code")
                        .value("BAD_REQUEST"))
                .andExpect(jsonPath("$.error.message")
                        .value("지원하지 않는 온보딩 종류예요."));

        verifyNoInteractions(onboardingService);
    }

    @Test
    @DisplayName("지원하지 않는 온보딩 상태는 400을 반환한다")
    void finish_badRequestWhenStatusIsInvalid()
            throws Exception {
        mockMvc.perform(
                        put("/api/v1/me/onboarding/WELCOME")
                                .principal(authWithUserId(1L))
                                .contentType(APPLICATION_JSON)
                                .content("""
                                         {
                                           "status": "UNKNOWN"
                                         }
                                         """)
                )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code")
                        .value("BAD_REQUEST"))
                .andExpect(jsonPath("$.error.message")
                        .value("지원하지 않는 온보딩 상태예요."));

        verifyNoInteractions(onboardingService);
    }

    @Test
    @DisplayName("온보딩 상태가 비어 있으면 400을 반환한다")
    void finish_badRequestWhenStatusIsBlank()
            throws Exception {
        mockMvc.perform(
                        put("/api/v1/me/onboarding/WELCOME")
                                .principal(authWithUserId(1L))
                                .contentType(APPLICATION_JSON)
                                .content("""
                                         {
                                           "status": ""
                                         }
                                         """)
                )
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code")
                        .value("BAD_REQUEST"))
                .andExpect(jsonPath("$.error.message")
                        .value("온보딩 상태는 필수예요."));

        verifyNoInteractions(onboardingService);
    }

    private Authentication authWithUserId(Object userId) {
        return new UsernamePasswordAuthenticationToken(
                Map.of("userId", userId),
                null,
                List.of()
        );
    }
}