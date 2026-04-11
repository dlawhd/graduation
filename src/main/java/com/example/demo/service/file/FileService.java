package com.example.demo.service.file;

import com.example.demo.config.properties.S3Properties;
import com.example.demo.dto.file.request.FileCompleteRequest;
import com.example.demo.dto.file.request.FilePresignRequest;
import com.example.demo.dto.file.response.FileCompleteResponse;
import com.example.demo.dto.file.response.FilePresignResponse;
import com.example.demo.entity.User;
import com.example.demo.entity.file.FileUpload;
import com.example.demo.enums.file.FileUploadStatus;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.file.FileUploadRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

// 이 서비스는 파일 업로드 전체 흐름을 관리하는 역할
// presign 발급 -> 업로드 기록 저장 -> complete 검증
@Service
@Transactional(readOnly = true)
public class FileService {

    private static final ZoneOffset KST_OFFSET = ZoneOffset.ofHours(9);

    private final S3PresignService s3PresignService;
    private final S3Client s3Client;
    private final S3Properties s3Properties;
    private final UserRepository userRepository;
    private final FileUploadRepository fileUploadRepository;

    public FileService(
            S3PresignService s3PresignService,
            S3Client s3Client,
            S3Properties s3Properties,
            UserRepository userRepository,
            FileUploadRepository fileUploadRepository
    ) {
        this.s3PresignService = s3PresignService;
        this.s3Client = s3Client;
        this.s3Properties = s3Properties;
        this.userRepository = userRepository;
        this.fileUploadRepository = fileUploadRepository;
    }

    // presign 발급 + 업로드 대기 기록 저장
    @Transactional
    public FilePresignResponse createPresignedUrl(Long currentUserId, FilePresignRequest request) {
        User currentUser = getUserOrThrow(currentUserId);

        FilePresignResponse response = s3PresignService.createPresignedUrl(request);

        FileUpload upload = FileUpload.builder()
                .user(currentUser)
                .purpose(request.purpose())
                .status(FileUploadStatus.PRESIGNED)
                .s3Key(response.s3Key())
                .publicUrl(response.publicUrl())
                .contentType(request.contentType())
                .size(request.size())
                .build();

        fileUploadRepository.save(upload);

        return response;
    }

    // 업로드 완료 확인
    @Transactional
    public FileCompleteResponse completeUpload(Long currentUserId, FileCompleteRequest request) {
        FileUpload upload = fileUploadRepository.findByS3Key(request.s3Key())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "업로드 기록을 찾을 수 없어."));

        // 다른 사람이 발급한 업로드 키를 몰래 complete 하는 것 방지
        if (!upload.getUser().getId().equals(currentUserId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "내가 올린 파일만 완료 처리할 수 있어.");
        }

        // purpose가 다르면 잘못된 요청
        if (upload.getPurpose() != request.purpose()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "파일 목적이 일치하지 않아.");
        }

        // 중복 complete 방지
        if (upload.getStatus() == FileUploadStatus.COMPLETED || upload.getStatus() == FileUploadStatus.CONSUMED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 완료 처리된 파일이야.");
        }

        // 진짜 S3에 파일이 있는지 확인
        HeadObjectResponse headObject = headObjectOrThrow(upload.getS3Key());

        // 업로드 전 약속한 크기와 실제 S3 파일 크기가 같은지 확인
        if (headObject.contentLength() == null || !headObject.contentLength().equals(upload.getSize())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "업로드된 파일 크기가 요청과 달라.");
        }

        // contentType도 가능하면 한 번 더 확인
        if (headObject.contentType() != null && !headObject.contentType().isBlank()) {
            if (!headObject.contentType().equals(upload.getContentType())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "업로드된 파일 타입이 요청과 달라.");
            }
        }

        upload.markCompleted();

        return new FileCompleteResponse(
                upload.getS3Key(),
                upload.getPurpose(),
                upload.getPublicUrl(),
                upload.getContentType(),
                upload.getSize(),
                upload.getCompletedAt().atOffset(KST_OFFSET)
        );
    }

    private HeadObjectResponse headObjectOrThrow(String s3Key) {
        try {
            return s3Client.headObject(builder -> builder
                    .bucket(s3Properties.getBucket())
                    .key(s3Key));
        } catch (NoSuchKeyException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "S3에 업로드된 파일을 찾을 수 없어.");
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "S3에 업로드된 파일을 찾을 수 없어.");
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "S3 파일 확인 중 오류가 발생했어.");
        }
    }

    private User getUserOrThrow(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "사용자를 찾을 수 없어."));
    }
}