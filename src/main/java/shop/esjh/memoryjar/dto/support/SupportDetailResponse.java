package shop.esjh.memoryjar.dto.support;

import java.util.List;

/** 상세 첫 화면의 문의·대화·첨부를 한 요청으로 제공해 인증과 왕복 요청의 반복을 줄인다. */
public record SupportDetailResponse(SupportInquiryResponse inquiry,SupportMessageResponse.MessagePage messages,
                                    List<SupportAttachmentResponse> attachments) { }
