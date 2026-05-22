package shop.esjh.memoryjar.controller;

import shop.esjh.memoryjar.dto.response.ApiResponse;
import shop.esjh.memoryjar.dto.response.MeResponse;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class MeController {

    @GetMapping("/api/v1/me")
    public ApiResponse<MeResponse> me(Authentication authentication) {
        Object principal = authentication.getPrincipal();

        if (principal instanceof Map<?, ?> p) {
            MeResponse response = new MeResponse(
                    p.get("userId"),
                    (String) p.get("email"),
                    (String) p.get("name"),
                    (String) p.get("birthyear")
            );
            return ApiResponse.of(response);
        }

        MeResponse response = new MeResponse(
                authentication.getName(),
                null,
                null,
                null
        );
        return ApiResponse.of(response);
    }
}