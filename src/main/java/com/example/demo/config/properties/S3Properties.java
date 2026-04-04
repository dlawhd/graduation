package com.example.demo.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "app.s3")
public class S3Properties {

    // S3 리전
    private String region;

    // S3 버킷 이름
    private String bucket;

    // 파일 공개 주소의 기본 URL
    private String publicBaseUrl;

    // presigned URL 만료 시간(초)
    private int presignExpSeconds;
}