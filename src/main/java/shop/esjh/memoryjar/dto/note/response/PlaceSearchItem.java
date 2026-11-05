package shop.esjh.memoryjar.dto.note.response;

/** 지도 선택에 필요한 이름·주소·좌표만 반환한다. 외부 원문이나 비밀값은 전달하지 않는다. */
public record PlaceSearchItem(String name, String address, double latitude, double longitude) {
}
