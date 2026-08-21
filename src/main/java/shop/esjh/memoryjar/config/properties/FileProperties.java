package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@Getter
@Setter
@ConfigurationProperties(prefix = "app.file")
public class FileProperties {

    /*
     * FileProperties 역할
     *
     * application.yml의 app.file 설정값을
     * Java 코드에서 사용할 수 있게 받아오는 클래스야.
     *
     * 쉽게 말하면:
     *
     * application.yml
     *      ↓
     * FileProperties
     *      ↓
     * S3PresignService
     *
     * 순서로 파일 업로드 제한값을 전달해준다.
     */

    // 사진의 최대 업로드 크기(byte)
    // 현재 기본값은 application.yml 기준 10MB다.
    private long maxSize;

    // 영상의 최대 업로드 크기(byte)
    // 현재 기본값은 application.yml 기준 30MB다.
    private long maxVideoSize;

    // 업로드를 허용하는 이미지 MIME 타입들
    private List<String> allowedImageTypes;

    // 업로드를 허용하는 영상 MIME 타입들
    private List<String> allowedVideoTypes;
}