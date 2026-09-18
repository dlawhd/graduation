package shop.esjh.memoryjar.entity.ai;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.ai.JarDesignType;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 최종 생성된 Jar에 연결된 영구 커스텀 디자인이다. DEFAULT Jar는 이 Entity를 만들지 않는다.
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@EntityListeners(AuditingEntityListener.class)
@Table(name = "jar_designs")
public class JarDesign {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "jar_design_id")
    private Long jarDesignId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "jar_id", nullable = false, unique = true)
    private Jar jar;

    @Enumerated(EnumType.STRING)
    @Column(name = "design_type", nullable = false, length = 20)
    private JarDesignType designType;

    @Column(name = "final_s3_key", nullable = false, length = 512)
    private String finalS3Key;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "selected_generation_id", unique = true)
    private JarAiGeneration selectedGeneration;

    @Column(name = "slot_center_x", nullable = false, precision = 6, scale = 5)
    private BigDecimal slotCenterX;

    @Column(name = "slot_center_y", nullable = false, precision = 6, scale = 5)
    private BigDecimal slotCenterY;

    @Column(name = "slot_size_ratio", nullable = false, precision = 6, scale = 5)
    private BigDecimal slotSizeRatio;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private JarDesign(Jar jar, JarDesignType designType, String finalS3Key,
                      JarAiGeneration selectedGeneration, BigDecimal slotCenterX,
                      BigDecimal slotCenterY, BigDecimal slotSizeRatio) {
        this.jar = jar;
        this.designType = designType;
        this.finalS3Key = finalS3Key;
        this.selectedGeneration = selectedGeneration;
        this.slotCenterX = slotCenterX;
        this.slotCenterY = slotCenterY;
        this.slotSizeRatio = slotSizeRatio;
    }
}
