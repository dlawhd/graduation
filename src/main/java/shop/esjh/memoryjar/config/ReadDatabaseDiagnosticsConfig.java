package shop.esjh.memoryjar.config;

import org.hibernate.cfg.SessionEventSettings;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import shop.esjh.memoryjar.monitoring.ReadDatabaseDiagnosticsListener;

/** 별도 조회 진단 승인이 있을 때만 Hibernate의 기본 DB 시간 콜백을 연결한다. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.monitoring.read-diagnostics-enabled", havingValue = "true")
public class ReadDatabaseDiagnosticsConfig {
    @Bean
    HibernatePropertiesCustomizer readDatabaseDiagnosticsCustomizer() {
        return properties -> {
            // 다른 자동 리스너를 조용히 덮어써 기존 계측을 없애지 않는다.
            var key = SessionEventSettings.AUTO_SESSION_EVENTS_LISTENER;
            var listener = ReadDatabaseDiagnosticsListener.class.getName();
            var existing = properties.putIfAbsent(key, listener);
            if (existing != null && !listener.equals(existing)) {
                throw new IllegalStateException("조회 진단 리스너 설정 충돌: 기존 계측을 확인해야 합니다.");
            }
        };
    }
}
