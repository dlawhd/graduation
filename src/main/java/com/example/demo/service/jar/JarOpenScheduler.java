package com.example.demo.service.jar;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// 일정 시간마다 "열릴 시간이 지난 저금통"을 미리 열어주는 역할
@Component
public class JarOpenScheduler {

    private final JarOpenService jarOpenService;

    public JarOpenScheduler(JarOpenService jarOpenService) {
        this.jarOpenService = jarOpenService;
    }

    // 1분마다 검사
    @Scheduled(fixedDelay = 60_000)
    public void openDueJars() {
        jarOpenService.openDueJars();
    }
}