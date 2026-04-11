package com.example.demo.service.note;

import com.example.demo.dto.note.request.NoteAttachmentCreateRequest;
import com.example.demo.dto.note.request.NoteAttachmentSortUpdateRequest;
import com.example.demo.entity.file.FileUpload;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteAttachment;
import com.example.demo.enums.file.FilePurpose;
import com.example.demo.enums.file.FileUploadStatus;
import com.example.demo.repository.file.FileUploadRepository;
import com.example.demo.repository.note.NoteAttachmentRepository;
import com.example.demo.repository.note.NoteRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true)
public class NoteAttachmentService {

    // 한 쪽지에 붙일 수 있는 최대 첨부 개수
    // 필요하면 나중에 설정값(application.yml)으로 뺄 수도 있음
    private static final int MAX_ATTACHMENTS_PER_NOTE = 10;

    private final NoteRepository noteRepository;
    private final NoteAttachmentRepository noteAttachmentRepository;
    private final FileUploadRepository fileUploadRepository;

    public NoteAttachmentService(
            NoteRepository noteRepository,
            NoteAttachmentRepository noteAttachmentRepository,
            FileUploadRepository fileUploadRepository
    ) {
        this.noteRepository = noteRepository;
        this.noteAttachmentRepository = noteAttachmentRepository;
        this.fileUploadRepository = fileUploadRepository;
    }

