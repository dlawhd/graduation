package shop.esjh.memoryjar.enums.ai;

/** 투입구의 시각적 모양이다. 기존 종류는 3.5:1 경계를 유지하며 V43 자유형만 정사각 도면을 쓴다. */
public enum JarSlotStyle {
    CAPSULE, RECTANGLE, OVAL, METAL, WOOD, PIXEL,
    BRASS, ROSE_GOLD, OBSIDIAN, PEARL, PORCELAIN, LEATHER,
    LEAF, BAMBOO, BLOSSOM, PAW, SHELL, RIPPLE,
    STARLIGHT, MOONLIGHT, AURORA, CRYSTAL, RIBBON, KEYHOLE,
    BLOSSOM_GATE, HEART_GATE, PAW_GATE, BUTTERFLY_GATE,
    LEAF_GATE, SHELL_GATE, DROP_GATE, CLOUD_GATE,
    STAR_GATE, MOON_GATE, CRYSTAL_GATE, PLANET_GATE,
    RIBBON_GATE, KEY_GATE, SUN_GATE, SNOWFLAKE_GATE;

    private static final java.math.BigDecimal LEGACY_ASPECT_RATIO = new java.math.BigDecimal("3.5");

    /** V43 자유형만 정사각 도면이다. V42까지의 저장 ID는 기존 3.5:1 경계를 그대로 유지한다. */
    public java.math.BigDecimal aspectRatio() {
        return switch (this) {
            case BLOSSOM_GATE, HEART_GATE, PAW_GATE, BUTTERFLY_GATE,
                 LEAF_GATE, SHELL_GATE, DROP_GATE, CLOUD_GATE,
                 STAR_GATE, MOON_GATE, CRYSTAL_GATE, PLANET_GATE,
                 RIBBON_GATE, KEY_GATE, SUN_GATE, SNOWFLAKE_GATE -> java.math.BigDecimal.ONE;
            default -> LEGACY_ASPECT_RATIO;
        };
    }

    /** 새 필드가 없는 기존 클라이언트·데이터는 원래 둥근 투입구를 유지한다. */
    public static JarSlotStyle orDefault(JarSlotStyle style) {
        return style == null ? CAPSULE : style;
    }
}
