package shop.esjh.memoryjar.service.ai;

import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 검증된 Cloudflare PIXEL 후보를 PIXEL_PP_V1 규칙의 480×480 PNG로 변환한다.
 *
 * <p>원본 AI 응답의 형식·크기 검사는 {@link GeneratedAiImageValidator}가 먼저 담당한다.
 * 이 클래스는 그 다음 단계에서만 쓰이며, 흰 배경 합성, 64×64 bilinear 축소,
 * 최대 24색 median-cut 팔레트, nearest-neighbor 확대를 한 버전으로 고정한다.</p>
 */
@Component
public class PixelPostProcessor {

    public static final String POSTPROCESS_VERSION = "PIXEL_PP_V1";
    private static final int SOURCE_SIZE = 1024;
    private static final int SPRITE_SIZE = 64;
    private static final int PALETTE_SIZE = 24;
    private static final int OUTPUT_SIZE = 480;

    /**
     * 정규화된 1024×1024 PNG를 최종 PIXEL 후보 PNG로 변환한다.
     * 투명·반투명 픽셀은 흰 배경에 먼저 합성하여 palette에 투명 색을 별도로 만들지 않는다.
     */
    public byte[] postProcess(byte[] normalizedImageBytes) {
        BufferedImage source = decodeExpectedSource(normalizedImageBytes);
        BufferedImage opaqueSource = compositeOnWhite(source);
        BufferedImage small = resizeBilinear(opaqueSource, SPRITE_SIZE, SPRITE_SIZE);
        BufferedImage quantized = quantizeToPalette(small, PALETTE_SIZE);
        BufferedImage enlarged = resizeNearestNeighbor(quantized, OUTPUT_SIZE, OUTPUT_SIZE);
        return writePng(enlarged);
    }

