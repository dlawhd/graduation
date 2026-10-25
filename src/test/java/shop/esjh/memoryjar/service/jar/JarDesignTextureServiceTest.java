package shop.esjh.memoryjar.service.jar;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.config.properties.S3Properties;
import shop.esjh.memoryjar.entity.ai.JarDesign;
import shop.esjh.memoryjar.repository.ai.JarDesignRepository;
import shop.esjh.memoryjar.repository.jar.JarMemberRepository;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;
import java.io.ByteArrayInputStream;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;

/** 권한 없는 읽기와 외부 실패를 차단하고 네트워크 전에 DB 트랜잭션이 끝나는지 검증한다. */
class JarDesignTextureServiceTest {
    final JarMemberRepository members=mock(JarMemberRepository.class);
    final JarDesignRepository designs=mock(JarDesignRepository.class);
    final S3Client s3=mock(S3Client.class);
    final PlatformTransactionManager tx=mock(PlatformTransactionManager.class);
    final byte[] png={(byte)0x89,'P','N','G',13,10,26,10};
    JarDesignTextureService service;
    @BeforeEach void setup(){
        var properties=new S3Properties();properties.setBucket("test-bucket");
        when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service=new JarDesignTextureService(members,designs,s3,properties,tx,new JarDesignTextureCache(true));
    }
    void member(String key){
        when(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(2L,1L)).thenReturn(true);
        var design=JarDesign.builder().build();ReflectionTestUtils.setField(design,"finalS3Key",key);
        ReflectionTestUtils.setField(design,"bodyArtworkS3Key","body.png");
        when(designs.findByJar_JarId(2L)).thenReturn(Optional.of(design));
    }
    @Test void unauthorizedNeverReadsStorage(){
        assertThatThrownBy(()->service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isInstanceOf(ResponseStatusException.class)
            .extracting("statusCode").isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN);
        verifyNoInteractions(designs,s3);
    }
    @Test void validPngReadAfterTransactionCommits(){
        member("image.png");
        when(s3.getObject(any(GetObjectRequest.class))).thenAnswer(call->{
            verify(tx).commit(any());
            assertThat(((GetObjectRequest)call.getArgument(0)).key()).isEqualTo("image.png");
            return new ResponseInputStream<>(GetObjectResponse.builder().contentLength(8L).build(),new ByteArrayInputStream(png));
        });
        assertThat(service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isEqualTo(png);
    }
    @Test void missingDesignNeverReadsStorage(){
        when(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(2L,1L)).thenReturn(true);
        when(designs.findByJar_JarId(2L)).thenReturn(Optional.empty());
        assertThatThrownBy(()->service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(s3);
    }
    @Test void oversizedAndNonPngAreRejected(){
        member("image.png");
        when(s3.getObject(any(GetObjectRequest.class))).thenReturn(new ResponseInputStream<>(GetObjectResponse.builder().contentLength(17*1024*1024L).build(),new ByteArrayInputStream(png)));
        assertThatThrownBy(()->service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isInstanceOf(ResponseStatusException.class);
        when(s3.getObject(any(GetObjectRequest.class))).thenReturn(new ResponseInputStream<>(GetObjectResponse.builder().contentLength(8L).build(),new ByteArrayInputStream(new byte[8])));
        assertThatThrownBy(()->service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isInstanceOf(ResponseStatusException.class);
    }
    @Test void storageFailureDoesNotExposeKey(){
        member("private-key.png");
        when(s3.getObject(any(GetObjectRequest.class))).thenThrow(S3Exception.builder().message("private-key.png").statusCode(403).build());
        assertThatThrownBy(()->service.read(1L,2L,JarDesignTextureService.Part.BODY)).isInstanceOf(ResponseStatusException.class).hasMessageNotContaining("private-key");
    }

    @Test void cacheHitStillChecksMembershipAndDesignOnEveryRequest(){
        member("image.png");
        when(s3.getObject(any(GetObjectRequest.class))).thenAnswer(call->new ResponseInputStream<>(
                GetObjectResponse.builder().contentLength(8L).build(),new ByteArrayInputStream(png)));
        assertThat(service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isEqualTo(png);
        assertThat(service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isEqualTo(png);
        verify(members,times(2)).existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(2L,1L);
        verify(designs,times(2)).findByJar_JarId(2L);
        verify(s3,times(1)).getObject(any(GetObjectRequest.class));
        when(members.existsByJar_JarIdAndUser_IdAndDeletedAtIsNull(2L,1L)).thenReturn(false);
        assertThatThrownBy(()->service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isInstanceOf(ResponseStatusException.class)
                .extracting("statusCode").isEqualTo(org.springframework.http.HttpStatus.FORBIDDEN);
        verify(s3,times(1)).getObject(any(GetObjectRequest.class));
    }

    @Test void differentUserCannotUseAnotherMembersCachedImage(){
        member("image.png");
        when(s3.getObject(any(GetObjectRequest.class))).thenAnswer(call->new ResponseInputStream<>(
                GetObjectResponse.builder().contentLength(8L).build(),new ByteArrayInputStream(png)));
        service.read(1L,2L,JarDesignTextureService.Part.IMAGE);
        assertThatThrownBy(()->service.read(99L,2L,JarDesignTextureService.Part.IMAGE)).isInstanceOf(ResponseStatusException.class);
        verify(s3,times(1)).getObject(any(GetObjectRequest.class));
    }

    @Test void removedDesignDoesNotReturnOldCacheAndNewDesignKeyLoadsNewImage(){
        member("old-image.png");
        when(s3.getObject(any(GetObjectRequest.class))).thenAnswer(call->new ResponseInputStream<>(
                GetObjectResponse.builder().contentLength(8L).build(),new ByteArrayInputStream(png)));
        service.read(1L,2L,JarDesignTextureService.Part.IMAGE);
        when(designs.findByJar_JarId(2L)).thenReturn(Optional.empty());
        assertThatThrownBy(()->service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isInstanceOf(ResponseStatusException.class);
        member("new-image.png"); service.read(1L,2L,JarDesignTextureService.Part.IMAGE);
        verify(s3,times(2)).getObject(any(GetObjectRequest.class));
    }

    @Test void bodyAndImageUseSeparateCacheEntriesAndInvalidPngIsNeverCached(){
        member("image.png");
        when(s3.getObject(any(GetObjectRequest.class))).thenAnswer(call->new ResponseInputStream<>(
                GetObjectResponse.builder().contentLength(8L).build(),new ByteArrayInputStream(png)));
        service.read(1L,2L,JarDesignTextureService.Part.IMAGE); service.read(1L,2L,JarDesignTextureService.Part.BODY);
        service.read(1L,2L,JarDesignTextureService.Part.IMAGE); service.read(1L,2L,JarDesignTextureService.Part.BODY);
        verify(s3,times(2)).getObject(any(GetObjectRequest.class));
        member("invalid.png");
        when(s3.getObject(any(GetObjectRequest.class))).thenAnswer(call->new ResponseInputStream<>(
                GetObjectResponse.builder().contentLength(8L).build(),new ByteArrayInputStream(new byte[8])));
        for(int i=0;i<2;i++)assertThatThrownBy(()->service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).isInstanceOf(ResponseStatusException.class);
        verify(s3,times(4)).getObject(any(GetObjectRequest.class));
    }
}
