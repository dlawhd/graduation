package shop.esjh.memoryjar.service.file;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.imageio.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.security.BoundedWorkGate;
import shop.esjh.memoryjar.config.properties.*;
import shop.esjh.memoryjar.model.file.FileUploadCompletionTarget;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

/** 업로드의 실제 내용을 제한된 작업 슬롯에서 검사한다. 크기·S3 버전을 고정하고 임시 파일은 항상 지운다. */
@Service
public class UploadedMediaValidator {
    private final S3Client s3; private final S3Properties storage; private final FileProperties properties;
    private final ObjectMapper json; private final BoundedWorkGate work=new BoundedWorkGate(2);
    public UploadedMediaValidator(S3Client s3,S3Properties storage,FileProperties properties,ObjectMapper json) {
        this.s3=s3;this.storage=storage;this.properties=properties;this.json=json;
    }

    public void validate(FileUploadCompletionTarget target,String etag) {
        validateObject(target,S3PresignService.stagingKey(target.s3Key()),etag);
    }

    /** 이전 확정 사본이 남아 있으면 그 사본도 검사해 메타데이터만으로 완료시키지 않는다. */
    public void validatePublished(FileUploadCompletionTarget target,String etag) {
        validateObject(target,target.s3Key(),etag);
    }

    private void validateObject(FileUploadCompletionTarget target,String key,String etag) {
        if (etag==null || etag.isBlank()) throw problem(HttpStatus.BAD_GATEWAY,"파일 버전을 확인할 수 없어.");
        if (target.size()==null || target.size()<=0 || target.size()>30L*1024*1024) throw invalid();
        Path file=null;
        try(var permit=work.acquire()) {
            file=Files.createTempFile("memoryjar-media-", ".upload");
            // HEAD 이후 바뀐 원본을 검사하지 않는다. 파일 크기만큼만 읽어 메모리와 임시 디스크를 제한한다.
            try(var input=s3.getObject(GetObjectRequest.builder().bucket(storage.getBucket())
                    .key(key).ifMatch(etag).build());
                    var output=Files.newOutputStream(file)) {
                byte[] buffer=new byte[65536]; long total=0; int count;
                while((count=input.read(buffer))!=-1) {
                    total+=count; if(total>target.size()) throw invalid(); output.write(buffer,0,count);
                }
                if(total!=target.size()) throw invalid();
            }
            validateContent(file,target.contentType());
        } catch(IOException | software.amazon.awssdk.core.exception.SdkException failure) {
            throw problem(HttpStatus.BAD_GATEWAY,"파일 내용을 확인하지 못했어. 잠시 후 다시 시도해 줘.");
        } finally { delete(file); }
    }

    /** 원본을 변경하지 않고 실제 이미지 디코딩 또는 영상 컨테이너·영상 스트림을 확인한다. */
    void validateContent(Path file,String contentType) {
        if(contentType==null) throw invalid();
        if(contentType.startsWith("image/")) image(file,contentType);
        else if(Set.of("video/mp4","video/quicktime","video/webm").contains(contentType)) video(file,contentType);
        else throw invalid();
    }

    private void image(Path file,String contentType) {
        try(var input=ImageIO.createImageInputStream(file.toFile())) {
            var readers=ImageIO.getImageReaders(input); if(!readers.hasNext()) throw invalid();
            var reader=readers.next();
            try {
                reader.setInput(input,true,true);
                var format=reader.getFormatName().toLowerCase(Locale.ROOT);
                String actual=switch(format) { case "jpg","jpeg" -> "image/jpeg"; case "png" -> "image/png";
                    case "gif" -> "image/gif"; case "webp" -> "image/webp"; default -> ""; };
                int width=reader.getWidth(0),height=reader.getHeight(0);
                if(!actual.equals(contentType) || width<=0 || height<=0 || width>8192 || height>8192
                        || (long)width*height>16777216) throw invalid();
                // 과도한 해상도의 버퍼를 만들지 않고 실제 디코딩 성공 여부를 확인한다.
                var params=reader.getDefaultReadParam();
                int sample=Math.max(1,(Math.max(width,height)+2047)/2048);
                params.setSourceSubsampling(sample,sample,0,0);
                var decoded=reader.read(0,params); if(decoded==null) throw invalid(); decoded.flush();
            } finally { reader.dispose(); }
        } catch(IOException | IllegalArgumentException failure) { throw invalid(); }
    }

    private void video(Path file,String contentType) {
        Path output=null; Process process=null;
        try {
            output=Files.createTempFile("memoryjar-probe-", ".json");
            // 셸·사용자 URL을 사용하지 않는다. 외부 프로토콜을 차단하고 실행 시간·분석량도 제한한다.
            process=new ProcessBuilder(properties.getFfprobeExecutable(),"-v","error","-max_alloc","33554432",
                    "-protocol_whitelist","file,pipe","-format_whitelist","mov,mp4,m4a,3gp,3g2,mj2,matroska,webm","-probesize","5242880","-analyzeduration","3000000",
                    "-select_streams","v:0","-show_entries","format=format_name:stream=codec_type,width,height:stream_disposition=attached_pic",
                    "-of","json",file.toString()).redirectOutput(output.toFile())
                    .redirectError(ProcessBuilder.Redirect.DISCARD).start();
            if(!process.waitFor(5,TimeUnit.SECONDS)) { process.destroyForcibly(); throw invalid(); }
            if(process.exitValue()!=0 || Files.size(output)>65536) throw invalid();
            var result=json.readTree(output.toFile()); var streams=result.path("streams");
            if(!streams.isArray() || streams.size()!=1) throw invalid();
            var stream=streams.get(0); int w=stream.path("width").asInt(),h=stream.path("height").asInt();
            String format=result.path("format").path("format_name").asText();
            boolean container=contentType.equals("video/webm") ? format.contains("webm") : format.contains("mov");
            if(stream.path("disposition").path("attached_pic").asInt()!=0 || !container || !stream.path("codec_type").asText().equals("video") || w<=0 || h<=0
                    || w>8192 || h>8192 || (long)w*h>40000000) throw invalid();
        } catch(InterruptedException interrupted) {
            Thread.currentThread().interrupt(); throw problem(HttpStatus.SERVICE_UNAVAILABLE,"영상 검사가 중단됐어. 다시 시도해 줘.");
        } catch(IOException unavailable) {
            // 검사기가 없거나 실행할 수 없으면 임의 바이트를 영상으로 승인하지 않는다.
            throw problem(HttpStatus.SERVICE_UNAVAILABLE,"영상 검사기를 사용할 수 없어. 잠시 후 다시 시도해 줘.");
        } finally {
            if(process!=null && process.isAlive()) {
                process.destroyForcibly();
                try { process.waitFor(1,TimeUnit.SECONDS); } catch(InterruptedException ignored) { Thread.currentThread().interrupt(); }
            }
            delete(output);
        }
    }
    private ResponseStatusException invalid() { return problem(HttpStatus.BAD_REQUEST,"실제 사진·영상 형식이나 크기를 확인해 줘."); }
    private ResponseStatusException problem(HttpStatus status,String message) { return new ResponseStatusException(status,message); }
    private void delete(Path file) { if(file!=null) try { Files.deleteIfExists(file); } catch(IOException ignored) { file.toFile().deleteOnExit(); } }
}
