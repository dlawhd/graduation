package shop.esjh.memoryjar.service.file;

import java.time.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.repository.note.NoteAttachmentRepository;
import shop.esjh.memoryjar.repository.file.FileUploadRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import shop.esjh.memoryjar.service.jar.JarOpenService;
import shop.esjh.memoryjar.entity.note.NoteAttachment;
import shop.esjh.memoryjar.enums.file.FileUploadStatus;

/** 첨부 조회 시 현재 멤버와 쪽지 비공개 규칙을 확인한다. 저장소 요청은 트랜잭션 밖에서 실행한다. */
@Service
public class FileReadAccessService {
    private final NoteAttachmentRepository attachments;
    private final FileUploadRepository uploads;
    private final JarMemberRepository members;
    private final JarOpenService opening;
    public FileReadAccessService(NoteAttachmentRepository attachments, FileUploadRepository uploads,
            JarMemberRepository members, JarOpenService opening) {
        this.attachments=attachments; this.uploads=uploads; this.members=members; this.opening=opening;
    }

    @Transactional(readOnly=true)
    public ReadTarget attachment(Long userId, Long attachmentId) {
        return authorize(userId, attachments.findForRead(attachmentId).orElseThrow(this::missing));
    }

    /** 미연결 파일은 업로더만 미리 본다. 연결 후에는 업로더도 멤버 탈퇴·공개 상태 검사를 우회할 수 없다. */
    @Transactional(readOnly=true)
    public ReadTarget upload(Long userId, Long uploadId) {
        var upload=uploads.findById(uploadId).orElseThrow(this::missing);
        if (!upload.getUser().getId().equals(userId)) throw missing();
        if (upload.getStatus()!=FileUploadStatus.COMPLETED && upload.getStatus()!=FileUploadStatus.CONSUMED) throw missing();
        var reference=attachments.findHistoricalReference(upload.getS3Key());
        if (reference.isPresent()) return attachment(userId,reference.get());
        if (upload.getStatus()==FileUploadStatus.CONSUMED) throw missing();
        if (upload.getStatus()!=FileUploadStatus.COMPLETED || upload.getUnusedCleanupAfter()==null
                || !upload.getUnusedCleanupAfter().isAfter(LocalDateTime.now(ZoneId.of("Asia/Seoul")))) throw missing();
        return new ReadTarget(upload.getS3Key(),upload.getContentType());
    }

    private ReadTarget authorize(Long userId, NoteAttachment attachment) {
        var note=attachment.getNote(); var jar=note.getJar();
        if (note.getDeletedAt()!=null || jar.getDeletedAt()!=null
                || !members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(jar.getJarId(),userId)) throw missing();
        // 파일 읽기도 새 오픈 작업을 시작하지 않는다. 공개 상태가 확정된 뒤에만 다른 멤버에게 허용한다.
        if (!note.isAuthor(userId) && !opening.isOpened(jar.getJarId())) throw missing();
        return new ReadTarget(attachment.getS3Key(),attachment.getContentType());
    }
    private ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"파일을 찾을 수 없어."); }
    public record ReadTarget(String key,String contentType) {}
}
