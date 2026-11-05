package shop.esjh.memoryjar.service.note;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.NaverPlaceProperties;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 외부 호출을 로컬 HTTP 서버로만 돌려 실제 UTF-8 요청·HUB 헤더·JSON 수신을 확인한다. 실제 키는 쓰지 않는다. */
class NaverPlaceSearchHttpTest {
    private static final String ID = "fixture-hub-id";
    private static final String SECRET = "fixture-hub-secret";

    @Test void realHttpRoundTripPreservesHubContractAndFrontendResponse() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var received = new java.util.concurrent.atomic.AtomicReference<HttpRequest>();
        var receivedHeaders = new java.util.concurrent.atomic.AtomicReference<com.sun.net.httpserver.Headers>();
        var receivedUri = new java.util.concurrent.atomic.AtomicReference<URI>();
        server.createContext("/search/v1/local", exchange -> {
            receivedHeaders.set(exchange.getRequestHeaders()); receivedUri.set(exchange.getRequestURI());
            byte[] body = """
                    {"lastBuildDate":"Thu, 05 Nov 2026 12:00:00 +0900","total":1,"start":1,"display":1,
                     "items":[{"title":"<b>서울숲</b>","link":"https://unused.example","category":"공원",
                      "description":"","telephone":"","address":"서울 성동구 성수동",
                      "roadAddress":"서울 성동구 뚝섬로 273","mapx":"1270374000","mapy":"375445000"}]}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        try {
            var service = client(server, received);
            String query = "서울숲 카페 & 빵/+?#";
            var result = service.search(1, query);
            assertThat(received.get().uri().getHost()).isEqualTo("naverapihub.apigw.ntruss.com");
            assertThat(receivedUri.get().getPath()).isEqualTo("/search/v1/local");
            var params = new LinkedHashMap<String, String>();
            for (String pair : receivedUri.get().getRawQuery().split("&")) {
                String[] part = pair.split("=", 2);
                params.put(part[0], URLDecoder.decode(part[1], StandardCharsets.UTF_8));
            }
            assertThat(params).containsExactlyInAnyOrderEntriesOf(java.util.Map.of(
                    "query", query, "display", "5", "start", "1", "sort", "random", "format", "json"));
            assertThat(receivedHeaders.get().getFirst("X-NCP-APIGW-API-KEY-ID")).isEqualTo(ID);
            assertThat(receivedHeaders.get().getFirst("X-NCP-APIGW-API-KEY")).isEqualTo(SECRET);
            assertThat(receivedHeaders.get().getFirst("X-Naver-Client-Secret")).isNull();
            assertThat(result).containsExactly(new shop.esjh.memoryjar.dto.note.response.PlaceSearchItem(
                    "서울숲", "서울 성동구 뚝섬로 273", 37.5445, 127.0374));
        } finally { server.stop(0); }
    }

    @ParameterizedTest @ValueSource(ints = {302, 401, 403, 429})
    void actualHubFailuresDoNotFollowRedirectsOrExposeProviderDetails(int status) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var redirected = new AtomicInteger();
        server.createContext("/search/v1/local", exchange -> {
            byte[] body = ("{\"error\":{\"message\":\"" + SECRET + "\"}} ").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Location", "/unexpected");
            exchange.sendResponseHeaders(status, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.createContext("/unexpected", exchange -> {
            redirected.incrementAndGet(); exchange.sendResponseHeaders(200, -1); exchange.close();
        });
        server.start();
        try {
            assertThatThrownBy(() -> client(server, new java.util.concurrent.atomic.AtomicReference<>()).search(1, "서울숲"))
                    .isInstanceOfSatisfying(ResponseStatusException.class, error -> {
                        assertThat(error.getStatusCode().value()).isEqualTo(503);
                        assertThat(error.getReason()).doesNotContain(SECRET);
                        assertThat(error.getCause()).isNull();
                    });
            assertThat(redirected.get()).isZero();
        } finally { server.stop(0); }
    }

    /** 목적지 주소만 시험 서버로 바꾸며, 실제 요청의 경로·쿼리·헤더는 그대로 네트워크로 전송한다. */
    private NaverPlaceSearchService client(HttpServer server,
            java.util.concurrent.atomic.AtomicReference<HttpRequest> received) throws Exception {
        var transport = mock(HttpClient.class);
        var real = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1))
                .followRedirects(HttpClient.Redirect.NEVER).build();
        when(transport.send(any(HttpRequest.class), org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<String>>any()))
                .thenAnswer(invocation -> {
                    HttpRequest original = invocation.getArgument(0); received.set(original);
                    assertThat(original.uri().getHost()).isEqualTo("naverapihub.apigw.ntruss.com");
                    URI local = URI.create("http://127.0.0.1:" + server.getAddress().getPort()
                            + original.uri().getRawPath() + "?" + original.uri().getRawQuery());
                    var rewritten = HttpRequest.newBuilder(local).timeout(Duration.ofSeconds(2)).GET();
                    original.headers().map().forEach((key, values) -> values.forEach(value -> rewritten.header(key, value)));
                    return real.send(rewritten.build(), invocation.<HttpResponse.BodyHandler<String>>getArgument(1));
                });
        var properties = new NaverPlaceProperties(); properties.setClientId(ID); properties.setClientSecret(SECRET);
        return new NaverPlaceSearchService(properties, new PlaceSearchRateLimiter(), new ObjectMapper(), transport);
    }
}
