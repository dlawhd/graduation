package shop.esjh.memoryjar.service.ai;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import shop.esjh.memoryjar.dto.ai.JarPhotoFrameValue;

/** 보존된 원본은 변경하지 않고 사용자가 고른 장면만 AI 입력 PNG로 만든다. 네트워크/DB 접근은 하지 않는다. */
public final class JarAiInputImageProcessor {
    private JarAiInputImageProcessor() { }

    /** 직사각 선택도 늘이지 않고 480 정사각형 안에 등비 배치한다. 배치가 없는 기존 Draft는 바이트 그대로다. */
    public static byte[] prepare(byte[] original, JarPhotoFrameValue frame) {
        if (frame == null) return original;
        frame.validate();
        try {
            BufferedImage input = ImageIO.read(new ByteArrayInputStream(original));
            if (input == null || input.getWidth() != 480 || input.getHeight() != 480)
                throw new IllegalArgumentException("정규화 원본이 필요합니다.");
            int x = (int) Math.floor(frame.x().doubleValue() * 480), y = (int) Math.floor(frame.y().doubleValue() * 480);
            int right = Math.min(480, (int) Math.ceil(frame.x().add(frame.width()).doubleValue() * 480));
            int bottom = Math.min(480, (int) Math.ceil(frame.y().add(frame.height()).doubleValue() * 480));
            int w = right - x, h = bottom - y;
            double scale = 480.0 / Math.max(w, h);
            int dw = Math.max(1, (int) Math.round(w * scale)), dh = Math.max(1, (int) Math.round(h * scale));
            BufferedImage output = new BufferedImage(480, 480, BufferedImage.TYPE_INT_RGB);
            var graphics = output.createGraphics();
            try {
                graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, 480, 480);
                graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                graphics.drawImage(input, (480-dw)/2, (480-dh)/2, (480+dw)/2, (480+dh)/2, x, y, right, bottom, null);
            } finally { graphics.dispose(); }
            var bytes = new ByteArrayOutputStream();
            if (!ImageIO.write(output, "png", bytes)) throw new IllegalStateException("PNG 인코딩 실패");
            return bytes.toByteArray();
        } catch (java.io.IOException exception) {
            throw new IllegalArgumentException("AI 입력 장면을 준비하지 못했습니다.", exception);
        }
    }
}
