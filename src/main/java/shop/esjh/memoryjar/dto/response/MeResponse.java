package shop.esjh.memoryjar.dto.response;

public record MeResponse(
        Object userId,
        String email,
        String name,
        String birthyear
) {}