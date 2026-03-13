package com.example.demo.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.jwt")

// yml에 적어둔 값을 자바 코드에서 편하게 꺼내 쓸 수 있게 해주는 역할
public class JwtProperties {

    private long accessExpSeconds;
    private long refreshExpSeconds;
}