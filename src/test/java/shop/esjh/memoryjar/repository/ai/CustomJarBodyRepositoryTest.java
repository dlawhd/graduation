package shop.esjh.memoryjar.repository.ai;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import shop.esjh.memoryjar.config.JpaAuditConfig;
import shop.esjh.memoryjar.dto.ai.CustomJarBodyValue;
import shop.esjh.memoryjar.dto.ai.CustomJarBodyValue.Point;
import shop.esjh.memoryjar.entity.ai.*;
import shop.esjh.memoryjar.enums.ai.*;
import shop.esjh.memoryjar.repository.support.AbstractMariaDbRepositoryTest;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.List;
import static org.assertj.core.api.Assertions.*;

/** 실제 MariaDB에 틀을 저장한 뒤 JPA로 다시 읽어 Draft와 영구 Design의 JSON 변환을 검증한다. */
@DataJpaTest(showSql=false)
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.NONE)
@Import(JpaAuditConfig.class)
class CustomJarBodyRepositoryTest extends AbstractMariaDbRepositoryTest {
    @Test void draftAndPermanentDesignRestoreTheSameOutline() {
        var owner=saveUser("custom-body","custom-body@example.test","시험");
        var body=new CustomJarBodyValue(List.of(new Point(.1,.1),new Point(.9,.1),new Point(.9,.9),new Point(.1,.9)),"#abcdef");
        var draft=JarDesignDraft.builder().owner(owner).originalS3Key("fixture-original").bodyStyle(JarBodyStyle.CUSTOM).expiresAt(LocalDateTime.now().plusDays(1)).build();
        draft.setCustomBody(body);persist(draft);
        var jar=saveJar(owner,"틀 시험",LocalDateTime.now().plusDays(1));
        var design=persist(JarDesign.builder().jar(jar).designType(JarDesignType.ORIGINAL).finalS3Key("fixture-final").bodyStyle(JarBodyStyle.CUSTOM).customBody(body)
                .slotCenterX(new BigDecimal(".5")).slotCenterY(new BigDecimal(".3")).slotSizeRatio(new BigDecimal(".2")).build());
        var draftId=draft.getDraftId();var designId=design.getJarDesignId();flushAndClear();
        assertThat(entityManager.find(JarDesignDraft.class,draftId).getCustomBody()).isEqualTo(body);
        assertThat(entityManager.find(JarDesign.class,designId).getCustomBody()).isEqualTo(body);
    }
}