    // 요청에서 s3Key를 꺼내고 기본 검증하는 함수
    private List<String> extractAndValidateS3Keys(List<NoteAttachmentCreateRequest> requests) {
        List<String> s3Keys = requests.stream()
                .map(NoteAttachmentCreateRequest::s3Key)
                .map(s3Key -> s3Key == null ? null : s3Key.trim())
                .toList();

        boolean hasBlank = s3Keys.stream().anyMatch(s3Key -> s3Key == null || s3Key.isBlank());
        if (hasBlank) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "s3Key는 비어 있을 수 없어."
            );
        }

        long distinctCount = s3Keys.stream().distinct().count();
        if (distinctCount != s3Keys.size()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "같은 첨부 파일을 중복으로 보낼 수 없어."
            );
        }

        return s3Keys;
    }

    // 이 메서드는 complete까지 끝난 내 업로드 파일 여러 개를 실제 note_attachments 로 저장하는 역할
    @Transactional
    public List<NoteAttachment> createAttachments(
            Long currentUserId,
            Long noteId,
            List<NoteAttachmentCreateRequest> requests
    ) {
        // 0. 요청이 없으면 바로 끝
        if (requests == null || requests.isEmpty()) {
            return List.of();
        }

        // 1. 요청 안에서 같은 s3Key를 중복으로 보냈는지 검사
        extractAndValidateS3Keys(requests);

        // 2. 쪽지 존재 확인
        Note note = getNoteOrThrow(noteId);

        // 3. 개수 제한 확인
        validateAttachmentCount(noteId, requests.size());

        // 4. 요청에서 s3Key 목록만 꺼내기
        List<String> requestedS3Keys = requests.stream()
                .map(NoteAttachmentCreateRequest::s3Key)
                .toList();

        // 5. 현재 사용자 + NOTE 목적 + COMPLETED 상태 업로드만 조회
        List<FileUpload> uploads = fileUploadRepository
                .findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
                        currentUserId,
                        FilePurpose.NOTE,
                        FileUploadStatus.COMPLETED,
                        requestedS3Keys
                );

        // 6. 조회 개수가 다르면 잘못된 파일이 섞인 것
        if (uploads.size() != requestedS3Keys.size()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "complete가 끝난 내 NOTE 첨부만 연결할 수 있어."
            );
        }

        // 7. 찾기 쉽게 Map으로 바꾸기
        Map<String, FileUpload> uploadMap = uploads.stream()
                .collect(Collectors.toMap(FileUpload::getS3Key, Function.identity()));

        // 8. 마지막 정렬 순서 찾기
        int nextSortOrder = getNextSortOrder(noteId);

        List<NoteAttachment> attachments = new ArrayList<>();

        for (String s3Key : requestedS3Keys) {
            FileUpload upload = uploadMap.get(s3Key);

            if (upload == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "유효하지 않은 첨부 파일이 포함되어 있어."
                );
            }

            // 이미 다른 note에 붙은 s3Key인지 확인
            validateDuplicateS3Key(upload.getS3Key());

            // 이제는 file_uploads 값을 믿고 저장
            NoteAttachment attachment = NoteAttachment.builder()
                    .note(note)
                    .sortOrder(nextSortOrder++)
                    .s3Key(upload.getS3Key())
                    .url(upload.getPublicUrl())
                    .thumbnailUrl(null)
                    .contentType(upload.getContentType())
                    .size(upload.getSize())
                    .build();

            attachments.add(attachment);

            // 한 번 연결된 파일은 다시 못 쓰게 처리
            upload.markConsumed();
        }

        return noteAttachmentRepository.saveAll(attachments);
    }

    // 여러 개를 한 번에 가져오는 메서드
    public List<NoteAttachment> getAttachmentsByNoteIds(List<Long> noteIds) {
        if (noteIds == null || noteIds.isEmpty()) {
            return List.of();
        }

        return noteAttachmentRepository.findAllByNote_NoteIdInOrderByNote_NoteIdAscSortOrderAsc(noteIds);
    }

    // 특정 쪽지의 첨부파일 목록 조회
    // 화면에서 쪽지 상세를 열었을 때, 첨부파일을 순서대로 보여주기 위해 사용
    public List<NoteAttachment> getAttachments(Long noteId) {

        // noteId가 잘못 들어온 경우를 초기에 잡기 위해 note 존재도 확인
        getNoteOrThrow(noteId);

        return noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId);
    }

    // 첨부파일 1개의 썸네일 주소 수정
    @Transactional
    public NoteAttachment updateThumbnailUrl(Long attachmentId, String thumbnailUrl) {
        NoteAttachment attachment = getAttachmentOrThrow(attachmentId);
        attachment.updateThumbnailUrl(thumbnailUrl);
        return attachment;
    }

    // 첨부파일 순서 재정렬
    @Transactional
    public void updateSortOrders(Long noteId,
                                 List<NoteAttachmentSortUpdateRequest> requests) {

        // 0. 요청이 비어 있으면 바꿀 게 없으니 그냥 종료
        if (requests == null || requests.isEmpty()) {
            return;
        }

        // 1. 같은 sortOrder가 중복으로 들어왔는지 먼저 검사
        // 예:
        // attachment 1 -> sortOrder 0
        // attachment 2 -> sortOrder 0
        // 이렇게 오면 순서가 겹치니까 잘못된 요청
        // DB unique 제약에서 막히기 전에 서비스에서 먼저 예쁘게 막아주는 역할
        validateDuplicateSortOrder(requests);

        // 2. note가 실제로 존재하는지 확인
        getNoteOrThrow(noteId);

        // 3. 현재 쪽지에 연결된 첨부파일 목록을 가져오기
        List<NoteAttachment> attachments =
                noteAttachmentRepository.findAllByNote_NoteIdOrderBySortOrderAsc(noteId);

        // 4. 현재 첨부 개수와 요청 개수가 다르면 이상한 요청으로 판단
        if (attachments.size() != requests.size()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "첨부파일 순서 정보가 올바르지 않아."
            );
        }

        // 5. 요청된 attachmentId가 정말 이 note 소속인지 검사하면서 순서 변경
        for (NoteAttachmentSortUpdateRequest request : requests) {
            NoteAttachment target = attachments.stream()
                    .filter(attachment -> attachment.getId().equals(request.attachmentId()))
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "현재 쪽지에 없는 첨부파일이 포함되어 있어."
                    ));

            // 6. 검증이 끝난 첨부파일의 순서 변경
            target.updateSortOrder(request.sortOrder());
        }
    }

    // 요청으로 들어온 sortOrder 값이 서로 겹치는지 검사
    // [0, 1, 2] -> 정상
    // [0, 0, 1] -> 중복 발생 -> 예외
    private void validateDuplicateSortOrder(List<NoteAttachmentSortUpdateRequest> requests) {

        // distinct()를 쓰면 중복을 제거한 값 개수를 셀 수 있음
        long distinctCount = requests.stream()
                .map(NoteAttachmentSortUpdateRequest::sortOrder)
                .distinct()
                .count();

        if (distinctCount != requests.size()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "중복된 sortOrder가 있어."
            );
        }
    }

    // noteId로 Note 조회, 없으면 404 에러 발생
    private Note getNoteOrThrow(Long noteId) {
        return noteRepository.findByNoteId(noteId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "쪽지를 찾을 수 없어."
                ));
    }

    // attachmentId로 첨부파일 조회, 없으면 404 에러 발생
    private NoteAttachment getAttachmentOrThrow(Long attachmentId) {
        return noteAttachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "첨부파일을 찾을 수 없어."
                ));
    }

    // 다음 sortOrder 계산
    // 예: 기존 마지막이 2면 -> 다음은 3, 기존 첨부가 하나도 없으면 -> 0부터 시작
    private int getNextSortOrder(Long noteId) {
        return noteAttachmentRepository.findTopByNote_NoteIdOrderBySortOrderDesc(noteId)
                .map(attachment -> attachment.getSortOrder() + 1)
                .orElse(0);
    }

    // 같은 s3Key 중복 저장 방지
    private void validateDuplicateS3Key(String s3Key) {
        if (s3Key == null || s3Key.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "s3Key는 비어 있을 수 없어."
            );
        }

        if (noteAttachmentRepository.existsByS3Key(s3Key)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 저장된 첨부파일이야."
            );
        }
    }

    // 첨부 개수 제한 검사
    private void validateAttachmentCount(Long noteId, int newAttachmentCount) {
        long currentCount = noteAttachmentRepository.countByNote_NoteId(noteId);

        if (currentCount + newAttachmentCount > MAX_ATTACHMENTS_PER_NOTE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "쪽지에는 첨부파일을 최대 " + MAX_ATTACHMENTS_PER_NOTE + "개까지 저장할 수 있어."
            );
        }
    }
}