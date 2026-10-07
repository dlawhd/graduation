package shop.esjh.memoryjar.service.ai;

import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import shop.esjh.memoryjar.dto.ai.CustomJarBodyValue;
import shop.esjh.memoryjar.dto.ai.CustomJarBodyValue.Point;
import shop.esjh.memoryjar.entity.ai.CustomJarBodyConverter;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.*;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 직접 만든 틀의 입력 제한, 안전한 JSON 저장, 후보 변경 시 보존과 외부 호출 전 거절을 검증한다. */
class CustomJarBodyTest {
    static CustomJarBodyValue outline() { return new CustomJarBodyValue(List.of(new Point(.15,.15),new Point(.85,.15),new Point(.85,.85),new Point(.15,.85)),"#d7e9df"); }
    @Test void validOutlinePassesBeanValidationAndConverterRoundTrip() {
        var value=outline();
        try (var factory=Validation.buildDefaultValidatorFactory()) { assertThat(factory.getValidator().validate(value)).isEmpty(); }
        var converter=new CustomJarBodyConverter();var json=converter.convertToDatabaseColumn(value);
        assertThat(json).doesNotContain("usableOutline","script","path");
        assertThat(converter.convertToEntityAttribute(json)).isEqualTo(value);
        assertThat(converter.convertToEntityAttribute(null)).isNull();assertThat(converter.convertToDatabaseColumn(null)).isNull();
    }
    @Test void savedOutlineDoesNotChangeWhenCallerMutatesItsList() {
        var points=new java.util.ArrayList<>(outline().points());
        var value=new CustomJarBodyValue(points,outline().color());
        points.clear();
        assertThat(value).isEqualTo(outline());
        assertThatThrownBy(()->value.points().clear()).isInstanceOf(UnsupportedOperationException.class);
    }
    @Test void invalidCoordinatesColorsCrossingAndTinyShapesAreRejected() {
        var crossing=new CustomJarBodyValue(List.of(new Point(.1,.1),new Point(.9,.9),new Point(.1,.9),new Point(.9,.1)),"#abcdef");
        for(var bad:List.of(crossing,new CustomJarBodyValue(List.of(new Point(Double.NaN,.1),new Point(.8,.1),new Point(.5,.8)),"#abcdef"),
                new CustomJarBodyValue(List.of(new Point(.1,.1),new Point(.2,.1),new Point(.1,.2)),"#abcdef"),new CustomJarBodyValue(outline().points(),"url(script)")))
            assertThatThrownBy(()->CustomJarBodyValue.validateFor(JarBodyStyle.CUSTOM,bad)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(()->CustomJarBodyValue.validateFor(JarBodyStyle.CUSTOM,null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThatThrownBy(()->CustomJarBodyValue.validateFor(JarBodyStyle.CAT,outline())).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        CustomJarBodyValue.validateFor(null,null);CustomJarBodyValue.validateFor(JarBodyStyle.CAT,null);
    }
    @Test void bodySurvivesOriginalAndAiSelectionAndImageOnlySwitch() {
        var draft=JarDesignDraft.builder().bodyStyle(JarBodyStyle.CUSTOM).build();draft.setCustomBody(outline());
        draft.selectOriginal();draft.selectAiGeneration(1L);draft.updateComposition(null,null);
        assertThat(draft.getCustomBody()).isEqualTo(outline());
        draft.updateComposition(JarBodyStyle.CUSTOM,null);assertThat(draft.getCustomBody()).isEqualTo(outline());
    }
    @Test void invalidBodyStopsBeforeDatabaseModerationOrS3Calls() {
        var users=mock(shop.esjh.memoryjar.repository.UserRepository.class);var validator=mock(DraftOriginalImageValidator.class);
        var moderation=mock(DraftOriginalImageModerationService.class);var s3=mock(software.amazon.awssdk.services.s3.S3Client.class);
        var persistence=mock(JarDesignDraftPersistenceService.class);
        var upload=new JarDesignDraftUploadService(users,validator,moderation,s3,new shop.esjh.memoryjar.config.properties.S3Properties(),persistence);
        assertThatThrownBy(()->upload.uploadOriginalAndCreateDraft(1L,null,JarBodyStyle.CUSTOM,null)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verifyNoInteractions(users,validator,moderation,s3,persistence);
    }
}
