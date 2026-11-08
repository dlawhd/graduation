package shop.esjh.memoryjar.service.note;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import shop.esjh.memoryjar.dto.note.request.NoteCreateRequest;

/** 요청 본문은 저장하지 않고 SHA-256 지문으로 같은 요청 번호의 내용 변경을 감지한다. */
final class NoteCreateFingerprint {
    private NoteCreateFingerprint() {}

    static String of(NoteCreateRequest request) {
        try {
            var bytes = new ByteArrayOutputStream();
            var out = new DataOutputStream(bytes);
            write(out, request.title()); write(out, request.content());
            write(out, request.noteDate() == null ? null : request.noteDate().toString()); write(out, request.location());
            var tags = request.tags(); out.writeInt(tags == null ? -1 : tags.size());
            if (tags != null) for (var tag : tags) write(out, tag);
            var attachments = request.attachments(); out.writeInt(attachments == null ? -1 : attachments.size());
            if (attachments != null) for (var a : attachments) { write(out, a.s3Key()); write(out, a.caption()); }
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()));
        } catch (IOException | java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    // 길이를 함께 기록하므로 본문·설명에 구분 문자나 줄바꿈이 있어도 서로 다른 요청이 섞이지 않는다.
    private static void write(DataOutputStream out, String value) throws IOException {
        if (value == null) { out.writeInt(-1); return; }
        var bytes = value.getBytes(StandardCharsets.UTF_8); out.writeInt(bytes.length); out.write(bytes);
    }
}
