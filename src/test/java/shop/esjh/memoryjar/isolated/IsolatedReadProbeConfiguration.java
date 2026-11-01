package shop.esjh.memoryjar.isolated;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import shop.esjh.memoryjar.monitoring.IsolatedSamplingDiagnostics;
import shop.esjh.memoryjar.monitoring.LoginDiagnostics;

/** 운영 빈을 바꾸지 않고 명시적으로 켠 격리 시험에만 표본 계측 빈을 제공한다. */
@TestConfiguration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.monitoring.isolated-read-probe", havingValue = "true")
class IsolatedReadProbeConfiguration {
    @Bean @Primary
    LoginDiagnostics isolatedSamplingDiagnostics() { return new IsolatedSamplingDiagnostics(); }
}
