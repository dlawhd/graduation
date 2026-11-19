package shop.esjh.memoryjar.dto.jar.request;

/** 원하는 최종 값을 받아 재시도해도 즐겨찾기가 뒤집히지 않는다. */
public record JarFavoriteRequest(@jakarta.validation.constraints.NotNull Boolean favorite) {}
