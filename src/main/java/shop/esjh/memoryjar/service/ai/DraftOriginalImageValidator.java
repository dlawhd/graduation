package shop.esjh.memoryjar.service.ai;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;

/**
 * Canvas 또는 외부에서 받은 원본을 실제 이미지 바이트로 검증한 뒤 Cloudflare 입력용 480×480 PNG로 정규화한다.
 * 파일명과 HTTP Content-Type은 사용자가 임의로 보낼 수 있으므로 신뢰하지 않는다.
 */
@Component
public class DraftOriginalImageValidator {

    private static final int CANVAS_WIDTH = 480;
    private static final int CANVAS_HEIGHT = 480;
    private static final Set<String> ALLOWED_FORMATS = Set.of("png", "jpeg", "webp");

    private final AiDraftProperties properties;

    public DraftOriginalImageValidator(AiDraftProperties properties) {
        this.properties = properties;
    }

    /**
     * PNG/JPEG/WebP 단일 프레임 이미지를 검증하고, 원본을 자르지 않고 흰 480×480 Canvas 중앙에 배치한다.
     * 정규화 결과만 심사·S3 저장·Cloudflare 입력에 사용해 검증한 파일과 실제 사용하는 파일을 일치시킨다.
     */
    public byte[] normalize(byte[] imageBytes) {
        if (imageBytes == null || imageBytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "원본 이미지 파일이 필요합니다.");
        }
        if (imageBytes.length > properties.getMaxOriginalImageSize()) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "원본 이미지는 10MB를 초과할 수 없습니다.");
        }

        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(imageBytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw invalidImage();
            }

            ImageReader reader = readers.next();
            try {
                // 애니메이션 WebP/APNG 같은 다중 프레임은 Draft 원본으로 사용하지 않는다.
                reader.setInput(input, false, true);
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (!ALLOWED_FORMATS.contains(format)
                        || reader.getNumImages(true) != 1
                        || exceedsDecodedImageLimit(width, height)) {
                    throw invalidImage();
                }

                // 헤더만 맞춘 손상 파일을 통과시키지 않도록 실제 디코딩까지 완료한다.
                BufferedImage decoded = reader.read(0);
                if (decoded == null) {
                    throw invalidImage();
                }
                BufferedImage oriented = "jpeg".equals(format)
                        ? applyExifOrientation(decoded, readJpegExifOrientation(imageBytes))
                        : decoded;
                return writePng(centerInsideWhiteCanvas(oriented));
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof ResponseStatusException responseStatusException) {
                throw responseStatusException;
            }
            throw invalidImage();
        }
    }

    private boolean exceedsDecodedImageLimit(int width, int height) {
        if (width < 1 || height < 1
                || width > properties.getMaxOriginalImageDimension()
                || height > properties.getMaxOriginalImageDimension()) {
            return true;
        }
        return (long) width * height > properties.getMaxOriginalImagePixels();
    }

    private BufferedImage centerInsideWhiteCanvas(BufferedImage source) {
        double scale = Math.min((double) CANVAS_WIDTH / source.getWidth(), (double) CANVAS_HEIGHT / source.getHeight());
        int scaledWidth = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int scaledHeight = Math.max(1, (int) Math.round(source.getHeight() * scale));
        int offsetX = (CANVAS_WIDTH - scaledWidth) / 2;
        int offsetY = (CANVAS_HEIGHT - scaledHeight) / 2;

        BufferedImage canvas = new BufferedImage(CANVAS_WIDTH, CANVAS_HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = canvas.createGraphics();
        try {
            graphics.setComposite(AlphaComposite.Src);
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(source, offsetX, offsetY, scaledWidth, scaledHeight, null);
        } finally {
            graphics.dispose();
        }
        return canvas;
    }

    private byte[] writePng(BufferedImage image) throws IOException {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, "png", output)) {
                throw invalidImage();
            }
            byte[] normalized = output.toByteArray();
            if (normalized.length > properties.getMaxOriginalImageSize()) {
                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "정규화된 원본 이미지가 10MB를 초과했습니다.");
            }
            return normalized;
        }
    }

    private BufferedImage applyExifOrientation(BufferedImage source, int orientation) {
        if (orientation == 1) {
            return source;
        }
        int width = source.getWidth();
        int height = source.getHeight();
        boolean swapped = orientation >= 5 && orientation <= 8;
        BufferedImage oriented = new BufferedImage(swapped ? height : width, swapped ? width : height,
                BufferedImage.TYPE_INT_ARGB);

        for (int y = 0; y < oriented.getHeight(); y++) {
            for (int x = 0; x < oriented.getWidth(); x++) {
                int sourceX;
                int sourceY;
                switch (orientation) {
                    case 2 -> { sourceX = width - 1 - x; sourceY = y; }
                    case 3 -> { sourceX = width - 1 - x; sourceY = height - 1 - y; }
                    case 4 -> { sourceX = x; sourceY = height - 1 - y; }
                    case 5 -> { sourceX = y; sourceY = x; }
                    case 6 -> { sourceX = y; sourceY = height - 1 - x; }
                    case 7 -> { sourceX = width - 1 - y; sourceY = height - 1 - x; }
                    case 8 -> { sourceX = width - 1 - y; sourceY = x; }
                    default -> { sourceX = x; sourceY = y; }
                }
                oriented.setRGB(x, y, source.getRGB(sourceX, sourceY));
            }
        }
        return oriented;
    }

    private int readJpegExifOrientation(byte[] bytes) {
        if (bytes.length < 4 || unsignedByte(bytes, 0) != 0xFF || unsignedByte(bytes, 1) != 0xD8) {
            return 1;
        }
        int offset = 2;
        while (offset + 4 <= bytes.length && unsignedByte(bytes, offset) == 0xFF) {
            int marker = unsignedByte(bytes, offset + 1);
            if (marker == 0xD9 || marker == 0xDA) {
                return 1;
            }
            int segmentLength = unsignedShortBigEndian(bytes, offset + 2);
            if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
                return 1;
            }
            if (marker == 0xE1) {
                int dataStart = offset + 4;
                if (segmentLength >= 10 && hasExifHeader(bytes, dataStart)) {
                    return readTiffOrientation(bytes, dataStart + 6, offset + 2 + segmentLength);
                }
            }
            offset += 2 + segmentLength;
        }
        return 1;
    }

    private boolean hasExifHeader(byte[] bytes, int offset) {
        return offset + 6 <= bytes.length
                && bytes[offset] == 'E' && bytes[offset + 1] == 'x' && bytes[offset + 2] == 'i'
                && bytes[offset + 3] == 'f' && bytes[offset + 4] == 0 && bytes[offset + 5] == 0;
    }

    private int readTiffOrientation(byte[] bytes, int tiffStart, int endExclusive) {
        if (tiffStart + 8 > endExclusive) {
            return 1;
        }
        boolean littleEndian;
        if (bytes[tiffStart] == 'I' && bytes[tiffStart + 1] == 'I') {
            littleEndian = true;
        } else if (bytes[tiffStart] == 'M' && bytes[tiffStart + 1] == 'M') {
            littleEndian = false;
        } else {
            return 1;
        }
        if (unsignedShort(bytes, tiffStart + 2, littleEndian) != 42) {
            return 1;
        }
        long ifdOffset = unsignedInt(bytes, tiffStart + 4, littleEndian);
        long entriesStartLong = tiffStart + ifdOffset;
        if (entriesStartLong < tiffStart || entriesStartLong + 2 > endExclusive || entriesStartLong > Integer.MAX_VALUE) {
            return 1;
        }
        int entriesStart = (int) entriesStartLong;
        int entryCount = unsignedShort(bytes, entriesStart, littleEndian);
        for (int index = 0; index < entryCount; index++) {
            int entryOffset = entriesStart + 2 + index * 12;
            if (entryOffset + 12 > endExclusive) {
                return 1;
            }
            if (unsignedShort(bytes, entryOffset, littleEndian) == 0x0112
                    && unsignedShort(bytes, entryOffset + 2, littleEndian) == 3
                    && unsignedInt(bytes, entryOffset + 4, littleEndian) == 1) {
                int orientation = unsignedShort(bytes, entryOffset + 8, littleEndian);
                return orientation >= 1 && orientation <= 8 ? orientation : 1;
            }
        }
        return 1;
    }

    private int unsignedByte(byte[] bytes, int offset) {
        return Byte.toUnsignedInt(bytes[offset]);
    }

    private int unsignedShortBigEndian(byte[] bytes, int offset) {
        return (unsignedByte(bytes, offset) << 8) | unsignedByte(bytes, offset + 1);
    }

    private int unsignedShort(byte[] bytes, int offset, boolean littleEndian) {
        return littleEndian
                ? unsignedByte(bytes, offset) | (unsignedByte(bytes, offset + 1) << 8)
                : unsignedShortBigEndian(bytes, offset);
    }

    private long unsignedInt(byte[] bytes, int offset, boolean littleEndian) {
        long first = unsignedByte(bytes, offset);
        long second = unsignedByte(bytes, offset + 1);
        long third = unsignedByte(bytes, offset + 2);
        long fourth = unsignedByte(bytes, offset + 3);
        return littleEndian
                ? first | (second << 8) | (third << 16) | (fourth << 24)
                : (first << 24) | (second << 16) | (third << 8) | fourth;
    }

    private ResponseStatusException invalidImage() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "손상되었거나 지원하지 않는 이미지입니다. PNG, JPEG, WebP 단일 프레임 이미지만 업로드할 수 있습니다.");
    }
}
