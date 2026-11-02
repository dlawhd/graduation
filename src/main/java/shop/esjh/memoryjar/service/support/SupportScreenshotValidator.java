package shop.esjh.memoryjar.service.support;

import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import javax.imageio.*;
import javax.imageio.stream.ImageInputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;

/** 작은 화면 첨부만 실제 디코딩하고 새 PNG로 만든다. 거대 해상도·애니메이션·원본 메타데이터는 허용하지 않는다. */
@Component
public class SupportScreenshotValidator {
    public static final int MAX_BYTES=2*1024*1024;
    public byte[] normalize(byte[] bytes) {
        if (bytes==null || bytes.length==0 || bytes.length>MAX_BYTES) throw invalid();
        try (ImageInputStream stream=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers=ImageIO.getImageReaders(stream); if (!readers.hasNext()) throw invalid();
            ImageReader reader=readers.next();
            try {
                reader.setInput(stream,false,true);
                int w=reader.getWidth(0),h=reader.getHeight(0);
                String format=reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!Set.of("png","jpeg","webp").contains(format) || animatedContainer(bytes,format)
                        || w<1 || h<1 || w>8000 || h>8000 || (long)w*h>12_000_000 || reader.getNumImages(true)!=1) throw invalid();
                var param=reader.getDefaultReadParam(); int sample=Math.max(1,Math.max(w,h)/1600);
                param.setSourceSubsampling(sample,sample,0,0);
                BufferedImage decoded=reader.read(0,param); if (decoded==null) throw invalid();
                if ("jpeg".equals(format)) {
                    BufferedImage oriented=shop.esjh.memoryjar.service.ai.DraftOriginalImageValidator.orientJpeg(decoded,bytes);
                    if (oriented!=decoded) decoded.flush(); decoded=oriented;
                }
                double scale=Math.min(1,1600.0/Math.max(decoded.getWidth(),decoded.getHeight()));
                var output=new BufferedImage(Math.max(1,(int)Math.round(decoded.getWidth()*scale)),
                        Math.max(1,(int)Math.round(decoded.getHeight()*scale)),BufferedImage.TYPE_INT_ARGB);
                var graphics=output.createGraphics();
                try { graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                    graphics.drawImage(decoded,0,0,output.getWidth(),output.getHeight(),null);
                } finally { graphics.dispose(); decoded.flush(); }
                var result=new ByteArrayOutputStream();
                try { if (!ImageIO.write(output,"png",result)) throw invalid(); }
                finally { output.flush(); }
                if (result.size()>MAX_BYTES) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"첨부 화면을 조금 작게 저장해 주세요. 변환 후에도 2MB 이하여야 합니다.");
                return result.toByteArray();
            } finally { reader.dispose(); }
        } catch (IOException | RuntimeException e) {
            if (e instanceof ResponseStatusException status) throw status;
            throw invalid();
        }
    }
    /** PNG/WebP의 애니메이션 청크도 검사한다. 정지 화면만 읽는 디코더가 다중 프레임을 놓치지 않게 한다. */
    private boolean animatedContainer(byte[] bytes,String format) {
        boolean png="png".equals(format),webp="webp".equals(format);if(!png&&!webp)return false;
        int offset=png?8:12;
        while(offset+(png?12:8)<=bytes.length) {
            int typeOffset=png?offset+4:offset;
            String type=new String(bytes,typeOffset,4,java.nio.charset.StandardCharsets.US_ASCII);
            if ((png&&"acTL".equals(type))||(webp&&("ANIM".equals(type)||"ANMF".equals(type))))return true;
            int sizeOffset=png?offset:offset+4;
            long size=java.nio.ByteBuffer.wrap(bytes,sizeOffset,4).order(png?java.nio.ByteOrder.BIG_ENDIAN:java.nio.ByteOrder.LITTLE_ENDIAN).getInt()&0xffffffffL;
            long next=offset+size+(png?12:8)+(webp?(size&1):0);
            if(next>bytes.length||next<=offset)return true;
            offset=(int)next;
            if(png&&"IEND".equals(type))break;
        }
        return false;
    }
    private ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST,"2MB 이하의 PNG, JPEG, WebP 단일 이미지를 첨부해 주세요."); }
}
