package shop.esjh.memoryjar.service.ai;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullSource;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.AiDraftProperties;
import shop.esjh.memoryjar.entity.User;
import shop.esjh.memoryjar.entity.ai.JarDesignDraft;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import shop.esjh.memoryjar.repository.UserRepository;
import shop.esjh.memoryjar.repository.ai.JarAiGenerationRepository;
import shop.esjh.memoryjar.repository.ai.JarDesignDraftRepository;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 본체를 선택한 Draft의 저장·조회와 예전 NULL 계약을 외부 서비스 없이 검증한다. */
class JarBodyPersistenceTest {
    @ParameterizedTest
    @EnumSource(JarBodyStyle.class)
    @NullSource
    void persistsAndReturnsBodyWithoutChangingOriginal(JarBodyStyle body) {
        UserRepository users = mock(UserRepository.class);
        JarDesignDraftRepository drafts = mock(JarDesignDraftRepository.class);
        JarAiGenerationRepository generations = mock(JarAiGenerationRepository.class);
        JarDesignCutoutPathCodec codec = mock(JarDesignCutoutPathCodec.class);
        AiDraftProperties properties = new AiDraftProperties();
        when(users.findById(1L)).thenReturn(Optional.of(User.builder().id(1L).build()));
        when(drafts.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        JarDesignDraft draft = new JarDesignDraftPersistenceService(users, drafts, properties)
                .createDraft(1L, "original.png", body);
        assertThat(draft.getOriginalS3Key()).isEqualTo("original.png");
        assertThat(draft.getBodyStyle()).isEqualTo(body);
        when(drafts.findById(10L)).thenReturn(Optional.of(draft));
        when(codec.decodeRegions(null)).thenReturn(List.of());
        var result = new JarDesignDraftService(drafts, generations, properties, codec).getDraftSummary(1L, 10L);
        assertThat(result.bodyStyle()).isEqualTo(body);
        verify(drafts).save(draft);
        verify(generations).findByDraft_DraftIdOrderByGenerationIdDesc(10L);
    }

    @Test
    void missingUserDoesNotCreateDraft() {
        UserRepository users = mock(UserRepository.class);
        JarDesignDraftRepository drafts = mock(JarDesignDraftRepository.class);
        assertThatThrownBy(() -> new JarDesignDraftPersistenceService(users, drafts, new AiDraftProperties())
                .createDraft(1L, "original.png", JarBodyStyle.CAT)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(drafts);
    }
}
