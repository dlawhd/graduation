package shop.esjh.memoryjar.repository.support;

import org.springframework.data.jpa.repository.JpaRepository;
import shop.esjh.memoryjar.entity.support.OperatorMfaCredential;

/** 운영자별 인증 앱 등록을 읽고 저장한다. 변경 시에는 먼저 사용자 행을 잠가 순서를 통일한다. */
public interface OperatorMfaCredentialRepository extends JpaRepository<OperatorMfaCredential, Long> {}
