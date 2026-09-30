package shop.esjh.memoryjar.enums.ai;

/** 투입구의 시각적 모양이다. 모든 모양은 기존 좌표·3.5:1 경계 안에서 그려진다. */
public enum JarSlotStyle {
    CAPSULE, RECTANGLE, OVAL, METAL, WOOD, PIXEL;

    /** 새 필드가 없는 기존 클라이언트·데이터는 원래 둥근 투입구를 유지한다. */
    public static JarSlotStyle orDefault(JarSlotStyle style) {
        return style == null ? CAPSULE : style;
    }
}
