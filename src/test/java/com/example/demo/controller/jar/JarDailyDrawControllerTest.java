package com.example.demo.controller.jar;

import com.example.demo.dto.dailydraw.response.DailyDrawHistoryItem;
import com.example.demo.dto.dailydraw.response.DailyDrawHistoryResponse;
import com.example.demo.dto.dailydraw.response.DailyDrawNoteResponse;
import com.example.demo.dto.dailydraw.response.DailyDrawResponse;
import com.example.demo.dto.dailydraw.response.DailyDrawTodayResponse;
import com.example.demo.jwt.JwtAuthenticationFilter;
import com.example.demo.jwt.JwtTokenProvider;
import com.example.demo.service.jar.JarDailyDrawService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.security.oauth2.client.OAuth2ClientAutoConfiguration;
import org.springframework.boot.autoconfigure.security.oauth2.client.servlet.OAuth2ClientWebSecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityFilterAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/*
 * JarDailyDrawControllerTest
 *
 * 이 테스트 클래스는 JarDailyDrawController가
 * Daily Draw API 요청을 올바르게 받고 응답하는지 확인하는 역할을 한다.
 *
 * 쉽게 말하면:
 * - POST /daily-draw 요청이 들어오면 오늘 카드 뽑기 서비스가 호출되는지
 * - 새로 뽑힌 카드면 201 Created가 나오는지
 * - 이미 있던 오늘 카드면 200 OK가 나오는지
 * - GET /today, GET /history 응답이 { data: ... } 형태로 내려오는지
 * - page, size 값이 이상하면 400으로 막는지
 * - 로그인 정보가 없으면 401로 막는지
 * 확인한다.
 */
@WebMvcTest(
        controllers = JarDailyDrawController.class,
        excludeAutoConfiguration = {
                SecurityAutoConfiguration.class,
                SecurityFilterAutoConfiguration.class,
                OAuth2ClientAutoConfiguration.class,
                OAuth2ClientWebSecurityAutoConfiguration.class
        }
)
@AutoConfigureMockMvc(addFilters = false)
class JarDailyDrawControllerTest {

    // MockMvc는 실제 서버를 켜지 않고 HTTP 요청처럼 Controller를 테스트하게 해준다.
    @Autowired
    private MockMvc mockMvc;

    // Controller가 의존하는 Service는 진짜 객체 대신 Mock으로 대체한다.
    @MockitoBean
    private JarDailyDrawService jarDailyDrawService;

    // WebMvcTest에서 JwtAuthenticationFilter Bean을 만들 때 필요한 의존성을 Mock으로 대체한다.
    // 실제 JWT 검증은 이 컨트롤러 테스트의 관심사가 아니므로 Mock만 등록해준다.
    @MockitoBean
    private JwtTokenProvider jwtTokenProvider;

