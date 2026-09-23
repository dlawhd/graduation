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
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.jar.Jar;
import shop.esjh.memoryjar.enums.ai.JarDraftDesignType;
import shop.esjh.memoryjar.enums.ai.JarDraftStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Jar를 만들기 전 사용자가 원본 이미지와 최종 후보를 고르는 작업 초안이다.
 * Draft는 AI 생성과 후보 선택의 공통 잠금 대상이므로, 서비스에서 잠금 조회 후 상태를 바꾼다.
 */
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Entity
@EntityListeners(AuditingEntityListener.class)
@Table(name = "jar_design_drafts")
public class JarDesignDraft {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "draft_id")
    private Long draftId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "original_s3_key", nullable = false, length = 512)
    private String originalS3Key;

    @Column(name = "original_s3_deleted_at")
    private LocalDateTime originalS3DeletedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "selected_design_type", length = 20)
    private JarDraftDesignType selectedDesignType;

    /* 복합 FK의 같은 Draft 보장은 DB가, 성공 후보 여부는 서비스가 확인한다. */
    @Column(name = "selected_generation_id")
    private Long selectedGenerationId;

    /** 선택 이미지 위에서 사용자가 그린 배경 제거 외곽선의 JSON이다. */
    @Column(name = "cutout_path_json", columnDefinition = "MEDIUMTEXT")
    private String cutoutPathJson;

    @Column(name = "slot_center_x", precision = 6, scale = 5)
    private BigDecimal slotCenterX;

    @Column(name = "slot_center_y", precision = 6, scale = 5)
    private BigDecimal slotCenterY;

    @Column(name = "slot_size_ratio", precision = 6, scale = 5)
    private BigDecimal slotSizeRatio;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private JarDraftStatus status;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "finalized_jar_id")
    private Jar finalizedJar;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Builder
    private JarDesignDraft(User owner, String originalS3Key, LocalDateTime expiresAt) {
        this.owner = owner;
        this.originalS3Key = originalS3Key;
        this.expiresAt = expiresAt;
        this.status = JarDraftStatus.ACTIVE;
    }

    /**
     * AI 후보를 현재 선택으로 기록하고, 이전 후보의 좌표가 새 이미지에 남지 않도록 Slot을 비운다.
     */
    public void selectAiGeneration(Long generationId) {
        this.selectedDesignType = JarDraftDesignType.AI;
        this.selectedGenerationId = generationId;
        clearSlot();
        clearCutout();
    }

    /** 원본 이미지를 현재 선택으로 기록하고, 기존 Slot을 비운다. */
    public void selectOriginal() {
        this.selectedDesignType = JarDraftDesignType.ORIGINAL;
        this.selectedGenerationId = null;
        clearSlot();
        clearCutout();
    }

    /**
     * 기존 기본 Jar 흐름으로 돌아갈 때 선택 후보와 Slot을 모두 제거한다.
     * DEFAULT는 커스텀 이미지가 아니므로 Slot을 남기면 안 된다.
     */
    public void selectDefault() {
        this.selectedDesignType = JarDraftDesignType.DEFAULT;
        this.selectedGenerationId = null;
        clearSlot();
        clearCutout();
    }

    /** ORIGINAL 또는 AI 이미지 위에 표시할 Slot의 정규화된 위치와 크기를 저장한다. */
    public void updateSlot(BigDecimal centerX, BigDecimal centerY, BigDecimal sizeRatio) {
        this.slotCenterX = centerX;
        this.slotCenterY = centerY;
        this.slotSizeRatio = sizeRatio;
    }

    /** 현재 선택 이미지에 적용할 배경 제거 외곽선을 저장하거나 비운다. */
    public void updateCutoutPathJson(String cutoutPathJson) {
        this.cutoutPathJson = cutoutPathJson;
    }

    /** 의미 있는 사용자 편집이 끝났을 때만 Draft의 유효 기간을 새로 계산한다. */
    public void extendExpiration(LocalDateTime expiresAt) {
        this.expiresAt = expiresAt;
    }

    private void clearSlot() {
        this.slotCenterX = null;
        this.slotCenterY = null;
        this.slotSizeRatio = null;
    }

    private void clearCutout() {
        this.cutoutPathJson = null;
    }

    public boolean isOwner(Long userId) {
        return owner != null && owner.getId().equals(userId);
    }

    public boolean isActiveAndNotExpired(LocalDateTime now) {
        return status == JarDraftStatus.ACTIVE && expiresAt.isAfter(now);
    }

    public boolean hasCustomDesignSelection() {
        return selectedDesignType == JarDraftDesignType.ORIGINAL
                || selectedDesignType == JarDraftDesignType.AI;
    }

    /** 만료 시각이 지난 ACTIVE Draft를 종료한다. PROCESSING 존재 여부 검사는 Service가 먼저 한다. */
    public void markExpired() {
        if (status != JarDraftStatus.ACTIVE) {
            throw new IllegalStateException("ACTIVE 상태의 Draft만 만료 처리할 수 있습니다.");
        }
        this.status = JarDraftStatus.EXPIRED;
    }

    /** 종료 Draft 원본을 실제로 삭제한 뒤에만 DB에 삭제 시각을 남긴다. */
    public void markOriginalS3Deleted(LocalDateTime deletedAt) {
        if (!isTerminal()) {
            throw new IllegalStateException("종료된 Draft 원본만 S3 삭제 완료 처리할 수 있습니다.");
        }
        if (originalS3DeletedAt != null) {
            throw new IllegalStateException("이미 원본 S3 삭제 완료 처리된 Draft입니다.");
        }
        this.originalS3DeletedAt = deletedAt;
    }

    /** Jar와 필요한 JarDesign을 같은 트랜잭션으로 만든 뒤 Draft를 더 이상 수정하지 못하게 종료한다. */
    public void markFinalized(Jar jar) {
        if (status != JarDraftStatus.ACTIVE || selectedDesignType == null || jar == null) {
            throw new IllegalStateException("활성 상태이며 최종 디자인이 선택된 Draft만 최종화할 수 있습니다.");
        }
        this.status = JarDraftStatus.FINALIZED;
        this.finalizedJar = jar;
    }

    public boolean isTerminal() {
        return status == JarDraftStatus.FINALIZED
                || status == JarDraftStatus.ABANDONED
                || status == JarDraftStatus.EXPIRED;
    }
}
