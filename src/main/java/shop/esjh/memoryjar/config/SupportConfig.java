package shop.esjh.memoryjar.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import shop.esjh.memoryjar.config.properties.SupportProperties;

/** 저금통 역할과 독립된 문의 운영자 설정을 등록한다. */
@Configuration
@EnableConfigurationProperties(SupportProperties.class)
public class SupportConfig { }
