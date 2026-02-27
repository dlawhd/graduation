package com.example.demo.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

// 스프링은 기본적으로 “메인 클래스 패키지 이하”를 자동으로 스캔해서 설정을 적용해줌..
@Configuration
@EnableJpaAuditing
public class JpaAuditConfig {

}