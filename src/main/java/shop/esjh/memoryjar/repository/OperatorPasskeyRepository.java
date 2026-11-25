package shop.esjh.memoryjar.repository;

import com.yubico.webauthn.CredentialRepository;
import com.yubico.webauthn.RegisteredCredential;
import com.yubico.webauthn.data.ByteArray;
import com.yubico.webauthn.data.PublicKeyCredentialDescriptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.Set;

/** WebAuthn 검증기에 등록된 공개 키와 소유자 정보만 전달한다. */
@Repository
public class OperatorPasskeyRepository implements CredentialRepository {
    private final JdbcTemplate jdbc;
    private static final String SELECT = "SELECT user_id, credential_id, user_handle, public_key_cose, signature_count FROM operator_passkeys";
    private static final RowMapper<Entry> ROW = (rs, row) -> new Entry(rs.getLong("user_id"),
            rs.getString("credential_id"), new ByteArray(rs.getBytes("user_handle")),
            new ByteArray(rs.getBytes("public_key_cose")), rs.getLong("signature_count"));

    public OperatorPasskeyRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public boolean exists(long userId) { return byUser(Long.toString(userId)).isPresent(); }

    public void insert(long userId, ByteArray id, ByteArray handle, ByteArray key, long count) {
        jdbc.update("INSERT INTO operator_passkeys(user_id,credential_id,user_handle,public_key_cose,signature_count) VALUES(?,?,?,?,?)",
                userId, id.getBase64Url(), handle.getBytes(), key.getBytes(), count);
    }

    public boolean updateCounter(long userId, ByteArray id, long previousCount, long count) {
        return jdbc.update("UPDATE operator_passkeys SET signature_count=? WHERE user_id=? AND credential_id=? AND signature_count=?",
                count, userId, id.getBase64Url(), previousCount) == 1;
    }

    @Override public Set<PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
        return byUser(username).map(entry -> Set.of(PublicKeyCredentialDescriptor.builder()
                .id(entry.credential().getCredentialId()).build())).orElseGet(Set::of);
    }

    @Override public Optional<ByteArray> getUserHandleForUsername(String username) {
        return byUser(username).map(Entry::handle);
    }

    @Override public Optional<String> getUsernameForUserHandle(ByteArray handle) {
        return jdbc.query(SELECT + " WHERE user_handle=?", ROW, handle.getBytes()).stream()
                .findFirst().map(entry -> Long.toString(entry.userId()));
    }

    @Override public Optional<RegisteredCredential> lookup(ByteArray id, ByteArray handle) {
        return byCredential(id).filter(entry -> entry.handle().equals(handle)).map(Entry::credential);
    }

    @Override public Set<RegisteredCredential> lookupAll(ByteArray id) {
        return byCredential(id).map(entry -> Set.of(entry.credential())).orElseGet(Set::of);
    }

    private Optional<Entry> byUser(String user) {
        return jdbc.query(SELECT + " WHERE user_id=?", ROW, Long.parseLong(user)).stream().findFirst();
    }

    private Optional<Entry> byCredential(ByteArray id) {
        return jdbc.query(SELECT + " WHERE credential_id=?", ROW, id.getBase64Url()).stream().findFirst();
    }

    private record Entry(long userId, String id, ByteArray handle, ByteArray publicKey, long count) {
        RegisteredCredential credential() {
            try {
                return RegisteredCredential.builder().credentialId(ByteArray.fromBase64Url(id)).userHandle(handle)
                        .publicKeyCose(publicKey).signatureCount(count).build();
            } catch (com.yubico.webauthn.data.exception.Base64UrlException invalid) {
                throw new IllegalStateException("저장된 패스키 ID 형식이 올바르지 않습니다.", invalid);
            }
        }
    }
}
