package com.example.demo.entity.converter;

import com.example.demo.model.notification.NotificationPayload;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/*
 * 이 클래스는 NotificationPayload 객체를 DB에 저장 가능한 JSON 문자열로 바꾸고,
 * 반대로 JSON 문자열을 다시 NotificationPayload 객체로 바꿔주는 "번역기"
 */
@Converter
public class NotificationPayloadJsonConverter implements AttributeConverter<NotificationPayload, String> {

    /*
     * JSON 변환을 도와주는 도구
     *      */
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /*
     * 자바 객체 -> DB 문자열
     * 저장할 때 실행
     * NotificationPayload 객체를 JSON 문자열로 바꿔서 DB에 넣음
     */
    @Override
    public String convertToDatabaseColumn(NotificationPayload attribute) {

        // payload가 없으면 DB에도 null로 저장
        if (attribute == null) {
            return null;
        }

        try {
            return objectMapper.writeValueAsString(attribute);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("NotificationPayload를 JSON 문자열로 변환하지 못했어.", e);
        }
    }

    /*
     * DB 문자열 -> 자바 객체
     * 조회할 때 실행
     * DB에 저장된 JSON 문자열을 다시 NotificationPayload 객체로 바꿈
     */
    @Override
    public NotificationPayload convertToEntityAttribute(String dbData) {

        // DB 값이 비어 있으면 객체도 null
        if (dbData == null || dbData.isBlank()) {
            return null;
        }

        try {
            return objectMapper.readValue(dbData, NotificationPayload.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON 문자열을 NotificationPayload로 변환하지 못했어.", e);
        }
    }
}