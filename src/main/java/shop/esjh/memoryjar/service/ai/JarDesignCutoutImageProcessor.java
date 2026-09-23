package shop.esjh.memoryjar.service.ai;

import org.springframework.stereotype.Component;
import shop.esjh.memoryjar.dto.ai.JarDesignCutoutPoint;

import javax.imageio.ImageIO;
import java.awt.AlphaComposite;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Area;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

/**
 * 선택 외곽선 안쪽만 남기고 바깥을 투명하게 만든 최종 PNG를 생성한다.
 * 원본·AI 후보 파일은 수정하지 않아 사용자가 다른 선택으로 돌아갈 수 있다.
 */
@Component
public class JarDesignCutoutImageProcessor {

    public byte[] applyTransparentCutout(byte[] sourceBytes, List<JarDesignCutoutPoint> points) throws IOException {
        return applyTransparentCutoutRegions(sourceBytes, List.of(points));
    }

    /** 서로 떨어진 여러 선택 영역의 합집합만 남긴 투명 PNG를 만든다. */
    public byte[] applyTransparentCutoutRegions(byte[] sourceBytes,
                                                List<List<JarDesignCutoutPoint>> regions) throws IOException {
        BufferedImage source = ImageIO.read(new ByteArrayInputStream(sourceBytes));
        if (source == null) {
            throw new IOException("최종 이미지 원본을 읽을 수 없습니다.");
        }

        BufferedImage result = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = result.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setComposite(AlphaComposite.Src);
            graphics.clip(toArea(regions, source.getWidth(), source.getHeight()));
            graphics.drawImage(source, 0, 0, null);
        } finally {
            graphics.dispose();
        }

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (!ImageIO.write(result, "png", output)) {
            throw new IOException("PNG 인코더를 찾을 수 없습니다.");
        }
        return output.toByteArray();
    }

    private Area toArea(List<List<JarDesignCutoutPoint>> regions, int width, int height) {
        Area combined = new Area();
        for (List<JarDesignCutoutPoint> points : regions) {
            Path2D.Double path = new Path2D.Double();
            JarDesignCutoutPoint first = points.get(0);
            path.moveTo(first.x().doubleValue() * width, first.y().doubleValue() * height);
            for (int index = 1; index < points.size(); index++) {
                JarDesignCutoutPoint point = points.get(index);
                path.lineTo(point.x().doubleValue() * width, point.y().doubleValue() * height);
            }
            path.closePath();
            // 그린 방향과 겹침 여부에 관계없이 모든 선택 영역을 합집합으로 남긴다.
            combined.add(new Area(path));
        }
        return combined;
    }
}
