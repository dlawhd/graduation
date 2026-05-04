package com.example.demo.controller.jar;

import com.example.demo.dto.dailydraw.response.DailyDrawHistoryResponse;
import com.example.demo.dto.dailydraw.response.DailyDrawResponse;
import com.example.demo.dto.dailydraw.response.DailyDrawTodayResponse;
import com.example.demo.dto.response.ApiResponse;
import com.example.demo.service.jar.JarDailyDrawService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/v1/jars/{jarId}/daily-draw")
public class JarDailyDrawController {

    private final JarDailyDrawService jarDailyDrawService;

    public JarDailyDrawController(JarDailyDrawService jardailyDrawService) {
        this.jarDailyDrawService = jardailyDrawService;
    }

    /*
     * 오늘의 추억 한 장 뽑기 API
     *
     * POST /api/v1/jars/{jarId}/daily-draw
     *
     * 동작:
     * - 오늘 카드가 아직 없으면 새로 랜덤 1장을 뽑는다.
     * - 오늘 카드가 이미 있으면 새로 뽑지 않고 기존 오늘 카드를 반환한다.
     * - 이미 뽑힌 쪽지는 후보에서 제외된다.
     *
     * 응답:
     * - newlyDrawn = true  이면 이번 요청에서 새로 뽑힌 카드
     * - newlyDrawn = false 이면 이미 있던 오늘 카드
     */
    @PostMapping
    public ResponseEntity<ApiResponse<DailyDrawResponse>> drawToday(
            Authentication authentication,
            @PathVariable Long jarId
    ) {

        // 1. 현재 로그인한 사용자 ID 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. Service에게 오늘 카드 뽑기 요청하기
        DailyDrawResponse response = jarDailyDrawService.drawToday(currentUserId, jarId);

        // 3. 새로 뽑힌 경우에는 201 Created, 이미 오늘 카드가 있어서 기존 카드를 반환한 경우에는 200 OK로 내려준다.
        HttpStatus status = response.newlyDrawn()
                ? HttpStatus.CREATED
                : HttpStatus.OK;

        return ResponseEntity
                .status(status)
                .body(ApiResponse.of(response));
    }

    /*
     * 오늘 뽑힌 카드 조회 API
     *
     * GET /api/v1/jars/{jarId}/daily-draw/today
     *
     * 사용 상황:
     * - 저금통 상세 화면에 들어왔을 때
     * - 오늘 카드가 이미 있는지 먼저 확인하고 싶을 때
     *
     * 응답:
     * - hasTodayDraw = true  이면 오늘 카드 있음
     * - hasTodayDraw = false 이면 아직 오늘 카드 없음
     */
    @GetMapping("/today")
    public ApiResponse<DailyDrawTodayResponse> getTodayDraw(
            Authentication authentication,
            @PathVariable Long jarId
    ) {

        // 1. 현재 로그인한 사용자 ID 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 2. Service에게 오늘 카드 조회 요청하기
        DailyDrawTodayResponse response = jarDailyDrawService.getTodayDraw(currentUserId, jarId);

        // 3. 공통 성공 응답 형태로 감싸서 반환하기
        return ApiResponse.of(response);
    }

    /*
     * Daily Draw 히스토리 조회 API
     *
     * GET /api/v1/jars/{jarId}/daily-draw/history
     * GET /api/v1/jars/{jarId}/daily-draw/history?page=0&size=20
     *
     * 사용 상황:
     * - 지금까지 어떤 날짜에 어떤 쪽지가 뽑혔는지 보여줄 때
     */
    @GetMapping("/history")
    public ApiResponse<DailyDrawHistoryResponse> getHistory(
            Authentication authentication,
            @PathVariable Long jarId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {

        // 1. page, size 값이 너무 이상하지 않은지 먼저 확인하기
        validatePageAndSize(page, size);

        // 2. 현재 로그인한 사용자 ID 꺼내기
        Long currentUserId = extractCurrentUserId(authentication);

        // 3. Service에게 Daily Draw 히스토리 조회 요청하기
        DailyDrawHistoryResponse response = jarDailyDrawService.getHistory(
                currentUserId,
                jarId,
                page,
                size
        );

        // 4. 공통 성공 응답 형태로 감싸서 반환하기
        return ApiResponse.of(response);
    }

    // 현재 로그인한 사용자 ID를 Authentication에서 꺼내는 메서드
    private Long extractCurrentUserId(Authentication authentication) {

        // 인증 정보 자체가 없으면 로그인하지 않은 상태다.
        if (authentication == null || authentication.getPrincipal() == null) {
            throw new ResponseStatusException(
                    UNAUTHORIZED,
                    "인증이 필요합니다."
            );
        }

        // Spring Security가 들고 있는 로그인 사용자 정보 꺼내기
        Object principal = authentication.getPrincipal();

        // 현재 프로젝트 기준 principal은 Map 형태다.
        if (principal instanceof Map<?, ?> map) {
            // Map 안에서 userId 값 꺼내기
            Object userIdValue = map.get("userId");

            // userId 값을 Long으로 변환해서 반환
            return convertToLong(userIdValue);
        }

        // 혹시 principal 자체가 숫자인 경우도 대비한다.
        if (principal instanceof Number number) {
            return number.longValue();
        }

        throw new ResponseStatusException(
                UNAUTHORIZED,
                "인증 사용자 정보를 읽을 수 없습니다."
        );
    }

    // Object 값을 Long으로 안전하게 바꾸는 작은 메서드
    private Long convertToLong(Object value) {
        if (value == null) {
            throw new ResponseStatusException(
                    UNAUTHORIZED,
                    "로그인 사용자 번호가 없습니다."
            );
        }

        // Integer, Long 같은 숫자 타입이면 바로 longValue()로 변환한다.
        if (value instanceof Number number) {
            return number.longValue();
        }

        // String으로 들어온 경우 숫자로 변환한다.
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(
                    UNAUTHORIZED,
                    "로그인 사용자 번호 형식이 올바르지 않습니다."
            );
        }
    }

    /*
     * page, size 요청값 검증 메서드
     *
     * page는 0 이상이어야 한다.
     * size는 1 이상 100 이하여야 한다.
     *
     * 너무 큰 size를 허용하면 한 번에 너무 많은 데이터를 조회할 수 있어서 제한한다.
     */
    private void validatePageAndSize(int page, int size) {
        if (page < 0) {
            throw new ResponseStatusException(
                    BAD_REQUEST,
                    "page는 0 이상이어야 해요."
            );
        }

        if (size < 1 || size > 100) {
            throw new ResponseStatusException(
                    BAD_REQUEST,
                    "size는 1 이상 100 이하여야 해요."
            );
        }
    }
}