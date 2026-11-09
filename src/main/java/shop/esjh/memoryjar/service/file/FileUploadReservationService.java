package shop.esjh.memoryjar.service.file;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.dto.file.request.FilePresignRequest;
import shop.esjh.memoryjar.dto.file.response.FilePresignResponse;

/** 외부 서명이 끝난 뒤 사용자 잠금·계정 한도·업로드 예약 저장만 짧은 트랜잭션으로 처리한다. */
@Service
public class FileUploadReservationService {
    private final UserRepository users;
    private final FileUploadRepository uploads;
    private final FileUploadPolicy policy;

    public FileUploadReservationService(UserRepository users,FileUploadRepository uploads,FileUploadPolicy policy) {
        this.users=users;this.uploads=uploads;this.policy=policy;
    }

    @Transactional(isolation=Isolation.READ_COMMITTED)
    public FilePresignResponse reserve(Long userId,FilePresignRequest request,FilePresignResponse ticket) {
        var user=users.findByIdForUpdate(userId).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"사용자를 찾을 수 없어."));
        // 같은 사용자 요청을 직렬화하고 최신 합계를 읽어 동시 발급이 한도를 넘지 못하게 한다.
        policy.requireAvailable(userId,request.size());
        var upload=FileUpload.builder().user(user).purpose(request.purpose()).status(FileUploadStatus.PRESIGNED)
                .s3Key(ticket.s3Key()).publicUrl(ticket.publicUrl()).contentType(request.contentType()).size(request.size()).build();
        upload.scheduleStagingCleanup(ticket.expiresAt());
        uploads.save(upload);
        upload.useProtectedReadPath();
        return new FilePresignResponse(ticket.uploadUrl(),ticket.s3Key(),upload.getPublicUrl(),ticket.expiresAt());
    }
}
