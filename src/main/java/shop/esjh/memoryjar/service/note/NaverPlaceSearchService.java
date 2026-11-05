package shop.esjh.memoryjar.service.note;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;
import shop.esjh.memoryjar.config.properties.NaverPlaceProperties;
import shop.esjh.memoryjar.dto.note.response.PlaceSearchItem;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;

/** 서버에서만 NAVER API HUB 지역 검색을 호출한다. 느린 외부 요청 동안 DB 연결·트랜잭션을 사용하지 않는다. */
@Service
public class NaverPlaceSearchService {
    private final NaverPlaceProperties properties;
    private final PlaceSearchRateLimiter rateLimiter;
    private final ObjectMapper mapper;
    private final HttpClient http;
    private final Semaphore slots = new Semaphore(8);

    @Autowired
    public NaverPlaceSearchService(NaverPlaceProperties properties, PlaceSearchRateLimiter rateLimiter,
                                   ObjectMapper mapper) {
        this(properties, rateLimiter, mapper, HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    }

    // HTTP 대역을 주입할 수 있게 분리해 테스트에서 실제 검색·비밀키를 사용하지 않는다.
    NaverPlaceSearchService(NaverPlaceProperties properties, PlaceSearchRateLimiter rateLimiter,
                            ObjectMapper mapper, HttpClient http) {
        this.properties = properties;
        this.rateLimiter = rateLimiter;
        this.mapper = mapper;
        this.http = http;
    }

    /** 검색 버튼을 누른 요청만 처리하며 재시도를 자동 실행하지 않아 쿼터 중복 소비를 막는다. */
    public List<PlaceSearchItem> search(long userId, String query) {
        if (userId <= 0) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (query == null || query.isBlank() || query.length() > 100
                || query.chars().anyMatch(Character::isISOControl))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "검색어는 1~100자로 입력해 주세요.");
        if (properties.getClientId() == null || properties.getClientId().isBlank()
                || properties.getClientSecret() == null || properties.getClientSecret().isBlank()) throw unavailable();
        rateLimiter.consume(userId);
        if (!slots.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "장소 검색이 많아요. 잠시 후 다시 시도해 주세요.");
        try {
            // 신규 검색은 HUB 전용 주소·키만 사용한다. 로그인용/구형 키로 자동 재시도하지 않는다.
            var uri = URI.create("https://naverapihub.apigw.ntruss.com/search/v1/local?display=5&start=1&sort=random&format=json&query="
                    + URLEncoder.encode(query.strip(), StandardCharsets.UTF_8));
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(6))
                    .header("X-NCP-APIGW-API-KEY-ID", properties.getClientId().strip())
                    .header("X-NCP-APIGW-API-KEY", properties.getClientSecret().strip())
                    .header("Accept", "application/json").GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            // 외부 서비스의 오류 원문·헤더에는 내부 정보가 있을 수 있어 그대로 노출하거나 기록하지 않는다.
            if (response.statusCode() != 200 || response.body() == null || response.body().length() > 100_000)
                throw unavailable();
            return parse(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (IOException | IllegalArgumentException e) {
            throw unavailable();
        } finally {
            slots.release();
        }
    }

    private List<PlaceSearchItem> parse(String body) throws IOException {
        JsonNode root = mapper.readTree(body);
        if (root == null || !root.path("items").isArray()) throw unavailable();
        List<PlaceSearchItem> result = new ArrayList<>();
        for (JsonNode row : root.path("items")) {
            if (result.size() == 5) break;
            String name = text(row.path("title").asText(""));
            String address = text(row.path("roadAddress").asText(""));
            if (address.isBlank()) address = text(row.path("address").asText(""));
            try {
                // HUB의 WGS84 문자열과 지역 검색의 기존 10^7배 정수 표현을 같은 경위도로 맞춘다.
                double longitude = coordinate(row.path("mapx").asText(), 180);
                double latitude = coordinate(row.path("mapy").asText(), 90);
                if (name.isBlank() || address.isBlank()) continue;
                result.add(new PlaceSearchItem(name, address, latitude, longitude));
            } catch (NumberFormatException ignored) {
                // 잘못된 좌표의 결과는 지도 엉뚱한 위치에 표시하지 않는다.
            }
        }
        return List.copyOf(result);
    }

    /** 정상 경위도 또는 명확한 고정 소수점 정수만 허용한다. 임의의 큰 수를 축소해 지도에 표시하지 않는다. */
    private static double coordinate(String raw, int limit) {
        if (!raw.matches("-?[0-9]+(?:\\.[0-9]+)?")) throw new NumberFormatException();
        double value = Double.parseDouble(raw);
        if (Math.abs(value) > limit && raw.matches("-?[0-9]{7,10}")) value /= 10_000_000d;
        if (!Double.isFinite(value) || Math.abs(value) > limit) throw new NumberFormatException();
        return value;
    }

    private static String text(String value) {
        return HtmlUtils.htmlUnescape(value.replaceAll("<[^>]*>", ""))
                .replaceAll("[\\p{Cntrl}]", "").strip();
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "장소 검색을 사용할 수 없어요. 잠시 후 다시 시도하거나 장소를 직접 적어 주세요.");
    }
}
