package shop.esjh.memoryjar.dto.response;

public record CsrfResponse(
        String headerName,
        String parameterName,
        String token
) {}