    @MockitoBean
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Test
    @DisplayName("POST /daily-draw - 새로 뽑힌 카드면 201 Created와 Daily Draw 응답을 반환한다")
    void drawToday_newlyDrawn_returns201() throws Exception {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        DailyDrawResponse response = createDailyDrawResponse(true);

        when(jarDailyDrawService.drawToday(currentUserId, jarId))
                .thenReturn(response);

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/daily-draw", jarId)
                        .with(loginUser(currentUserId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.drawId").value(1L))
                .andExpect(jsonPath("$.data.jarId").value(jarId))
                .andExpect(jsonPath("$.data.newlyDrawn").value(true))
                .andExpect(jsonPath("$.data.note.noteId").value(100L))
                .andExpect(jsonPath("$.data.note.title").value("오늘의 추억"))
                .andExpect(jsonPath("$.data.note.authorName").value("은서"));

        // Controller가 Authentication에서 userId를 꺼내 Service에 넘겼는지 확인한다.
        verify(jarDailyDrawService).drawToday(currentUserId, jarId);
    }

    @Test
    @DisplayName("POST /daily-draw - 오늘 카드가 이미 있으면 200 OK와 기존 카드를 반환한다")
    void drawToday_existingTodayDraw_returns200() throws Exception {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        DailyDrawResponse response = createDailyDrawResponse(false);

        when(jarDailyDrawService.drawToday(currentUserId, jarId))
                .thenReturn(response);

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/daily-draw", jarId)
                        .with(loginUser(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.drawId").value(1L))
                .andExpect(jsonPath("$.data.jarId").value(jarId))
                .andExpect(jsonPath("$.data.newlyDrawn").value(false))
                .andExpect(jsonPath("$.data.note.noteId").value(100L));

        verify(jarDailyDrawService).drawToday(currentUserId, jarId);
    }

    @Test
    @DisplayName("GET /daily-draw/today - 오늘 카드가 있으면 hasTodayDraw=true를 반환한다")
    void getTodayDraw_found_returnsTodayDraw() throws Exception {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        DailyDrawResponse dailyDraw = createDailyDrawResponse(false);
        DailyDrawTodayResponse response = DailyDrawTodayResponse.found(dailyDraw);

        when(jarDailyDrawService.getTodayDraw(currentUserId, jarId))
                .thenReturn(response);

        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/daily-draw/today", jarId)
                        .with(loginUser(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.hasTodayDraw").value(true))
                .andExpect(jsonPath("$.data.dailyDraw.drawId").value(1L))
                .andExpect(jsonPath("$.data.dailyDraw.note.noteId").value(100L))
                .andExpect(jsonPath("$.data.message").value("오늘의 추억 한 장이 공개되었어요."));

        verify(jarDailyDrawService).getTodayDraw(currentUserId, jarId);
    }

    @Test
    @DisplayName("GET /daily-draw/today - 오늘 카드가 없으면 hasTodayDraw=false를 반환한다")
    void getTodayDraw_empty_returnsFalse() throws Exception {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        DailyDrawTodayResponse response = DailyDrawTodayResponse.empty();

        when(jarDailyDrawService.getTodayDraw(currentUserId, jarId))
                .thenReturn(response);

        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/daily-draw/today", jarId)
                        .with(loginUser(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.hasTodayDraw").value(false))
                .andExpect(jsonPath("$.data.dailyDraw").doesNotExist())
                .andExpect(jsonPath("$.data.message").value("아직 오늘의 추억 한 장이 뽑히지 않았어요."));

        verify(jarDailyDrawService).getTodayDraw(currentUserId, jarId);
    }

    @Test
    @DisplayName("GET /daily-draw/history - Daily Draw 히스토리 목록을 반환한다")
    void getHistory_success() throws Exception {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        DailyDrawHistoryResponse response = new DailyDrawHistoryResponse(
                List.of(
                        new DailyDrawHistoryItem(
                                1L,
                                jarId,
                                LocalDate.of(2026, 5, 4),
                                100L,
                                "오늘의 추억",
                                2L,
                                "은서",
                                LocalDate.of(2026, 5, 1),
                                "서울"
                        )
                ),
                0,
                20,
                1L,
                1
        );

        when(jarDailyDrawService.getHistory(currentUserId, jarId, 0, 20))
                .thenReturn(response);

        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/daily-draw/history", jarId)
                        .param("page", "0")
                        .param("size", "20")
                        .with(loginUser(currentUserId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].drawId").value(1L))
                .andExpect(jsonPath("$.data.items[0].noteId").value(100L))
                .andExpect(jsonPath("$.data.items[0].title").value("오늘의 추억"))
                .andExpect(jsonPath("$.data.items[0].authorName").value("은서"))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(20))
                .andExpect(jsonPath("$.data.totalElements").value(1L))
                .andExpect(jsonPath("$.data.totalPages").value(1));

        verify(jarDailyDrawService).getHistory(currentUserId, jarId, 0, 20);
    }

    @Test
    @DisplayName("GET /daily-draw/history - page가 0보다 작으면 400을 반환한다")
    void getHistory_negativePage_returns400() throws Exception {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/daily-draw/history", jarId)
                        .param("page", "-1")
                        .param("size", "20")
                        .with(loginUser(currentUserId)))
                .andExpect(status().isBadRequest());

        // page 검증에서 막혀야 하므로 Service는 호출되면 안 된다.
        verify(jarDailyDrawService, never()).getHistory(anyLong(), anyLong(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("GET /daily-draw/history - size가 100보다 크면 400을 반환한다")
    void getHistory_tooLargeSize_returns400() throws Exception {
        // given
        Long currentUserId = 1L;
        Long jarId = 10L;

        // when & then
        mockMvc.perform(get("/api/v1/jars/{jarId}/daily-draw/history", jarId)
                        .param("page", "0")
                        .param("size", "101")
                        .with(loginUser(currentUserId)))
                .andExpect(status().isBadRequest());

        // size 검증에서 막혀야 하므로 Service는 호출되면 안 된다.
        verify(jarDailyDrawService, never()).getHistory(anyLong(), anyLong(), anyInt(), anyInt());
    }

    @Test
    @DisplayName("POST /daily-draw - 로그인 정보가 없으면 401을 반환한다")
    void drawToday_noAuthentication_returns401() throws Exception {
        // given
        Long jarId = 10L;

        // when & then
        mockMvc.perform(post("/api/v1/jars/{jarId}/daily-draw", jarId))
                .andExpect(status().isUnauthorized());

        // 인증 정보가 없으면 Service는 호출되면 안 된다.
        verify(jarDailyDrawService, never()).drawToday(anyLong(), anyLong());
    }

    /*
     * 테스트용 로그인 사용자 주입 메서드
     *
     * 현재 JarDailyDrawController는 Authentication의 principal에서
     * Map 형태로 userId를 꺼낸다.
     *
     * 그래서 테스트에서도 principal을 Map.of("userId", userId) 형태로 넣어준다.
     */
    private RequestPostProcessor loginUser(Long userId) {
        return request -> {
            request.setUserPrincipal(authentication(userId));
            return request;
        };
    }

    /*
     * 테스트용 Authentication 생성 메서드
     *
     * 실제 JWT 필터를 태우지 않고,
     * Controller가 읽을 수 있는 로그인 사용자 정보만 가짜로 만들어준다.
     */
    private Authentication authentication(Long userId) {
        return new UsernamePasswordAuthenticationToken(
                Map.of("userId", userId),
                null,
                Collections.emptyList()
        );
    }

    /*
     * 테스트용 Daily Draw 응답 생성 메서드
     *
     * Controller 테스트에서는 Service 로직을 검증하지 않는다.
     * 대신 Service가 이런 응답을 줬을 때 Controller가 HTTP 상태코드와 JSON을 잘 내려주는지만 본다.
     */
    private DailyDrawResponse createDailyDrawResponse(boolean newlyDrawn) {
        return new DailyDrawResponse(
                1L,
                10L,
                LocalDate.of(2026, 5, 4),
                newlyDrawn,
                createDailyDrawNoteResponse()
        );
    }

    /*
     * 테스트용 Daily Draw 쪽지 응답 생성 메서드
     */
    private DailyDrawNoteResponse createDailyDrawNoteResponse() {
        return new DailyDrawNoteResponse(
                100L,
                10L,
                2L,
                "은서",
                "오늘의 추억",
                "오늘 뽑힌 추억 쪽지 내용",
                false,
                LocalDate.of(2026, 5, 1),
                "서울",
                List.of("추억", "사진"),
                List.of(),
                OffsetDateTime.of(2026, 5, 1, 10, 0, 0, 0, ZoneOffset.ofHours(9)),
                OffsetDateTime.of(2026, 5, 1, 10, 0, 0, 0, ZoneOffset.ofHours(9))
        );
    }
}