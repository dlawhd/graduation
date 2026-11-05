package shop.esjh.memoryjar.controller.note;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import shop.esjh.memoryjar.auth.OAuth2SuccessHandler;
import shop.esjh.memoryjar.jwt.JwtAuthenticationFilter;
import shop.esjh.memoryjar.jwt.JwtTokenProvider;
import shop.esjh.memoryjar.dto.note.response.PlaceSearchItem;
import shop.esjh.memoryjar.service.note.NaverPlaceSearchService;
import java.util.List;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 검색어 검증·인증 주체·기존 성공 응답 형식을 검사한다. 외부 API는 호출하지 않는다. */
@WebMvcTest(PlaceSearchController.class)
@AutoConfigureMockMvc(addFilters = false)
class PlaceSearchControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean NaverPlaceSearchService service;
    @MockitoBean JwtAuthenticationFilter jwtAuthenticationFilter;
    @MockitoBean JwtTokenProvider jwtTokenProvider;
    @MockitoBean OAuth2SuccessHandler oauth2SuccessHandler;

    private static UsernamePasswordAuthenticationToken user() {
        return new UsernamePasswordAuthenticationToken(Map.of("userId", 7L), null, List.of());
    }
    @Test void authenticatedSearchUsesPrincipalAndNoStore() throws Exception {
        when(service.search(7, "서울숲")).thenReturn(List.of(new PlaceSearchItem("서울숲", "서울", 37.5, 127)));
        mvc.perform(get("/api/v1/places/search").param("q", "서울숲").param("userId", "999")
                .principal(user()))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.data[0].name").value("서울숲"));
        verify(service).search(7, "서울숲");
    }
    @Test void unauthenticatedRequestNeverCallsService() throws Exception {
        mvc.perform(get("/api/v1/places/search").param("q", "서울숲")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void hubAuthenticationFailureDoesNotBecomeOurLoginFailure() throws Exception {
        when(service.search(7, "서울숲")).thenThrow(new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE, "장소 검색을 사용할 수 없어요."));
        mvc.perform(get("/api/v1/places/search").param("q", "서울숲").principal(user()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error.code").value("SERVICE_UNAVAILABLE"));
    }
    @ParameterizedTest @ValueSource(strings = {"", " ", "서울\n숲"})
    void invalidQueryIsRejected(String q) throws Exception {
        mvc.perform(get("/api/v1/places/search").param("q", q).principal(user()))
                .andExpect(status().isBadRequest()); verifyNoInteractions(service);
    }
    @Test void missingAndOversizedQueriesAreRejected() throws Exception {
        mvc.perform(get("/api/v1/places/search").principal(user())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/places/search").param("q", "x".repeat(101)).principal(user()))
                .andExpect(status().isBadRequest()); verifyNoInteractions(service);
    }
}
