package shop.esjh.memoryjar.security;
import org.junit.jupiter.api.Test;import org.springframework.mock.web.MockHttpServletRequest;
import static org.assertj.core.api.Assertions.*;
/** 전달 헤더 위조·프록시 연쇄·잘못된 주소를 구분한다. */
class TrustedClientAddressTest {
 final TrustedClientAddress resolver=new TrustedClientAddress("127.0.0.1,::1");
 MockHttpServletRequest request(String peer,String forwarded){var request=new MockHttpServletRequest();request.setRemoteAddr(peer);request.addHeader("X-Forwarded-For",forwarded);return request;}
 @Test void directClientsCannotForgeAddresses(){assertThat(resolver.resolve(request("203.0.113.5","1.2.3.4"))).isEqualTo("203.0.113.5");}
 @Test void rightmostUntrustedHopWins(){assertThat(resolver.resolve(request("127.0.0.1","1.2.3.4, 203.0.113.5"))).isEqualTo("203.0.113.5");assertThat(resolver.resolve(request("::1","2001:db8::123,127.0.0.1"))).isEqualTo("2001:db8::123");}
 @Test void malformedForwardingDoesNotBecomeAnIdentity(){assertThat(resolver.resolve(request("127.0.0.1","hostname.invalid"))).isEqualTo("127.0.0.1");assertThat(resolver.resolve(request("127.0.0.1","999.0.0.1"))).isEqualTo("127.0.0.1");}
}