    private BufferedImage decodeExpectedSource(byte[] imageBytes) {
        if (imageBytes == null || imageBytes.length == 0) {
            throw invalidImage("PIXEL 후처리할 이미지가 없습니다.");
        }

        try {
            BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(imageBytes));
            if (decoded == null) {
                throw invalidImage("PIXEL 후처리 이미지를 디코딩할 수 없습니다.");
            }
            if (decoded.getWidth() != SOURCE_SIZE || decoded.getHeight() != SOURCE_SIZE) {
                throw invalidImage("PIXEL 후처리 입력은 1024×1024여야 합니다.");
            }
            return decoded;
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof InvalidPixelPostprocessException invalidPixelPostprocessException) {
                throw invalidPixelPostprocessException;
            }
            throw invalidImage("PIXEL 후처리 이미지가 손상되었습니다.", exception);
        }
    }

    private BufferedImage compositeOnWhite(BufferedImage source) {
        BufferedImage opaque = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = opaque.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, opaque.getWidth(), opaque.getHeight());
            graphics.drawImage(source, 0, 0, null);
            return opaque;
        } finally {
            graphics.dispose();
        }
    }

    private BufferedImage resizeBilinear(BufferedImage source, int width, int height) {
        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = resized.createGraphics();
        try {
            // PoC의 작은 스프라이트 축소와 같은 bilinear 보간을 명시한다.
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.drawImage(source, 0, 0, width, height, null);
            return resized;
        } finally {
            graphics.dispose();
        }
    }

    private BufferedImage quantizeToPalette(BufferedImage source, int maxColors) {
        Map<Integer, Integer> frequencies = new HashMap<>();
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                int rgb = source.getRGB(x, y) & 0x00FFFFFF;
                frequencies.merge(rgb, 1, Integer::sum);
            }
        }

        List<ColorFrequency> colors = frequencies.entrySet().stream()
                .map(entry -> new ColorFrequency(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparingInt(ColorFrequency::rgb))
                .toList();
        List<Integer> palette = buildMedianCutPalette(colors, maxColors);
        Map<Integer, Integer> mappedColors = new HashMap<>();

        BufferedImage quantized = new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < source.getHeight(); y++) {
            for (int x = 0; x < source.getWidth(); x++) {
                int rgb = source.getRGB(x, y) & 0x00FFFFFF;
                int closest = mappedColors.computeIfAbsent(rgb, color -> nearestPaletteColor(color, palette));
                quantized.setRGB(x, y, 0xFF000000 | closest);
            }
        }
        return quantized;
    }

    private List<Integer> buildMedianCutPalette(List<ColorFrequency> colors, int maxColors) {
        List<ColorBox> boxes = new ArrayList<>();
        boxes.add(new ColorBox(colors));

        while (boxes.size() < maxColors) {
            ColorBox candidate = boxes.stream()
                    .filter(ColorBox::canSplit)
                    .max(Comparator.comparingInt(ColorBox::largestChannelRange)
                            .thenComparingInt(ColorBox::population)
                            .thenComparingInt(ColorBox::colorCount))
                    .orElse(null);
            if (candidate == null) {
                break;
            }

            List<ColorBox> split = candidate.splitAtWeightedMedian();
            boxes.remove(candidate);
            boxes.addAll(split);
        }

        return boxes.stream().map(ColorBox::weightedAverage).toList();
    }

    private int nearestPaletteColor(int sourceRgb, List<Integer> palette) {
        int red = red(sourceRgb);
        int green = green(sourceRgb);
        int blue = blue(sourceRgb);
        int closest = palette.get(0);
        long shortestDistance = Long.MAX_VALUE;
        for (int candidate : palette) {
            long redDifference = red - red(candidate);
            long greenDifference = green - green(candidate);
            long blueDifference = blue - blue(candidate);
            long distance = redDifference * redDifference
                    + greenDifference * greenDifference
                    + blueDifference * blueDifference;
            if (distance < shortestDistance || (distance == shortestDistance && candidate < closest)) {
                shortestDistance = distance;
                closest = candidate;
            }
        }
        return closest;
    }

    private BufferedImage resizeNearestNeighbor(BufferedImage source, int width, int height) {
        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = resized.createGraphics();
        try {
            // 64에서 480은 정수 배율이 아니므로, Graphics2D의 nearest-neighbor 좌표 규칙을 고정한다.
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
            graphics.drawImage(source, 0, 0, width, height, null);
            return resized;
        } finally {
            graphics.dispose();
        }
    }

    private byte[] writePng(BufferedImage image) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, "png", output)) {
                throw invalidImage("PIXEL 후보를 PNG로 인코딩할 수 없습니다.");
            }
            return output.toByteArray();
        } catch (IOException exception) {
            throw invalidImage("PIXEL 후보를 PNG로 인코딩할 수 없습니다.", exception);
        }
    }

    private InvalidPixelPostprocessException invalidImage(String message) {
        return new InvalidPixelPostprocessException(message);
    }

    private InvalidPixelPostprocessException invalidImage(String message, Throwable cause) {
        return new InvalidPixelPostprocessException(message, cause);
    }

    private static int red(int rgb) {
        return (rgb >>> 16) & 0xFF;
    }

    private static int green(int rgb) {
        return (rgb >>> 8) & 0xFF;
    }

    private static int blue(int rgb) {
        return rgb & 0xFF;
    }

    /** PIXEL 후보 후처리 실패를 Generation의 PIXEL_POSTPROCESS_FAILED로 기록하기 위한 예외다. */
    public static class InvalidPixelPostprocessException extends RuntimeException {
        public InvalidPixelPostprocessException(String message) {
            super(message);
        }

        public InvalidPixelPostprocessException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    private record ColorFrequency(int rgb, int count) {
        private int component(int channel) {
            return switch (channel) {
                case 0 -> red(rgb);
                case 1 -> green(rgb);
                case 2 -> blue(rgb);
                default -> throw new IllegalArgumentException("Unknown RGB channel: " + channel);
            };
        }
    }

    /** median-cut 한 칸의 색상 집합과 가중 평균 팔레트 색을 계산한다. */
    private static class ColorBox {
        private final List<ColorFrequency> colors;
        private final int[] minimum = {255, 255, 255};
        private final int[] maximum = {0, 0, 0};
        private final int population;

        private ColorBox(List<ColorFrequency> colors) {
            this.colors = List.copyOf(colors);
            int total = 0;
            for (ColorFrequency color : colors) {
                total += color.count();
                for (int channel = 0; channel < 3; channel++) {
                    int component = color.component(channel);
                    minimum[channel] = Math.min(minimum[channel], component);
                    maximum[channel] = Math.max(maximum[channel], component);
                }
            }
            this.population = total;
        }

        private boolean canSplit() {
            return colors.size() > 1 && largestChannelRange() > 0;
        }

        private int largestChannelRange() {
            return Math.max(maximum[0] - minimum[0], Math.max(maximum[1] - minimum[1], maximum[2] - minimum[2]));
        }

        private int population() {
            return population;
        }

        private int colorCount() {
            return colors.size();
        }

        private List<ColorBox> splitAtWeightedMedian() {
            int channel = widestChannel();
            List<ColorFrequency> sorted = new ArrayList<>(colors);
            sorted.sort(Comparator.comparingInt((ColorFrequency color) -> color.component(channel))
                    .thenComparingInt(ColorFrequency::rgb));

            int halfPopulation = (population + 1) / 2;
            int accumulated = 0;
            int splitIndex = 1;
            for (int index = 0; index < sorted.size() - 1; index++) {
                accumulated += sorted.get(index).count();
                if (accumulated >= halfPopulation) {
                    splitIndex = index + 1;
                    break;
                }
            }
            return List.of(new ColorBox(sorted.subList(0, splitIndex)),
                    new ColorBox(sorted.subList(splitIndex, sorted.size())));
        }

        private int widestChannel() {
            int channel = 0;
            for (int candidate = 1; candidate < 3; candidate++) {
                if (maximum[candidate] - minimum[candidate] > maximum[channel] - minimum[channel]) {
                    channel = candidate;
                }
            }
            return channel;
        }

        private int weightedAverage() {
            long redTotal = 0;
            long greenTotal = 0;
            long blueTotal = 0;
            for (ColorFrequency color : colors) {
                redTotal += (long) red(color.rgb()) * color.count();
                greenTotal += (long) green(color.rgb()) * color.count();
                blueTotal += (long) blue(color.rgb()) * color.count();
            }
            return ((int) Math.round((double) redTotal / population) << 16)
                    | ((int) Math.round((double) greenTotal / population) << 8)
                    | (int) Math.round((double) blueTotal / population);
        }
    }
}
