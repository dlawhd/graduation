package shop.esjh.memoryjar.service.note;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.NaverPlaceProperties;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

/** 실제 네이버 호출 없이 검색 계약·키 비노출·외부 실패·동시 호출 제한을 확인한다. */
class NaverPlaceSearchServiceTest {
    private final HttpClient http = mock(HttpClient.class);
    @SuppressWarnings("unchecked")
    private final HttpResponse<String> response = mock(HttpResponse.class);
    private final NaverPlaceProperties properties = new NaverPlaceProperties();
    private NaverPlaceSearchService service;
    private static final String ITEM = """
            {"title":"<b>서울숲</b> &amp; 공원","roadAddress":"서울 성동구 뚝섬로 273",
             "address":"지번 주소","mapx":"1270374000","mapy":"375445000","link":"https://unused.example"}
            """;

    @BeforeEach void setup() {
        properties.setClientId("test-search-id"); properties.setClientSecret("test-search-secret");
        service = new NaverPlaceSearchService(properties, new PlaceSearchRateLimiter(), new ObjectMapper(), http);
    }

    private void success(String body) throws Exception {
        doReturn(response).when(http).send(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any());
        when(response.statusCode()).thenReturn(200); when(response.body()).thenReturn(body);
    }

    @Test void sendsOnlyToFixedProviderAndReturnsNormalizedSelection() throws Exception {
        success("{\"items\":[" + ITEM + "]}");
        var result = service.search(1, "서울숲 & 공원");
        assertThat(result).hasSize(1);
        assertThat(result.get(0).name()).isEqualTo("서울숲 & 공원");
        assertThat(result.get(0).address()).isEqualTo("서울 성동구 뚝섬로 273");
        assertThat(result.get(0).latitude()).isEqualTo(37.5445);
        assertThat(result.get(0).longitude()).isEqualTo(127.0374);
        var request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any());
        assertThat(request.getValue().method()).isEqualTo("GET");
        assertThat(request.getValue().uri().getScheme()).isEqualTo("https");
        assertThat(request.getValue().uri().getHost()).isEqualTo("naverapihub.apigw.ntruss.com");
        assertThat(request.getValue().uri().getPath()).isEqualTo("/search/v1/local");
        assertThat(request.getValue().uri().getRawQuery()).isEqualTo(
                "display=5&start=1&sort=random&format=json&query=%EC%84%9C%EC%9A%B8%EC%88%B2+%26+%EA%B3%B5%EC%9B%90");
        assertThat(request.getValue().uri().toString()).doesNotContain("test-search-secret");
        assertThat(request.getValue().headers().firstValue("X-NCP-APIGW-API-KEY-ID")).contains("test-search-id");
        assertThat(request.getValue().headers().firstValue("X-NCP-APIGW-API-KEY")).contains("test-search-secret");
        assertThat(request.getValue().headers().firstValue("X-Naver-Client-Id")).isEmpty();
        assertThat(request.getValue().headers().firstValue("X-Naver-Client-Secret")).isEmpty();
        assertThat(request.getValue().timeout().orElseThrow().toSeconds()).isEqualTo(6);
        assertThat(new ObjectMapper().writeValueAsString(result)).doesNotContain("secret", "unused.example", "<b>");
    }

    @Test void blankKeysDoNotCallProvider() {
        properties.setClientSecret("");
        assertStatus(503, () -> service.search(1, "서울숲")); verifyNoInteractions(http);
    }

    @Test void invalidIdentityAndQueryDoNotCallProvider() {
        assertStatus(401, () -> service.search(0, "서울숲"));
        for (String q : new String[]{null, " ", "x".repeat(101), "서울\n숲"})
            assertStatus(400, () -> service.search(1, q));
        verifyNoInteractions(http);
    }

    @ParameterizedTest @ValueSource(ints = {300, 302, 400, 401, 403, 404, 429, 500, 503})
    void providerErrorsDoNotLeakOriginalDetails(int status) throws Exception {
        when(http.send(any(), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any())).thenReturn(response);
        when(response.statusCode()).thenReturn(status);
        assertThatThrownBy(() -> service.search(1, "서울숲"))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> {
                    assertThat(error.getStatusCode().value()).isEqualTo(503);
                    assertThat(error.getReason()).doesNotContain("test-search-secret", "naverapihub.apigw.ntruss.com");
                });
        verify(http, times(1)).send(any(), any());
        verify(response, never()).body();
    }

    @Test void decimalWgs84ResponseKeepsFrontendCoordinates() throws Exception {
        success("{\"items\":[" + ITEM.replace("1270374000", "127.0374").replace("375445000", "37.5445") + "]}");
        var result = service.search(1, "서울숲");
        assertThat(result).hasSize(1);
        assertThat(result.get(0).latitude()).isEqualTo(37.5445);
        assertThat(result.get(0).longitude()).isEqualTo(127.0374);
    }

    @ParameterizedTest @ValueSource(strings = {"NaN", "Infinity", "1e100", "", "0x7f", "200", "1810000000", "1270374000.5"})
    void invalidCoordinatesAreNeverTurnedIntoMapMarkers(String longitude) throws Exception {
        success("{\"items\":[" + ITEM.replace("1270374000", longitude) + "]}");
        assertThat(service.search(1, "서울숲")).isEmpty();
    }

    @ParameterizedTest @ValueSource(strings = {
            "{\"error\":{\"errorCode\":\"200\",\"message\":\"Authentication Failed\",\"details\":\"private\"}}",
            "{\"errorCode\":\"SE02\",\"errorMessage\":\"private\"}"})
    void hubErrorEnvelopesCannotBeMistakenForEmptySuccess(String body) throws Exception {
        success(body); assertStatus(503, () -> service.search(1, "서울숲"));
    }

    @ParameterizedTest @ValueSource(strings = {"not-json", "{}", "null", "{\"items\":{}}"})
    void malformedResponseFailsSafely(String body) throws Exception {
        success(body); assertStatus(503, () -> service.search(1, "서울숲"));
    }

    @Test void oversizedResponseFailsSafely() throws Exception {
        success(" ".repeat(100_001)); assertStatus(503, () -> service.search(1, "서울숲"));
    }

    @Test void emptyAndInvalidResultsNeverCreateWrongMarkers() throws Exception {
        success("{\"items\":[{\"title\":\"없는 좌표\"},"
                + "{\"title\":\"wrong\",\"address\":\"주소\",\"mapx\":\"NaN\",\"mapy\":\"375445000\"}]}");
        assertThat(service.search(1, "서울숲")).isEmpty();
    }

    @Test void limitsResultsAndFallsBackToParcelAddress() throws Exception {
        success("{\"items\":[" + String.join(",", java.util.Collections.nCopies(8,
                ITEM.replace("\"roadAddress\":\"서울 성동구 뚝섬로 273\"", "\"roadAddress\":\"\""))) + "]}");
        assertThat(service.search(1, "서울숲")).hasSize(5).allSatisfy(row -> assertThat(row.address()).isEqualTo("지번 주소"));
    }

    @Test void timeoutDoesNotLeakCredentials() throws Exception {
        when(http.send(any(), any())).thenThrow(new HttpTimeoutException("sensitive-provider-detail"));
        assertStatus(503, () -> service.search(1, "서울숲"));
    }

    @Test void interruptionRestoresThreadFlag() throws Exception {
        when(http.send(any(), any())).thenThrow(new InterruptedException());
        try { assertStatus(503, () -> service.search(1, "서울숲")); assertThat(Thread.currentThread().isInterrupted()).isTrue(); }
        finally { Thread.interrupted(); }
    }

    @Test void atMostEightProviderCallsRunAndSlotsRecoverAfterFailures() throws Exception {
        var started = new CountDownLatch(8); var release = new CountDownLatch(1);
        when(http.send(any(), any())).thenAnswer(call -> {
            started.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) throw new IOException("test timeout");
            throw new IOException("fixture failure");
        });
        var executor = Executors.newFixedThreadPool(8);
        try {
            var futures = new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for (long id = 1; id <= 8; id++) { long userId = id;
                futures.add(executor.submit(() -> assertStatus(503, () -> service.search(userId, "서울숲")))); }
            assertThat(started.await(3, TimeUnit.SECONDS)).isTrue();
            assertStatus(429, () -> service.search(9, "서울숲"));
            release.countDown();
            for (var future : futures) future.get(5, TimeUnit.SECONDS);
            success("{\"items\":[]}"); assertThat(service.search(10, "서울숲")).isEmpty();
        } finally { release.countDown(); executor.shutdownNow(); }
    }

    private static void assertStatus(int status, org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode().value()).isEqualTo(status));
    }
}
