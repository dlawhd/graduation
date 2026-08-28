package shop.esjh.memoryjar.service.mail;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import shop.esjh.memoryjar.config.properties.SesProperties;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;
import software.amazon.awssdk.services.sesv2.model.SendEmailResponse;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/*
 * SesEmailSenderServiceTest 역할
 *
 * 실제 AWS에 메일을 보내지는 않고,
 * 우리가 SesV2Client에 정확한 이메일 요청을
 * 전달하는지 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class SesEmailSenderServiceTest {

    @Mock
    private SesV2Client sesV2Client;


    @Test
    @DisplayName("회원가입 인증번호를 AWS SES 요청으로 생성해 발송한다")
    void sendSignupVerificationCode_sendsSesRequest() {

        // given

        SesProperties properties =
                new SesProperties();

        properties.setRegion(
                "ap-northeast-2"
        );

        properties.setFromEmail(
                "no-reply@esjh.shop"
        );


        SesEmailSenderService service =
                new SesEmailSenderService(
                        sesV2Client,
                        properties
                );


        when(
                sesV2Client.sendEmail(
                        any(
                                SendEmailRequest.class
                        )
                )
        ).thenReturn(
                SendEmailResponse.builder()
                        .messageId(
                                "test-message-id"
                        )
                        .build()
        );


        // when

        service.sendSignupVerificationCode(
                "eunseo@naver.com",
                "482193",
                LocalDateTime.of(
                        2026,
                        8,
                        26,
                        16,
                        30
                )
        );


        // then

        ArgumentCaptor<SendEmailRequest> captor =
                ArgumentCaptor.forClass(
                        SendEmailRequest.class
                );


        verify(
                sesV2Client
        ).sendEmail(
                captor.capture()
        );


        SendEmailRequest request =
                captor.getValue();


        /*
         * 발신 이메일 확인
         */
        assertThat(
                request.fromEmailAddress()
        ).isEqualTo(
                "no-reply@esjh.shop"
        );


        /*
         * 받는 이메일 확인
         */
        assertThat(
                request
                        .destination()
                        .toAddresses()
        ).containsExactly(
                "eunseo@naver.com"
        );


        /*
         * 제목 확인
         */
        assertThat(
                request
                        .content()
                        .simple()
                        .subject()
                        .data()
        ).contains(
                "Memory Jar"
        );


        /*
         * HTML 본문에 실제 인증번호가 들어가는지 확인
         *
         * 이메일에는 인증번호가 있어야 한다.
         *
         * 단 DB/로그/API 응답에는 노출하지 않는다.
         */
        assertThat(
                request
                        .content()
                        .simple()
                        .body()
                        .html()
                        .data()
        ).contains(
                "482193"
        );


        /*
         * 텍스트 본문도 함께 제공한다.
         */
        assertThat(
                request
                        .content()
                        .simple()
                        .body()
                        .text()
                        .data()
        ).contains(
                "482193"
        );
    }
}