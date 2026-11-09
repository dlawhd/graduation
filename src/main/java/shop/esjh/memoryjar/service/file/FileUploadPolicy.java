package shop.esjh.memoryjar.service.file;

import java.time.*;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.FileProperties;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;

/** 사용자 행의 잠금을 잡은 발급 트랜잭션 안에서 횟수·대기 파일 수·보관 용량을 함께 제한한다. */
@Service
public class FileUploadPolicy {
    private final FileUploadRepository uploads; private final FileProperties properties;
    public FileUploadPolicy(FileUploadRepository uploads,FileProperties properties) { this.uploads=uploads;this.properties=properties; }
    public void requireAvailable(Long userId,long size) {
        var usage=uploads.usage(userId,LocalDateTime.now(ZoneId.of("Asia/Seoul")).minusHours(1));
        if (usage.getRecentCount()>=properties.getMaxUploadsPerHour()
                || usage.getPendingCount()>=properties.getMaxPendingUploads())
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"업로드 요청이 많아. 잠시 후 다시 시도해 줘.");
        if (size<=0 || size>properties.getMaxAccountBytes()-usage.getStoredBytes())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"계정의 파일 보관 한도에 도달했어.");
    }
}
