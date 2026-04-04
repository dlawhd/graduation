package com.example.demo.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private String frontendUrl;
    private final Cookie cookie = new Cookie();

    @Getter
    @Setter
    public static class Cookie {
        private boolean secure;
        private String sameSite;
        private String domain;
    }
}