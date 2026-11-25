package shop.esjh.memoryjar.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.upokecenter.cbor.CBORObject;
import com.yubico.webauthn.data.ByteArray;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.auth.TokenCrypto;
import shop.esjh.memoryjar.config.properties.SupportProperties;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.repository.OperatorPasskeyRepository;
import shop.esjh.memoryjar.repository.UserRepository;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 실제 EC 키로 WebAuthn 등록 및 서명 확인을 재현해 로그인 토큰의 발급 경계를 점검한다. */
class OperatorPasskeyServiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final String origin = "https://www.esjh.shop";

    @Test
    void registrationAndVerifiedAssertionAreSeparateAndChallengeIsSingleUse() throws Exception {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID()
                + ";DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE operator_passkeys(user_id BIGINT PRIMARY KEY, credential_id VARCHAR(1400) UNIQUE, "
                + "user_handle VARBINARY(64) UNIQUE, public_key_cose VARBINARY(4096), signature_count BIGINT)");
        var credentials = new OperatorPasskeyRepository(jdbc);
        var config = new SupportProperties();
        config.setOperatorUserIds(Set.of(7L));
        var user = User.builder().id(7L).build();
        var users = mock(UserRepository.class);
        when(users.findByIdForUpdate(7L)).thenReturn(Optional.of(user));
        when(users.findSessionVersionByIdForUpdate(7L)).thenReturn(Optional.of(user.getSessionVersion()));
        var refresh = mock(RefreshTokenService.class);
        when(refresh.issueAfterOperatorPasskey(user)).thenReturn("test-refresh");
        String setup = TokenCrypto.generateRefreshRaw();
        var service = new OperatorPasskeyService(credentials, config, users, refresh, origin, 7L,
                TokenCrypto.sha256Hex(setup));
        var request = new MockHttpServletRequest();
        assertThrows(ResponseStatusException.class, () -> service.requiresEnrollment(request));
        service.begin(request, user);
        assertTrue(service.requiresEnrollment(request));
        assertThrows(ResponseStatusException.class, () -> service.options(request, null));

        var keyGenerator = KeyPairGenerator.getInstance("EC");
        keyGenerator.initialize(new ECGenParameterSpec("secp256r1"));
        var pair = keyGenerator.generateKeyPair();
        var publicKey = (ECPublicKey) pair.getPublic();
        CBORObject cose = CBORObject.NewMap();
        cose.Add(1, 2).Add(3, -7).Add(-1, 1).Add(-2, coordinate(publicKey.getW().getAffineX()))
                .Add(-3, coordinate(publicKey.getW().getAffineY()));
        byte[] id = hash("test-credential".getBytes(StandardCharsets.US_ASCII));
        var registration = json.readTree(service.options(request, setup)).path("publicKey");
        var keyData = new ByteArrayOutputStream();
        keyData.write(authenticatorData(0x45, 0));
        keyData.write(new byte[16]);
        keyData.write(ByteBuffer.allocate(2).putShort((short) id.length).array());
        keyData.write(id);
        keyData.write(cose.EncodeToBytes());
        CBORObject attestation = CBORObject.NewMap().Add("fmt", "none")
                .Add("attStmt", CBORObject.NewMap()).Add("authData", keyData.toByteArray());
        String registrationResponse = response(id, Map.of(
                "clientDataJSON", encode(clientData("webauthn.create", registration.path("challenge").asText())),
                "attestationObject", encode(attestation.EncodeToBytes())));
        assertNull(service.finish(request, registrationResponse));
        assertFalse(service.requiresEnrollment(request));
        verifyNoInteractions(refresh);

        var assertion = json.readTree(service.options(request, null)).path("publicKey");
        byte[] client = clientData("webauthn.get", assertion.path("challenge").asText());
        String unverified = assertionResponse(id, client, authenticatorData(0x01, 1), pair);
        assertThrows(ResponseStatusException.class, () -> service.finish(request, unverified));
        assertThrows(ResponseStatusException.class, () -> service.finish(request, unverified));
        verifyNoInteractions(refresh);

        assertion = json.readTree(service.options(request, null)).path("publicKey");
        client = clientData("webauthn.get", assertion.path("challenge").asText());
        String verified = assertionResponse(id, client, authenticatorData(0x05, 1), pair);
        assertEquals("test-refresh", service.finish(request, verified).refreshToken());
        assertEquals(1, credentials.lookupAll(new ByteArray(id)).iterator().next().getSignatureCount());
        assertThrows(ResponseStatusException.class, () -> service.finish(request, verified));
        verify(refresh, times(1)).issueAfterOperatorPasskey(user);
    }

    private String assertionResponse(byte[] id, byte[] client, byte[] auth, java.security.KeyPair key) throws Exception {
        var signature = Signature.getInstance("SHA256withECDSA");
        signature.initSign(key.getPrivate());
        signature.update(auth);
        signature.update(hash(client));
        return response(id, Map.of("clientDataJSON", encode(client), "authenticatorData", encode(auth),
                "signature", encode(signature.sign())));
    }

    private String response(byte[] id, Map<String, String> attributes) throws Exception {
        return json.writeValueAsString(Map.of("id", encode(id), "rawId", encode(id), "type", "public-key",
                "clientExtensionResults", Map.of(), "response", attributes));
    }

    private byte[] clientData(String type, String challenge) throws Exception {
        return json.writeValueAsBytes(Map.of("type", type, "origin", origin, "challenge", challenge, "crossOrigin", false));
    }

    private byte[] authenticatorData(int flags, int counter) throws Exception {
        return ByteBuffer.allocate(37).put(hash("www.esjh.shop".getBytes(StandardCharsets.US_ASCII)))
                .put((byte) flags).putInt(counter).array();
    }

    private static byte[] coordinate(BigInteger value) {
        byte[] bytes = value.toByteArray();
        byte[] padded = new byte[32];
        int length = Math.min(bytes.length, padded.length);
        System.arraycopy(bytes, bytes.length - length, padded, padded.length - length, length);
        return padded;
    }

    private static byte[] hash(byte[] raw) throws Exception { return MessageDigest.getInstance("SHA-256").digest(raw); }
    private static String encode(byte[] raw) { return Base64.getUrlEncoder().withoutPadding().encodeToString(raw); }
}
