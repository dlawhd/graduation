package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/*
 * SesProperties 역할
 *
 * application.yml의:
 *
 * app.ses.*
 *
 * 설정값을 Java 코드에서 사용하기 쉽게
 * 하나의 객체로 묶어주는 클래스야.
 *
 *
 * 예:
 *
 * app:
 *   ses:
 *     region: ap-northeast-2
 *     from-email: no-reply@esjh.shop
 *
 *
 * 그러면 Java에서는:
 *
 * sesProperties.getRegion()
 * sesProperties.getFromEmail()
 *
 * 로 꺼내 사용할 수 있어.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.ses")
public class SesProperties {

    /*
     * Amazon SES를 사용할 AWS Region
     *
     * 현재 Memory Jar AWS 환경과 맞춰
     * ap-northeast-2(서울)를 사용할 예정이다.
     */
    private String region;

    /*
     * 사용자의 메일함에 표시될 발신 이메일 주소
     *
     * 예:
     *
     * no-reply@esjh.shop
     *
     * 이 이메일 또는 esjh.shop 도메인은
     * Amazon SES에서 Verified Identity 상태여야 한다.
     */
    private String fromEmail;
}