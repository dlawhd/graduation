package shop.esjh.memoryjar.controller.file;
import java.net.URI;import java.util.Map;
import org.junit.jupiter.api.Test;import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.TestingAuthenticationToken;
import shop.esjh.memoryjar.service.file.*;import shop.esjh.memoryjar.jwt.*;
import static org.mockito.Mockito.*;import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
/** 파일 본문 입구의 인증·출처·캐시 차단을 HTTP로 확인한다. 실제 S3는 호출하지 않는다. */
@WebMvcTest(FileContentController.class) @AutoConfigureMockMvc(addFilters=false) @ActiveProfiles("test")
class FileContentControllerTest {
 @Autowired MockMvc mvc;@MockitoBean FileReadAccessService access;@MockitoBean PrivateFileLinkService links;
 @MockitoBean JwtTokenProvider tokens;@MockitoBean JwtAuthenticationFilter filter;
 @Test void authenticatedReadRedirectsWithoutCaching()throws Exception{var target=new FileReadAccessService.ReadTarget("notes/private.png","image/png");when(access.attachment(1L,2L)).thenReturn(target);when(links.sign(target)).thenReturn(URI.create("https://storage.invalid/short-lived"));
  mvc.perform(get("/api/v1/files/attachments/2/content").principal(new TestingAuthenticationToken(Map.of("userId",1L),null)).header("Sec-Fetch-Site","same-site"))
   .andExpect(status().isFound()).andExpect(header().string("Cache-Control","no-store")).andExpect(header().string("Location","https://storage.invalid/short-lived"));}
 @Test void missingAuthenticationNeverSignsAFile()throws Exception{mvc.perform(get("/api/v1/files/attachments/2/content")).andExpect(status().isUnauthorized());verifyNoInteractions(access,links);}
 @Test void externalSiteCannotUseLoggedInUserAsImageExistenceOracle()throws Exception{mvc.perform(get("/api/v1/files/attachments/2/content").principal(new TestingAuthenticationToken(Map.of("userId",1L),null)).header("Sec-Fetch-Site","cross-site")).andExpect(status().isForbidden());verifyNoInteractions(access,links);}
}
