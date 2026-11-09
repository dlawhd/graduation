package shop.esjh.memoryjar.controller.file;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import shop.esjh.memoryjar.service.file.*;

/** 파일 본문 주소를 요청할 때도 로그인·현재 권한을 검사한다. 응답에 읽기 주소를 캐시하지 않는다. */
@RestController
@RequestMapping("/api/v1/files")
public class FileContentController {
    private final FileReadAccessService access;
    private final PrivateFileLinkService links;
    public FileContentController(FileReadAccessService access,PrivateFileLinkService links) { this.access=access;this.links=links; }
    @GetMapping("/attachments/{id}/content")
    public ResponseEntity<Void> attachment(Authentication authentication,@PathVariable Long id,jakarta.servlet.http.HttpServletRequest request) {
        rejectCrossSiteEmbedding(request);
        return redirect(access.attachment(FileController.extractCurrentUserId(authentication),id));
    }
    @GetMapping("/uploads/{id}/content")
    public ResponseEntity<Void> upload(Authentication authentication,@PathVariable Long id,jakarta.servlet.http.HttpServletRequest request) {
        rejectCrossSiteEmbedding(request);
        return redirect(access.upload(FileController.extractCurrentUserId(authentication),id));
    }
    private void rejectCrossSiteEmbedding(jakarta.servlet.http.HttpServletRequest request) {
        // 다른 사이트가 로그인 쿠키를 이용해 이미지 존재 여부를 검사하는 삽입 요청을 차단한다.
        if ("cross-site".equals(request.getHeader("Sec-Fetch-Site")))
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.FORBIDDEN,"다른 사이트에서는 파일을 열 수 없어.");
    }
    private ResponseEntity<Void> redirect(FileReadAccessService.ReadTarget target) {
        return ResponseEntity.status(HttpStatus.FOUND).location(links.sign(target)).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy","no-referrer").header("Cross-Origin-Resource-Policy","same-site").build();
    }
}
