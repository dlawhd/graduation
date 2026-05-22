package shop.esjh.memoryjar.config.properties;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

@Getter
@Setter
@ConfigurationProperties(prefix = "app.file")
public class FileProperties {

    // 업로드 가능한 최대 파일 크기(byte)
    private long maxSize;

    // 허용할 이미지 타입들
    private List<String> allowedImageTypes;

    // 허용할 영상 타입들
    private List<String> allowedVideoTypes;
}