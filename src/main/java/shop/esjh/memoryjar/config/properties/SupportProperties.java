package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.HashSet;
import java.util.Set;

/** 문의 운영자 계정 번호만 서버 설정으로 받는다. 비어 있으면 누구에게도 운영 권한을 주지 않는다. */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.support")
public class SupportProperties {
    private Set<Long> operatorUserIds = new HashSet<>();
}
