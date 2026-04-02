package com.example.demo.service.jar;

import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.jar.JarOpenEvent;
import com.example.demo.enums.jar.JarOpenReason;
import com.example.demo.repository.jar.JarOpenEventRepository;
import com.example.demo.repository.jar.JarRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;

// 저금통 "오픈 처리"만 전담하는 서비스
@Service
public class JarOpenService {

    private final JarRepository jarRepository;
    private final JarOpenEventRepository jarOpenEventRepository;

    public JarOpenService(
            JarRepository jarRepository,
            JarOpenEventRepository jarOpenEventRepository
    ) {
        this.jarRepository = jarRepository;
        this.jarOpenEventRepository = jarOpenEventRepository;
    }

    // 이미 열렸는지 "기록" 기준으로 확인
    @Transactional(readOnly = true)
    public boolean isOpened(Long jarId) {
        return jarOpenEventRepository.existsByJar_JarId(jarId);
    }

    // 사용자가 조회했을 때 "열릴 시간이 이미 지났으면" 바로 기록까지 남겨서 열어줌
    // REQUIRES_NEW를 쓰는 이유:
    // 바깥 서비스가 readOnly여도 여기서는 진짜 저장이 가능해야 하기 때문
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean ensureOpenedIfDue(Long jarId) {
        return openIfDue(jarId, JarOpenReason.ACCESS_TRIGGERED);
    }

    // 스케줄러가 주기적으로 호출해서 열릴 것들을 미리 열어줌
    @Transactional
    public int openDueJars() {
        List<Jar> dueJars = jarRepository.findDueJarsWithoutOpenEvent(LocalDateTime.now());

        int openedCount = 0;
        for (Jar jar : dueJars) {
            if (openIfDue(jar.getJarId(), JarOpenReason.SCHEDULED)) {
                openedCount++;
            }
        }

        return openedCount;
    }

    private boolean openIfDue(Long jarId, JarOpenReason reason) {

        // 1. 이미 열렸으면 끝
        if (jarOpenEventRepository.existsByJar_JarId(jarId)) {
            return true;
        }

        // 2. 저금통 row 잠금 조회
        // 동시에 여러 요청이 와도 중복 오픈 기록이 생기지 않게 하려는 거야.
        Jar jar = jarRepository.findByJarIdForUpdate(jarId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "저금통을 찾을 수 없어."
                ));

        // 3. 잠금 잡은 뒤 한 번 더 확인
        if (jarOpenEventRepository.existsByJar_JarId(jarId)) {
            return true;
        }

        // 4. 아직 오픈 시간이 안 됐으면 false
        if (jar.getOpenAt().isAfter(LocalDateTime.now())) {
            return false;
        }

        // 5. 오픈 기록 저장
        // openedAt은 "실제 비즈니스 오픈 시점"인 openAt으로 남겨두는 게 좋아.
        // 스케줄러가 10초 늦게 돌아도, 저금통은 원래 약속한 시간에 열린 걸로 보는 거야.
        JarOpenEvent event = JarOpenEvent.create(
                jar,
                jar.getOpenAt(),
                reason
        );

        jarOpenEventRepository.save(event);
        return true;
    }
}