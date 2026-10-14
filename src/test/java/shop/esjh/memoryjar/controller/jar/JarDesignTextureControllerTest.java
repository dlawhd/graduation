package shop.esjh.memoryjar.controller.jar;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import shop.esjh.memoryjar.service.jar.JarDesignTextureService;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** PNG 응답 헤더와 인증/잘못된 요청을 검증한다. 실제 S3나 사용자 데이터는 호출하지 않는다. */
class JarDesignTextureControllerTest {
    final JarDesignTextureService service=mock(JarDesignTextureService.class);
    final TestingAuthenticationToken user=new TestingAuthenticationToken(Map.of("userId",1L),null);
    MockMvc mvc;
    @BeforeEach void setup(){mvc=MockMvcBuilders.standaloneSetup(new JarDesignTextureController(service)).build();}
    @Test void anonymousRejected() throws Exception {
        mvc.perform(get("/api/v1/jars/2/design/texture")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void pngIsPrivateAndNotSniffed() throws Exception {
        when(service.read(1L,2L,JarDesignTextureService.Part.IMAGE)).thenReturn(new byte[]{1,2});
        mvc.perform(get("/api/v1/jars/2/design/texture").principal(user)).andExpect(status().isOk())
            .andExpect(content().contentType("image/png")).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(header().string("X-Content-Type-Options","nosniff"));
    }
    @Test void invalidPartAndIdNeverReadStorage() throws Exception {
        mvc.perform(get("/api/v1/jars/2/design/texture?part=URL").principal(user)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/jars/0/design/texture").principal(user)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test void bodyUsesSameAuthority() throws Exception {
        when(service.read(1L,2L,JarDesignTextureService.Part.BODY)).thenReturn(new byte[]{1});
        mvc.perform(get("/api/v1/jars/2/design/texture?part=BODY").principal(user)).andExpect(status().isOk());
        verify(service).read(1L,2L,JarDesignTextureService.Part.BODY);
    }
}
