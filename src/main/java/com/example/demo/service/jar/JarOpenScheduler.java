package com.example.demo.service.jar;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/*
 * JarOpenScheduler 역할
 *
 * 이 클래스는 "열릴 시간이 지난 저금통"을 자동으로 열어주는 스케줄러다.
 *
 * 쉽게 말하면:
 * - 서버가 일정 시간마다 저금통들을 확인한다.
 * - openAt 시간이 지난 저금통이 있으면 JarOpenService에게 열어달라고 요청한다.
 * - 실제 오픈 기록 저장, WebSocket 이벤트 전송, 채팅 SYSTEM 메시지 저장은
 *   JarOpenService 안에서 처리된다.
 */
@Component
public class JarOpenScheduler {

    // 스케줄러가 실제로 저금통을 열었는지 확인하기 위한 로그 도구
    private static final Logger log = LoggerFactory.getLogger(JarOpenScheduler.class);

    // 저금통 오픈 처리 담당 서비스
    private final JarOpenService jarOpenService;

    public JarOpenScheduler(JarOpenService jarOpenService) {
        this.jarOpenService = jarOpenService;
    }

    /*
     * 열릴 시간이 지난 저금통을 자동으로 여는 작업
     *
     * fixedDelayString:
     * - 이전 작업이 끝난 뒤 몇 ms 후에 다시 실행할지 정한다.
     *
     * 기본값 5000:
     * - 5초마다 검사한다.
     * - 그래서 오픈 시간이 된 뒤 보통 0~5초 안에 화면에 반영된다.
     *
     * 나중에 설정 파일에서 바꾸고 싶으면
     * application.yml에 app.jar-open.scheduler-fixed-delay-ms 값을 넣으면 된다.
     */
    @Scheduled(fixedDelayString = "${app.jar-open.scheduler-fixed-delay-ms:5000}")
    public void openDueJars() {
        // 시간이 지난 저금통을 열고, 실제로 열린 개수를 받는다.
        int openedCount = jarOpenService.openDueJars();

        // 매 5초마다 로그가 너무 많이 찍히지 않도록,
        // 실제로 열린 저금통이 있을 때만 로그를 남긴다.
        if (openedCount > 0) {
            log.info("[JAR_OPEN_SCHEDULER] 열린 저금통 수 = {}", openedCount);
        }
    }
}