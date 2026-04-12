package com.example.demo.service.jar;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

/*
 이 테스트 클래스는 JarOpenScheduler가
 "스케줄 메서드가 실행됐을 때 JarOpenService를 제대로 호출하는지"
 확인하는 역할을 해.
 */
@ExtendWith(MockitoExtension.class)
class JarOpenSchedulerTest {

    // 가짜 JarOpenService
    @Mock
    private JarOpenService jarOpenService;

    // 테스트 대상
    @InjectMocks
    private JarOpenScheduler jarOpenScheduler;

    @Test
    @DisplayName("스케줄러 실행 - JarOpenService.openDueJars()를 1번 호출한다")
    void openDueJars_callsServiceOnce() {
        // when
        jarOpenScheduler.openDueJars();

        // then
        verify(jarOpenService, times(1)).openDueJars();

        // 다른 이상한 호출은 없어야 더 깔끔해
        verifyNoMoreInteractions(jarOpenService);
    }
}