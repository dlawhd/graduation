package shop.esjh.memoryjar.service;

import com.yubico.webauthn.*;
import com.yubico.webauthn.data.*;
import com.yubico.webauthn.exception.AssertionFailedException;
import com.yubico.webauthn.exception.RegistrationFailedException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.auth.TokenCrypto;
import shop.esjh.memoryjar.config.properties.SupportProperties;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.repository.OperatorPasskeyRepository;
import shop.esjh.memoryjar.repository.UserRepository;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** 구글 로그인으로 확인한 운영자에게만 패스키 챌린지를 열고, 서명 검증 후 새 세션을 만든다. */
@Service
public class OperatorPasskeyService {
    private static final String KEY = OperatorPasskeyService.class.getName();
    private static final SecureRandom RANDOM = new SecureRandom();
    private final OperatorPasskeyRepository credentials;
    private final SupportProperties support;
    private final UserRepository users;
    private final RefreshTokenService refresh;
    private final RelyingParty relyingParty;
    private final long setupUserId;
    private final String setupHash;

    public OperatorPasskeyService(OperatorPasskeyRepository credentials, SupportProperties support, UserRepository users,
                                  RefreshTokenService refresh, @Value("${app.frontend-url}") String frontend,
                                  @Value("${app.operator-passkey.setup-user-id:0}") long setupUserId,
                                  @Value("${app.operator-passkey.setup-sha256:}") String setupHash) {
        this.credentials = credentials;
        this.support = support;
        this.users = users;
        this.refresh = refresh;
        this.setupUserId = setupUserId;
        this.setupHash = setupHash;
        URI uri = URI.create(frontend);
        String host = uri.getHost();
        if (host == null || !("https".equals(uri.getScheme())
                || ("http".equals(uri.getScheme()) && "localhost".equals(host)))) {
            throw new IllegalArgumentException("패스키는 HTTPS 또는 localhost 프론트 주소가 필요합니다.");
        }
        String origin = uri.getScheme() + "://" + uri.getRawAuthority();
        this.relyingParty = RelyingParty.builder()
                .identity(RelyingPartyIdentity.builder().id(host).name("Memory Jar").build())
                .credentialRepository(credentials).origins(Set.of(origin)).build();
    }

    public boolean isRequired(long userId) { return support.getOperatorUserIds().contains(userId); }

    /** Spring의 OAuth 로그인 결과와 패스키 완료를 분리하고 이 브라우저 세션에만 확인을 연결한다. */
    public void begin(HttpServletRequest request, User user) {
        request.getSession(true).setAttribute(KEY,
                new Pending(user.getId(), user.getSessionVersion(), Instant.now().plusSeconds(300),
                        new AtomicReference<>(), new AtomicBoolean()));
    }

    public boolean requiresEnrollment(HttpServletRequest request) {
        return !credentials.exists(pending(request).userId());
    }

