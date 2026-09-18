package shop.esjh.memoryjar.service.ai;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;

/**
 * Canvas에서 받은 원본이 실제 PNG이고, 정해진 480×480 크기인지 바이트 기준으로 검사한다.
 * HTTP Content-Type은 클라이언트가 임의로 보낼 수 있으므로 신뢰하지 않는다.
 */
@Component
public class DraftOriginalImageValidator {

    private static final int CANVAS_WIDTH = 480;
    private static final int CANVAS_HEIGHT = 480;
    private static final byte[] PNG_SIGNATURE = {
            (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    };

    private final AiDraftProperties properties;

    public DraftOriginalImageValidator(AiDraftProperties properties) {
        this.properties = properties;
    }

    /**
     * 업로드 바이트가 10MB 이하의 디코딩 가능한 단일 PNG이며 정확히 Canvas 크기인지 확인한다.
     */
    public void validate(byte[] imageBytes) {
        if (imageBytes == null || imageBytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "원본 PNG 파일이 필요합니다.");
        }
        if (imageBytes.length > properties.getMaxOriginalImageSize()) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "원본 PNG는 10MB를 초과할 수 없습니다.");
        }
        if (!hasPngSignature(imageBytes)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "실제 PNG 파일만 업로드할 수 있습니다.");
        }

        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(imageBytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw invalidPng();
            }

            ImageReader reader = readers.next();
            try {
                // PNG가 여러 프레임을 숨기지 않았는지 확인하려면 reader가 스트림을 다시 탐색할 수 있어야 한다.
                reader.setInput(input, false, true);
                if (!"png".equalsIgnoreCase(reader.getFormatName())
                        || reader.getNumImages(true) != 1
                        || reader.getWidth(0) != CANVAS_WIDTH
                        || reader.getHeight(0) != CANVAS_HEIGHT) {
                    throw invalidPng();
                }

                // 헤더만 맞춘 손상 파일을 통과시키지 않도록 실제 디코딩까지 완료한다.
                if (reader.read(0) == null) {
                    throw invalidPng();
                }
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ResponseStatusException responseStatusException) {
                throw responseStatusException;
            }
            throw invalidPng();
        }
    }

    private boolean hasPngSignature(byte[] imageBytes) {
        if (imageBytes.length < PNG_SIGNATURE.length) {
            return false;
        }
        for (int index = 0; index < PNG_SIGNATURE.length; index++) {
            if (imageBytes[index] != PNG_SIGNATURE[index]) {
                return false;
            }
        }
        return true;
    }

    private ResponseStatusException invalidPng() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "손상되었거나 480×480이 아닌 PNG입니다.");
    }
}
