package shop.esjh.memoryjar.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.dto.request.MeUpdateRequest;
import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.dto.response.MeResponse;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.service.UserService;

import java.util.Map;

/*
 * MeController 역할
 *
 * 현재 로그인한 사용자의:
 *
 * - 내 정보 조회
 * - 닉네임 변경
 *
 * 을 담당한다.
 *
 * GET   /api/v1/me
 * PATCH /api/v1/me
 */
@RestController
@RequestMapping("/api/v1/me")
public class MeController {

    private final UserService
            userService;


    public MeController(
            UserService userService
    ) {
        this.userService =
                userService;
    }


    /*
     * =========================================================
     * 내 정보 조회
     * =========================================================
     *
     * JWT 안에 들어 있는 옛날 이름을 반환하지 않고
     * userId를 이용해서 DB의 최신 사용자 정보를 조회한다.
     */
    @GetMapping
    public ApiResponse<MeResponse> me(
            Authentication authentication
    ) {

        Long userId =
                extractUserId(
                        authentication
                );


        User user =
                userService.getUser(
                        userId
                );


        return ApiResponse.of(
                toResponse(
                        user
                )
        );
    }


    /*
     * =========================================================
     * 닉네임 변경
     * =========================================================
     *
     * LOCAL 계정이든
     * NAVER / GOOGLE / KAKAO 계정이든
     * 현재 로그인한 User의 nickname을 변경한다.
     */
    @PatchMapping
    public ApiResponse<MeResponse>
    updateMe(

            Authentication authentication,

            @Valid
            @RequestBody
            MeUpdateRequest request
    ) {

        Long userId =
                extractUserId(
                        authentication
                );


        User updatedUser =
                userService
                        .changeNickname(
                                userId,
                                request.nickname()
                        );


        return ApiResponse.of(
                toResponse(
                        updatedUser
                )
        );
    }


    /*
     * JWT Authentication에서
     * 현재 사용자 번호를 꺼낸다.
     */
    private Long extractUserId(
            Authentication authentication
    ) {

        if (
                authentication == null
                        || authentication.getPrincipal() == null
        ) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "로그인이 필요합니다."
            );
        }


        Object principal =
                authentication
                        .getPrincipal();


        Object rawUserId;


        /*
         * 현재 JwtAuthenticationFilter에서는
         * principal을 Map으로 넣고 있다.
         */
        if (principal instanceof Map<?, ?> map) {

            rawUserId =
                    map.get(
                            "userId"
                    );

        } else {

            /*
             * 혹시 다른 Authentication 구현이 들어왔을 때의
             * 예비 처리
             */
            rawUserId =
                    authentication
                            .getName();
        }


        try {

            return Long.valueOf(
                    String.valueOf(
                            rawUserId
                    )
            );

        } catch (
                NumberFormatException exception
        ) {

            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "로그인 정보를 확인할 수 없습니다."
            );
        }
    }


    /*
     * User Entity를
     * 기존 /api/v1/me 응답 형태로 변환한다.
     *
     * 기존 프론트가 me.name을 사용하고 있으므로
     * Response 필드명은 당장 변경하지 않는다.
     *
     * 여기서 name의 의미는 Memory Jar 닉네임이다.
     */
    private MeResponse toResponse(
            User user
    ) {

        return new MeResponse(
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getBirthyear()
        );
    }
}