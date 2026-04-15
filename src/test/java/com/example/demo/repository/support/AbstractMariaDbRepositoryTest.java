package com.example.demo.repository.support;

import com.example.demo.entity.User;
import com.example.demo.entity.file.FileUpload;
import com.example.demo.entity.jar.Jar;
import com.example.demo.entity.jar.JarInvite;
import com.example.demo.entity.jar.JarMember;
import com.example.demo.entity.jar.JarOpenEvent;
import com.example.demo.entity.note.Note;
import com.example.demo.entity.note.NoteAttachment;
import com.example.demo.entity.note.NoteReaction;
import com.example.demo.enums.file.FilePurpose;
import com.example.demo.enums.file.FileUploadStatus;
import com.example.demo.enums.jar.JarLockLevel;
import com.example.demo.enums.jar.JarOpenMode;
import com.example.demo.enums.jar.JarOpenReason;
import com.example.demo.enums.jar.JarRole;
import com.example.demo.enums.jar.JarTheme;
import com.example.demo.enums.note.NoteReactionEmoji;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MariaDBContainer;
import org.testcontainers.junit.jupiter.Container;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 각 Repository 테스트에서 공통으로 쓰는 MariaDB/Testcontainers 설정과 테스트 데이터 생성 도우미를 제공한다.
 */
public abstract class AbstractMariaDbRepositoryTest {

    @Container
    static MariaDBContainer<?> mariaDBContainer =
            new MariaDBContainer<>("mariadb:10.11")
                    .withDatabaseName("testdb")
                    .withUsername("test")
                    .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", mariaDBContainer::getJdbcUrl);
        registry.add("spring.datasource.username", mariaDBContainer::getUsername);
        registry.add("spring.datasource.password", mariaDBContainer::getPassword);
        registry.add("spring.datasource.driver-class-name", mariaDBContainer::getDriverClassName);
    }

    @PersistenceContext
    protected EntityManager entityManager;

    protected User saveUser(String providerId, String email, String name) {
        User user = User.builder()
                .provider("NAVER")
                .providerId(providerId)
                .email(email)
                .name(name)
                .birthyear("2000")
                .build();
        return persist(user);
    }

    protected Jar saveJar(User owner, String name, LocalDateTime openAt) {
        Jar jar = Jar.builder()
                .owner(owner)
                .name(name)
                .description(name + " description")
                .theme(JarTheme.COUPLE)
                .maxMembers(5)
                .openAt(openAt)
                .openMode(JarOpenMode.ALL_AT_ONCE)
                .lockLevel(JarLockLevel.TITLE_ONLY)
                .build();
        return persist(jar);
    }

    protected JarMember saveJarMember(Jar jar, User user, JarRole role, LocalDateTime joinedAt) {
        JarMember jarMember = JarMember.builder()
                .jar(jar)
                .user(user)
                .role(role)
                .joinedAt(joinedAt)
                .build();
        return persist(jarMember);
    }

    protected JarInvite saveJarInvite(
            Jar jar,
            User createdBy,
            String code,
            LocalDateTime expiresAt,
            int maxUses
    ) {
        JarInvite invite = JarInvite.builder()
                .jar(jar)
                .createdBy(createdBy)
                .code(code)
                .expiresAt(expiresAt)
                .maxUses(maxUses)
                .build();
        return persist(invite);
    }

    protected JarOpenEvent saveJarOpenEvent(Jar jar, LocalDateTime openedAt, JarOpenReason reason) {
        return persist(JarOpenEvent.create(jar, openedAt, reason));
    }

    protected Note saveNote(Jar jar, User author, String title, LocalDateTime baseTime) {
        Note note = Note.builder()
                .jar(jar)
                .author(author)
                .title(title)
                .content(title + " content")
                .isEncrypted(false)
                .noteDate(baseTime.toLocalDate())
                .location("Seoul")
                .tags(List.of("memory", "test"))
                .build();
        return persist(note);
    }

    protected NoteReaction saveReaction(Note note, User user, NoteReactionEmoji emoji) {
        NoteReaction reaction = NoteReaction.builder()
                .note(note)
                .user(user)
                .emoji(emoji)
                .build();
        return persist(reaction);
    }

    protected NoteAttachment saveAttachment(Note note, int sortOrder, String s3Key) {
        NoteAttachment attachment = NoteAttachment.builder()
                .note(note)
                .sortOrder(sortOrder)
                .s3Key(s3Key)
                .url("https://cdn.example.com/" + s3Key)
                .thumbnailUrl("https://cdn.example.com/thumb/" + s3Key)
                .contentType("image/png")
                .size(100L + sortOrder)
                .build();
        return persist(attachment);
    }

    protected FileUpload saveFileUpload(
            User user,
            FilePurpose purpose,
            FileUploadStatus status,
            String s3Key
    ) {
        FileUpload fileUpload = FileUpload.builder()
                .user(user)
                .purpose(purpose)
                .status(status)
                .s3Key(s3Key)
                .publicUrl("https://cdn.example.com/" + s3Key)
                .contentType("image/png")
                .size(1024L)
                .build();

        FileUpload saved = persist(fileUpload);
        if (status == FileUploadStatus.COMPLETED) {
            saved.markCompleted();
            entityManager.flush();
        } else if (status == FileUploadStatus.CONSUMED) {
            saved.markCompleted();
            saved.markConsumed();
            entityManager.flush();
        }
        return saved;
    }

    protected void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    protected <T> T persist(T entity) {
        entityManager.persist(entity);
        entityManager.flush();
        return entity;
    }
}