    /** 첫 공개 키 등록에는 구글 로그인과 계정별 운영 환경의 등록 코드가 모두 필요하다. */
    public String options(HttpServletRequest request, String setupCode) throws IOException {
        Pending p = pending(request);
        String username = Long.toString(p.userId());
        if (credentials.exists(p.userId())) {
            var assertion = relyingParty.startAssertion(StartAssertionOptions.builder().username(username)
                    .userVerification(UserVerificationRequirement.REQUIRED).timeout(120_000L).build());
            p.challenge().set(new Challenge(assertion, Instant.now().plusSeconds(120)));
            return assertion.toCredentialsGetJson();
        }
        if (!setupAllowed(p.userId(), setupCode)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "운영자 패스키 등록 코드를 확인해 주세요.");
        }
        byte[] handle = new byte[32];
        RANDOM.nextBytes(handle);
        var registration = relyingParty.startRegistration(StartRegistrationOptions.builder()
                .user(UserIdentity.builder().name(username).displayName("Memory Jar 운영자").id(new ByteArray(handle)).build())
                .authenticatorSelection(AuthenticatorSelectionCriteria.builder()
                        .residentKey(ResidentKeyRequirement.REQUIRED)
                        .userVerification(UserVerificationRequirement.REQUIRED).build())
                .timeout(120_000L).build());
        p.challenge().set(new Challenge(registration, Instant.now().plusSeconds(120)));
        return registration.toCredentialsCreateJson();
    }

    /** 챌린지는 서명 검증 성공 여부와 무관하게 한 번만 소비한다. 갱신 토큰은 확인이 끝난 뒤에만 발급한다. */
    @Transactional
    public Verified finish(HttpServletRequest request, String credentialJson) {
        Pending p = pending(request);
        Challenge challenge = p.challenge().getAndSet(null);
        if (challenge == null || !challenge.expiresAt().isAfter(Instant.now())) throw rejected();
        User user = users.findByIdForUpdate(p.userId()).orElseThrow(OperatorPasskeyService::rejected);
        if (users.findSessionVersionByIdForUpdate(p.userId()).orElse(-1L) != p.version()) throw rejected();
        try {
            if (challenge.options() instanceof PublicKeyCredentialCreationOptions registration) {
                if (credentials.exists(p.userId())) throw rejected();
                var result = relyingParty.finishRegistration(FinishRegistrationOptions.builder().request(registration)
                        .response(PublicKeyCredential.parseRegistrationResponseJson(credentialJson)).build());
                if (!result.isUserVerified() || result.getKeyId().getId().getBase64Url().length() > 1400
                        || result.getPublicKeyCose().getBytes().length > 4096) throw rejected();
                credentials.insert(p.userId(), result.getKeyId().getId(), registration.getUser().getId(),
                        result.getPublicKeyCose(), result.getSignatureCount());
                return null; // 등록 직후에도 별도 서명으로 실제 로그인 권한을 확인한다.
            }
            var result = relyingParty.finishAssertion(FinishAssertionOptions.builder().request((AssertionRequest) challenge.options())
                    .response(PublicKeyCredential.parseAssertionResponseJson(credentialJson)).build());
            if (!result.isSuccess() || !result.isUserVerified() || !Long.toString(p.userId()).equals(result.getUsername())) {
                throw rejected();
            }
            long previous = result.getCredential().getSignatureCount();
            if (previous != result.getSignatureCount()
                    && !credentials.updateCounter(p.userId(), result.getCredentialId(), previous, result.getSignatureCount())) {
                throw rejected();
            }
            // 여러 탭이 서로 다른 챌린지로 확인해도 한 번의 구글 로그인에서 세션을 하나만 만든다.
            if (!p.used().compareAndSet(false, true)) throw rejected();
            return new Verified(user, refresh.issueAfterOperatorPasskey(user));
        } catch (IOException | AssertionFailedException | RegistrationFailedException | IllegalArgumentException invalid) {
            throw rejected();
        }
    }

    private Pending pending(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null && session.getAttribute(KEY) instanceof Pending p
                && p.expiresAt().isAfter(Instant.now()) && !p.used().get() && isRequired(p.userId())) return p;
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "구글 로그인부터 다시 시작해 주세요.");
    }

    private boolean setupAllowed(long userId, String code) {
        return userId == setupUserId && setupHash.matches("[a-f0-9]{64}") && code != null
                && code.matches("[A-Za-z0-9_-]{43}")
                && MessageDigest.isEqual(setupHash.getBytes(StandardCharsets.US_ASCII),
                TokenCrypto.sha256Hex(code).getBytes(StandardCharsets.US_ASCII));
    }

    private static ResponseStatusException rejected() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN, "패스키를 확인하지 못했어요. 다시 시도해 주세요.");
    }

    private record Challenge(Object options, Instant expiresAt) {}
    private record Pending(long userId, long version, Instant expiresAt, AtomicReference<Challenge> challenge,
                           AtomicBoolean used) {}
    public record Verified(User user, String refreshToken) {}
}
