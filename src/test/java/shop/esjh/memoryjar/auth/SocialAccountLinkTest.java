package shop.esjh.memoryjar.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/** 소셜 연결의 시작 번호와 콜백 상태가 같은 브라우저 세션에서 한 번만 쓰이는지 확인한다. */
class SocialAccountLinkTest {
    @Test
    void wrongProviderOrBrowserCannotUseTheConnectionAndCallbackConsumesItOnce() {
        var browser = new MockHttpServletRequest();
        var other = new MockHttpServletRequest();
        var identity = new SocialAccountLink.Identity(17L, 2L, "a".repeat(64));
        String path = SocialAccountLink.start(browser, identity, "google");
        String nonce = path.substring(path.indexOf('=') + 1);
        assertThatIllegalArgumentException().isThrownBy(() -> SocialAccountLink.bind(other, "google", "state", nonce));
        assertThatIllegalArgumentException().isThrownBy(() -> SocialAccountLink.bind(browser, "naver", "state", nonce));

        String state = SocialAccountLink.bind(browser, "google", "state", nonce);
        assertThat(SocialAccountLink.isLink(state)).isTrue();
        assertThat(SocialAccountLink.consume(browser, "google", "unrelated")).isNull();
        assertThat(SocialAccountLink.consume(other, "google", state)).isNull();
        assertThat(SocialAccountLink.consume(browser, "google", state)).isEqualTo(identity);
        assertThat(SocialAccountLink.consume(browser, "google", state)).isNull();
    }
}
