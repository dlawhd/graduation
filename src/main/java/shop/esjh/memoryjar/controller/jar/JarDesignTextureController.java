package shop.esjh.memoryjar.controller.jar;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.service.jar.JarDesignTextureService;
import java.util.Map;

/** 3D 텍스처를 기존 로그인/API CORS 보호 아래 PNG로 제공한다. 버킷 공개 권한은 변경하지 않는다. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/jars")
public class JarDesignTextureController {
    private final JarDesignTextureService service;

    /** 서버가 저장한 디자인만 읽고 개인 사진이 공유 캐시에 남지 않게 한다. */
    @GetMapping("/{jarId}/design/texture")
    public ResponseEntity<byte[]> texture(Authentication authentication,@PathVariable Long jarId,
            @RequestParam(defaultValue="IMAGE") JarDesignTextureService.Part part) {
        if(authentication==null||!(authentication.getPrincipal() instanceof Map<?,?> principal))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"인증이 필요합니다.");
        Long userId;
        try {userId=Long.valueOf(String.valueOf(principal.get("userId")));}
        catch(NumberFormatException failure){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"인증 사용자 정보를 읽을 수 없습니다.");}
        if(jarId<=0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"저금통 번호를 확인해 주세요.");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.IMAGE_PNG)
                .header("X-Content-Type-Options","nosniff").body(service.read(userId,jarId,part));
    }
}
