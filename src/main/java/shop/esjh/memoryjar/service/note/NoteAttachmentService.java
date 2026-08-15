package shop.esjh.memoryjar.service.note;

import shop.esjh.memoryjar.dto.note.request.NoteAttachmentCreateRequest;
import shop.esjh.memoryjar.dto.note.request.NoteAttachmentSortUpdateRequest;
import shop.esjh.memoryjar.entity.file.FileUpload;
import shop.esjh.memoryjar.entity.note.Note;
import shop.esjh.memoryjar.entity.note.NoteAttachment;
import shop.esjh.memoryjar.enums.file.FilePurpose;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;
import shop.esjh.memoryjar.policy.note.NoteAttachmentPolicy;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import shop.esjh.memoryjar.repository.note.NoteAttachmentRepository;
import shop.esjh.memoryjar.repository.note.NoteRepository;
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

    /*
     * 첨부 설명을 DB에 저장하기 좋은 형태로 정리한다.
     *
     * null       -> null
     * ""         -> null
     * "  안녕  " -> "안녕"
     */
    private String normalizeCaption(String caption) {
        if (caption == null) {
            return null;
        }

        String trimmedCaption = caption.trim();

        return trimmedCaption.isEmpty()
                ? null
                : trimmedCaption;
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

        // 1. 요청 안에서 s3Key가 비었거나 중복됐는지 검사하고, 앞뒤 공백을 제거한 목록을 받는다.
        // 예: " notes/1/a.png " -> "notes/1/a.png"
        List<String> requestedS3Keys = extractAndValidateS3Keys(requests);

        // 2. 쪽지 존재 확인
        Note note = getNoteOrThrow(noteId);

        // 3. 개수 제한 확인
        validateAttachmentCount(noteId, requests.size());

        // 4. 현재 사용자 + NOTE 목적 + COMPLETED 상태 업로드만 조회
        List<FileUpload> uploads = fileUploadRepository
                .findAllByUser_IdAndPurposeAndStatusAndS3KeyIn(
                        currentUserId,
                        FilePurpose.NOTE,
                        FileUploadStatus.COMPLETED,
                        requestedS3Keys
                );

        // 5. 조회 개수가 다르면 잘못된 파일이 섞인 것
        if (uploads.size() != requestedS3Keys.size()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "complete가 끝난 내 NOTE 첨부만 연결할 수 있어."
            );
        }

        // 6. 이미 다른 쪽지에 붙은 s3Key가 있는지 한 번에 확인한다.
        // 예전에는 첨부파일 10개면 existsByS3Key 쿼리도 10번 나갈 수 있었다.
        validateDuplicateS3Keys(requestedS3Keys);

        // 7. 찾기 쉽게 Map으로 바꾸기
        Map<String, FileUpload> uploadMap = uploads.stream()
                .collect(Collectors.toMap(FileUpload::getS3Key, Function.identity()));

        // 8. 마지막 정렬 순서 찾기
        int nextSortOrder = getNextSortOrder(noteId);

        List<NoteAttachment> attachments = new ArrayList<>();

        /*
         * 프론트가 보낸 첨부 순서를 그대로 돌면서 저장한다.
         *
         * requests[0]의 s3Key와 caption은
         * 첫 번째 첨부파일에 같이 저장된다.
         */
        for (
                int index = 0;
                index < requestedS3Keys.size();
                index++
        ) {
            String s3Key =
                    requestedS3Keys.get(index);

            // 현재 파일과 함께 넘어온 추억 설명도 꺼낸다.
            NoteAttachmentCreateRequest attachmentRequest =
                    requests.get(index);

            FileUpload upload =
                    uploadMap.get(s3Key);

            if (upload == null) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "유효하지 않은 첨부 파일이 포함되어 있어."
                );
            }

            NoteAttachment attachment =
                    NoteAttachment.builder()
                            .note(note)

                            // 프론트 배열 순서 그대로 저장
                            .sortOrder(nextSortOrder++)

                            .s3Key(upload.getS3Key())
                            .url(upload.getPublicUrl())
                            .thumbnailUrl(null)
                            .contentType(
                                    upload.getContentType()
                            )
                            .size(upload.getSize())

                            // 사용자가 적은 사진/영상 설명을 저장한다.
                            .caption(
                                    normalizeCaption(
                                            attachmentRequest.caption()
                                    )
                            )
                            .build();

            attachments.add(attachment);

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

    /*
     * 저장된 첨부파일들의 순서를 안전하게 다시 정렬한다.
     *
     * A=0, B=1을 A=1, B=0으로 바로 변경하면
     * 중간 순간에 sortOrder=1이 두 개가 될 수 있다.
     *
     * 그래서:
     * 1. 모든 첨부를 임시 번호로 이동
     * 2. flush
     * 3. 최종 번호로 이동
     * 4. flush
     * 순서로 처리한다.
     */
    @Transactional
    public void updateSortOrders(
            Long noteId,
            List<NoteAttachmentSortUpdateRequest> requests
    ) {
        // 요청이 없으면 변경할 것도 없다.
        if (requests == null || requests.isEmpty()) {
            return;
        }

        // 요청 안의 null과 중복 값을 먼저 검사한다.
        validateBasicSortOrderRequests(requests);

        // 쪽지가 실제로 존재하는지 확인한다.
        getNoteOrThrow(noteId);

        // 기존 첨부파일을 현재 순서대로 조회한다.
        List<NoteAttachment> attachments =
                noteAttachmentRepository
                        .findAllByNote_NoteIdOrderBySortOrderAsc(
                                noteId
                        );

        // 요청이 현재 첨부 전체를 정확하게 나타내는지 확인한다.
        validateSortOrderRequests(
                attachments,
                requests
        );

        // attachmentId로 첨부 객체를 바로 찾기 위한 Map
        Map<Long, NoteAttachment> attachmentMap =
                attachments.stream()
                        .collect(
                                Collectors.toMap(
                                        NoteAttachment::getId,
                                        Function.identity()
                                )
                        );

        /*
         * 기존 번호 및 최종 번호와 겹치지 않는
         * 충분히 큰 임시 시작 번호를 만든다.
         *
         * 현재 최대 번호가 2이고 첨부가 3개라면:
         * temporaryStart = 2 + 3 + 1 = 6
         */
        int temporaryStart =
                attachments.stream()
                        .map(
                                NoteAttachment::getSortOrder
                        )
                        .filter(Objects::nonNull)
                        .max(Integer::compareTo)
                        .orElse(-1)
                        + attachments.size()
                        + 1;

        /*
         * 모든 첨부를 임시 번호로 이동한다.
         *
         * 기존:
         * A=0, B=1
         *
         * 임시:
         * A=3, B=4
         */
        for (
                int index = 0;
                index < attachments.size();
                index++
        ) {
            attachments.get(index)
                    .updateSortOrder(
                            temporaryStart + index
                    );
        }

        /*
         * 임시 번호를 DB에 먼저 반영해서
         * 기존 0, 1, 2 자리를 완전히 비운다.
         */
        noteAttachmentRepository.flush();

        /*
         * 사용자가 요청한 최종 순서를 적용한다.
         */
        for (
                NoteAttachmentSortUpdateRequest request :
                requests
        ) {
            NoteAttachment target =
                    attachmentMap.get(
                            request.attachmentId()
                    );

            target.updateSortOrder(
                    request.sortOrder()
            );
        }

        /*
         * 최종 순서도 DB에 바로 반영해
         * unique 충돌 여부를 메서드 안에서 확인한다.
         */
        noteAttachmentRepository.flush();
    }

    /*
     * DB 조회 전에 요청 자체의 기본 오류를 검사한다.
     */
    private void validateBasicSortOrderRequests(
            List<NoteAttachmentSortUpdateRequest> requests
    ) {
        // null 요청 또는 attachmentId가 없는 요청 확인
        boolean hasNullAttachmentId =
                requests.stream()
                        .anyMatch(
                                request ->
                                        request == null ||
                                                request.attachmentId() == null
                        );

        if (hasNullAttachmentId) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "attachmentId는 비어 있을 수 없어."
            );
        }

        // sortOrder가 없는 요청 확인
        boolean hasNullSortOrder =
                requests.stream()
                        .anyMatch(
                                request ->
                                        request.sortOrder() == null
                        );

        if (hasNullSortOrder) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "sortOrder는 비어 있을 수 없어."
            );
        }

        // 같은 attachmentId가 두 번 들어왔는지 확인
        long distinctAttachmentIdCount =
                requests.stream()
                        .map(
                                NoteAttachmentSortUpdateRequest
                                        ::attachmentId
                        )
                        .distinct()
                        .count();

        if (
                distinctAttachmentIdCount !=
                        requests.size()
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "중복된 attachmentId가 있어."
            );
        }

        // 같은 sortOrder가 두 번 들어왔는지 확인
        long distinctSortOrderCount =
                requests.stream()
                        .map(
                                NoteAttachmentSortUpdateRequest
                                        ::sortOrder
                        )
                        .distinct()
                        .count();

        if (
                distinctSortOrderCount !=
                        requests.size()
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "중복된 sortOrder가 있어."
            );
        }
    }

    /*
     * 순서 변경 요청이 현재 첨부파일 전체와 일치하는지 검사한다.
     */
    private void validateSortOrderRequests(
            List<NoteAttachment> attachments,
            List<NoteAttachmentSortUpdateRequest> requests
    ) {
        // 현재 첨부 개수와 요청 개수가 같아야 한다.
        if (
                attachments.size() !=
                        requests.size()
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "첨부파일 순서 정보가 올바르지 않아."
            );
        }

        // 요청으로 받은 attachmentId 목록
        Set<Long> requestedAttachmentIds =
                requests.stream()
                        .map(
                                NoteAttachmentSortUpdateRequest
                                        ::attachmentId
                        )
                        .collect(
                                Collectors.toSet()
                        );

        // 실제 쪽지에 들어 있는 attachmentId 목록
        Set<Long> currentAttachmentIds =
                attachments.stream()
                        .map(NoteAttachment::getId)
                        .collect(
                                Collectors.toSet()
                        );

        // 다른 쪽지의 첨부파일이 섞이면 막는다.
        if (
                !currentAttachmentIds.equals(
                        requestedAttachmentIds
                )
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "현재 쪽지에 없는 첨부파일이 포함되어 있어."
            );
        }

        /*
         * 첨부가 3개라면 최종 sortOrder는
         * 정확히 0, 1, 2여야 한다.
         */
        Set<Integer> requestedSortOrders =
                requests.stream()
                        .map(
                                NoteAttachmentSortUpdateRequest
                                        ::sortOrder
                        )
                        .collect(
                                Collectors.toSet()
                        );

        Set<Integer> expectedSortOrders =
                new HashSet<>();

        for (
                int sortOrder = 0;
                sortOrder < attachments.size();
                sortOrder++
        ) {
            expectedSortOrders.add(
                    sortOrder
            );
        }

        if (
                !requestedSortOrders.equals(
                        expectedSortOrders
                )
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "sortOrder는 0부터 첨부파일 개수만큼 빠짐없이 입력해야 해."
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

    // 같은 s3Key가 이미 note_attachments에 저장되어 있는지 한 번에 검사
    private void validateDuplicateS3Keys(List<String> s3Keys) {
        if (s3Keys == null || s3Keys.isEmpty()) {
            return;
        }

        // IN 조건으로 한 번에 조회한다.
        // 예: s3Keys가 10개여도 DB에는 1번만 물어본다.
        List<NoteAttachment> existingAttachments = noteAttachmentRepository.findAllByS3KeyIn(s3Keys);

        if (!existingAttachments.isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "이미 저장된 첨부파일이야."
            );
        }
    }

    /*
     * 기존 첨부 개수와 새 첨부 개수를 합쳐
     * 최대 10개를 넘는지 검사한다.
     */
    private void validateAttachmentCount(
            Long noteId,
            int newAttachmentCount
    ) {
        long currentCount =
                noteAttachmentRepository
                        .countByNote_NoteId(noteId);

        if (
                currentCount + newAttachmentCount >
                        NoteAttachmentPolicy.MAX_ATTACHMENTS_PER_NOTE
        ) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "쪽지에는 첨부파일을 최대 " +
                            NoteAttachmentPolicy.MAX_ATTACHMENTS_PER_NOTE +
                            "개까지 저장할 수 있어."
            );
        }
    }
}