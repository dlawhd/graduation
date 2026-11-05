package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** NAVER API HUB 지역 검색의 서버 전용 키다. 네이버 로그인·Maps 표시용 키와 별도로 관리한다. */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.maps.naver-search")
public class NaverPlaceProperties {
    private String clientId = "";
    private String clientSecret = "";
}
