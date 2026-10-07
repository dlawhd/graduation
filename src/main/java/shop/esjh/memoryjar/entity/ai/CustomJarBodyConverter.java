package shop.esjh.memoryjar.entity.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import shop.esjh.memoryjar.dto.ai.CustomJarBodyValue;

/** 틀의 숫자 좌표와 색상을 한 JSON 컬럼으로 보관한다. 임의 클래스/HTML을 역직렬화하지 않는다. */
@Converter
public class CustomJarBodyConverter implements AttributeConverter<CustomJarBodyValue, String> {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    @Override public String convertToDatabaseColumn(CustomJarBodyValue value) {
        if (value==null) return null;
        try { return MAPPER.writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new IllegalArgumentException("틀을 저장하지 못했습니다."); }
    }
    @Override public CustomJarBodyValue convertToEntityAttribute(String json) {
        if (json==null) return null;
        try { return MAPPER.readValue(json, CustomJarBodyValue.class); }
        catch (JsonProcessingException e) { throw new IllegalStateException("저장된 틀을 읽지 못했습니다."); }
    }
}
