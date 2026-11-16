package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

//  application.yml 안의 app.s3.* 값을 자바 객체로 꺼내오기 위한 설정 클래스
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

    // 업로드용 presigned URL 만료 시간(초)
    private int presignExpSeconds;

    // 저장된 디자인을 읽을 때는 업로드와 별도의 짧은 만료 시간을 사용한다.
    private int designReadExpSeconds = 60;
}