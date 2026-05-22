package shop.esjh.memoryjar.enums.jar;

/*
 * 이 enum은 저금통의 화면 테마를 정하는 역할
 * - 사용자가 저금통 만들기 화면에서 고른 테마가
 * - SPRING, SUMMER, AUTUMN 같은 값으로 서버에 전달되고
 * - DB에는 이 enum 이름이 문자열 그대로 저장
 */
public enum JarTheme {

    /*
     * 봄 테마
     * - 벚꽃 느낌
     * - 분홍 계열
     */
    SPRING,

    /*
     * 여름 테마
     * - 햇살, 잎 느낌
     * - 초록 계열
     */
    SUMMER,

    /*
     * 가을 테마
     * - 노을빛 단풍 느낌
     * - 주황, 분홍 계열
     */
    AUTUMN,

    /*
     * 겨울 테마
     * - 눈 느낌
     * - 파랑, 하양 계열
     */
    WINTER,

    /*
     * 라벤더 테마
     * - 꽃밭 느낌
     * - 보라 계열
     */
    LAVENDER,

    /*
     * 이슬 테마
     * - 아침 물방울 느낌
     * - 민트, 투명, 연하늘 계열
     */
    DEW,

    /*
     * 모래 테마
     * - 해변/사막 느낌
     * - 베이지 계열
     */
    SAND,

    /*
     * 달빛 테마
     * - 밤하늘 느낌
     * - 남색, 은색 계열
     */
    MOONLIGHT
}