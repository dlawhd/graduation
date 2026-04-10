package com.example.demo.entity.converter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.ArrayList;
import java.util.List;

// List<String> 형태의 태그를
// DB에는 JSON 문자열(TEXT)로 저장하고,
// 다시 꺼낼 때는 List<String>으로 바꿔주는 변환기
@Converter
public class StringListJsonConverter implements AttributeConverter<List<String>, String> {

    // JSON 문자열로 바꾸고 다시 읽을 때 사용하는 도구
    private static final ObjectMapper objectMapper = new ObjectMapper();

    // List<String> 전용 타입 정보
    private static final TypeReference<List<String>> LIST_TYPE = new TypeReference<>() {};

    // 자바의 List<String> -> DB의 TEXT(JSON 문자열)
    @Override
    public String convertToDatabaseColumn(List<String> attribute) {
        try {
            if (attribute == null || attribute.isEmpty()) {
                return "[]";
            }
            return objectMapper.writeValueAsString(attribute);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("tags_json 저장 중 JSON 변환에 실패했어.", e);
        }
    }

    // DB의 TEXT(JSON 문자열) -> 자바의 List<String>
    @Override
    public List<String> convertToEntityAttribute(String dbData) {
        try {
            if (dbData == null || dbData.isBlank()) {
                return new ArrayList<>();
            }
            return objectMapper.readValue(dbData, LIST_TYPE);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("tags_json 조회 중 JSON 읽기에 실패했어.", e);
        }
    }
}