package shop.esjh.memoryjar.service.mail;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.SesProperties;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.services.sesv2.SesV2Client;
import software.amazon.awssdk.services.sesv2.model.Body;
import software.amazon.awssdk.services.sesv2.model.Content;
import software.amazon.awssdk.services.sesv2.model.Destination;
import software.amazon.awssdk.services.sesv2.model.EmailContent;
import software.amazon.awssdk.services.sesv2.model.Message;
import software.amazon.awssdk.services.sesv2.model.SendEmailRequest;
import software.amazon.awssdk.services.sesv2.model.SendEmailResponse;
import software.amazon.awssdk.services.sesv2.model.SesV2Exception;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/*
 * SesEmailSenderService 역할
 *
 * EmailSenderService의 실제 AWS SES 구현체야.
 *
 *
 * 흐름:
 *
 * Memory Jar
 *      ↓
 * SesEmailSenderService
 *      ↓
 * AWS SES
 *      ↓
 * NAVER / Gmail / Daum 등의 사용자 메일함
 *
 *
 * 중요한 보안 규칙:
 *
 * 인증번호를 로그에 남기지 않는다.
 *
 * 예:
 *
 * log.info("인증번호 = {}", verificationCode);
 *
 * 같은 코드는 절대로 사용하지 않는다.
 */
