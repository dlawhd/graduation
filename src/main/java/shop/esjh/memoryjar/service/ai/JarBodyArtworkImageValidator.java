package shop.esjh.memoryjar.service.ai;

import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.ImageIO;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;

/** 테두리는 실제 480×480 단일 PNG만 받는다. 투명도는 보존하고 메타데이터/애니메이션/과도한 입력은 제거·거절한다. */
public final class JarBodyArtworkImageValidator {
    private JarBodyArtworkImageValidator() { }
    /** 디코딩 전에 크기/형식을 제한하고 실제 픽셀을 다시 인코딩해 부가 정보를 저장하지 않는다. */
    public static byte[] normalize(MultipartFile file) {
        try {
            if(file==null||file.isEmpty()||file.getSize()>1024*1024) throw new IllegalArgumentException();
            byte[] bytes=file.getBytes();
            if(bytes.length<33||bytes.length>1024*1024||!Arrays.equals(Arrays.copyOf(bytes,8),
                    new byte[]{(byte)137,80,78,71,13,10,26,10})) throw new IllegalArgumentException();
            ByteBuffer header=ByteBuffer.wrap(bytes);
            if(header.getInt(8)!=13||header.getInt(12)!=0x49484452||header.getInt(16)!=480||header.getInt(20)!=480) throw new IllegalArgumentException();
            // PNG 크기를 먼저 확인해 디코딩 메모리를 제한한다. APNG를 첫 프레임만인 것처럼 승인하지 않는다.
            for(int at=8;at<bytes.length;) {
                if(at>bytes.length-12) throw new IllegalArgumentException();
                int length=header.getInt(at);
                if(length<0||length>bytes.length-at-12||header.getInt(at+4)==0x6163544c) throw new IllegalArgumentException();
                at+=length+12;
            }
            var image=ImageIO.read(new ByteArrayInputStream(bytes));
            if(image==null||image.getWidth()!=480||image.getHeight()!=480) throw new IllegalArgumentException();
            boolean hasInk = false;
            for (int y=0; y<480 && !hasInk; y++) for (int x=0; x<480; x++) {
                if ((image.getRGB(x,y) >>> 24) >= 48) { hasInk=true; break; }
            }
            if (!hasInk) throw new IllegalArgumentException();
            ByteArrayOutputStream output=new ByteArrayOutputStream();
            if(!ImageIO.write(image,"png",output)) throw new IllegalArgumentException();
            return output.toByteArray();
        } catch(Exception exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"테두리 그림은 1MB 이하의 480×480 PNG로 보내주세요.");
        }
    }
}