@Slf4j
@Service
public class SesEmailSenderService
        implements EmailSenderService {

    private static final String CHARSET =
            StandardCharsets.UTF_8.name();

    /*
     * 메일에 표시할 만료시간 형식
     *
     * 예:
     *
     * 2026-08-26 16:30
     */
    private static final DateTimeFormatter
            EXPIRES_AT_FORMATTER =
            DateTimeFormatter.ofPattern(
                    "yyyy-MM-dd HH:mm"
            );


    private final SesV2Client sesV2Client;
    private final SesProperties sesProperties;


    public SesEmailSenderService(
            SesV2Client sesV2Client,
            SesProperties sesProperties
    ) {

        this.sesV2Client =
                sesV2Client;

        this.sesProperties =
                sesProperties;
    }


    /*
     * 회원가입용 인증번호 이메일을 발송한다.
     */
    @Override
    public void sendSignupVerificationCode(
            String toEmail,
            String verificationCode,
            LocalDateTime expiresAt
    ) {

        /*
         * 발신 이메일 환경변수를 빼먹은 상태로
         * AWS 요청을 보내지 않도록 먼저 검사한다.
         */
        validateConfiguration();


        /*
         * 메일 제목
         */
        String subject =
                "[Memory Jar] 이메일 인증번호를 확인해 주세요";


        /*
         * HTML을 지원하지 않는 메일 클라이언트를 위한
         * 일반 텍스트 본문
         */
        String textBody =
                createTextBody(
                        verificationCode,
                        expiresAt
                );


        /*
         * 일반적인 메일 클라이언트에서 보여줄
         * HTML 본문
         */
        String htmlBody =
                createHtmlBody(
                        verificationCode,
                        expiresAt
                );


        /*
         * 받을 사람
         */
        Destination destination =
                Destination.builder()
                        .toAddresses(
                                toEmail
                        )
                        .build();


        /*
         * 제목
         */
        Content subjectContent =
                Content.builder()
                        .charset(
                                CHARSET
                        )
                        .data(
                                subject
                        )
                        .build();


        /*
         * HTML 본문
         */
        Content htmlContent =
                Content.builder()
                        .charset(
                                CHARSET
                        )
                        .data(
                                htmlBody
                        )
                        .build();


        /*
         * 일반 텍스트 본문
         */
        Content textContent =
                Content.builder()
                        .charset(
                                CHARSET
                        )
                        .data(
                                textBody
                        )
                        .build();


        Body body =
                Body.builder()
                        .html(
                                htmlContent
                        )
                        .text(
                                textContent
                        )
                        .build();


        Message message =
                Message.builder()
                        .subject(
                                subjectContent
                        )
                        .body(
                                body
                        )
                        .build();


        EmailContent emailContent =
                EmailContent.builder()
                        .simple(
                                message
                        )
                        .build();


        /*
         * Amazon SES에 보낼 최종 요청
         */
        SendEmailRequest request =
                SendEmailRequest.builder()

                        /*
                         * SES에서 인증한 발신 이메일
                         */
                        .fromEmailAddress(
                                sesProperties
                                        .getFromEmail()
                        )

                        /*
                         * 수신자
                         */
                        .destination(
                                destination
                        )

                        /*
                         * 제목 + 본문
                         */
                        .content(
                                emailContent
                        )

                        .build();


        try {

            /*
             * 실제 AWS SES 호출
             */
            SendEmailResponse response =
                    sesV2Client.sendEmail(
                            request
                    );


            /*
             * 인증번호나 사용자 이메일은 로그에 남기지 않는다.
             *
             * AWS가 반환한 messageId 정도만 기록한다.
             */
            log.info(
                    "SES 회원가입 인증메일 발송 완료. messageId={}",
                    response.messageId()
            );

        } catch (
                SesV2Exception
                | SdkClientException ex
        ) {

            /*
             * AWS 인증 문제,
             * SES Sandbox 문제,
             * 발신자 미인증,
             * 네트워크 문제 등이 여기에 들어올 수 있다.
             */
            log.error(
                    "SES 회원가입 인증메일 발송 실패.",
                    ex
            );

            /*
             * 우리가 잘못 처리한 요청이라기보다는
             * 외부 이메일 서비스 호출이 실패한 것이므로
             * 502 Bad Gateway로 처리한다.
             */
            throw new ResponseStatusException(
                    HttpStatus.BAD_GATEWAY,
                    "인증 이메일 발송에 실패했어요. 잠시 후 다시 시도해 주세요.",
                    ex
            );
        }
    }


    /*
     * SES 발신 이메일 설정이 있는지 확인한다.
     */
    private void validateConfiguration() {

        if (!StringUtils.hasText(
                sesProperties.getFromEmail()
        )) {

            throw new IllegalStateException(
                    "APP_SES_FROM_EMAIL 설정이 필요합니다."
            );
        }
    }


    /*
     * HTML을 지원하지 않는 메일 프로그램을 위한
     * 일반 텍스트 본문
     */
    private String createTextBody(
            String verificationCode,
            LocalDateTime expiresAt
    ) {

        return """
                Memory Jar 이메일 인증

                Memory Jar 본인 확인을 위한 인증번호입니다.

                인증번호: %s

                인증번호는 5분 동안 사용할 수 있어요.
                만료 예정: %s

                본인이 요청하지 않았다면 이 메일을 무시해 주세요.

                Memory Jar
                """
                .formatted(
                        verificationCode,
                        expiresAt.format(
                                EXPIRES_AT_FORMATTER
                        )
                );
    }


    /*
     * Memory Jar 분위기에 맞춘 HTML 이메일 본문
     */
    private String createHtmlBody(
            String verificationCode,
            LocalDateTime expiresAt
    ) {

        return """
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                    <meta charset="UTF-8">
                </head>

                <body style="
                    margin: 0;
                    padding: 0;
                    background-color: #f7faf9;
                    font-family: Arial, 'Apple SD Gothic Neo', sans-serif;
                ">

                    <div style="
                        max-width: 520px;
                        margin: 40px auto;
                        padding: 36px;
                        background-color: #ffffff;
                        border-radius: 24px;
                        box-shadow: 0 8px 28px rgba(0,0,0,0.06);
                    ">

                        <div style="
                            font-size: 24px;
                            font-weight: 700;
                            margin-bottom: 8px;
                        ">
                            Memory Jar
                        </div>

                        <div style="
                            font-size: 16px;
                            color: #555555;
                            margin-bottom: 32px;
                        ">
                            Memory Jar 본인 확인을 위한 이메일 인증이에요.
                        </div>

                        <div style="
                            font-size: 14px;
                            color: #777777;
                            margin-bottom: 10px;
                        ">
                            인증번호
                        </div>

                        <div style="
                            padding: 20px;
                            border-radius: 16px;
                            background-color: #eefbf8;
                            text-align: center;
                            font-size: 34px;
                            font-weight: 700;
                            letter-spacing: 8px;
                        ">
                            %s
                        </div>

                        <div style="
                            margin-top: 24px;
                            font-size: 14px;
                            line-height: 1.7;
                            color: #666666;
                        ">
                            인증번호는 <strong>5분 동안</strong> 사용할 수 있어요.<br>
                            만료 예정: %s
                        </div>

                        <div style="
                            margin-top: 32px;
                            padding-top: 20px;
                            border-top: 1px solid #eeeeee;
                            font-size: 12px;
                            line-height: 1.7;
                            color: #999999;
                        ">
                            본인이 요청하지 않은 인증메일이라면
                            별도의 조치 없이 이 메일을 무시해 주세요.
                        </div>

                    </div>

                </body>
                </html>
                """
                .formatted(
                        verificationCode,
                        expiresAt.format(
                                EXPIRES_AT_FORMATTER
                        )
                );
    }
}