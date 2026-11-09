package shop.esjh.memoryjar.security;

import java.util.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.web.util.matcher.IpAddressMatcher;

/** 명시한 프록시에서 온 요청만 전달 IP를 읽는다. 임의의 X-Forwarded-For로 요청 제한을 우회하지 못하게 한다. */
public final class TrustedClientAddress {
    private final List<IpAddressMatcher> proxies;
    public TrustedClientAddress(String trustedAddresses) {
        proxies=Arrays.stream(trustedAddresses.split(",")).map(String::strip).filter(s->!s.isEmpty())
                .map(IpAddressMatcher::new).toList();
    }
    public String resolve(HttpServletRequest request) {
        String peer=request.getRemoteAddr();
        if(!trusted(peer)) return peer;
        String forwarded=request.getHeader("X-Forwarded-For");
        if(forwarded==null || forwarded.length()>2048) return peer;
        var chain=forwarded.split(",",-1);if(chain.length>16) return peer;
        String current=peer;
        // 가장 가까운 프록시부터 거슬러 올라가 처음 만나는 신뢰하지 않는 주소를 사용한다.
        for(int i=chain.length-1;i>=0 && trusted(current);i--) {
            String candidate=chain[i].strip();if(!literal(candidate)) return peer;current=candidate;
        }
        return current;
    }
    private boolean trusted(String address) {
        if(!literal(address))return false;
        return proxies.stream().anyMatch(proxy->proxy.matches(address));
    }
    private boolean literal(String address) {
        if(address==null || !address.matches("[0-9a-fA-F:.]+")) return false;
        if(address.contains(":")) { try {return java.net.InetAddress.getByName(address) instanceof java.net.Inet6Address;}
            catch(java.net.UnknownHostException invalid){return false;} }
        String[] parts=address.split("\\.",-1);if(parts.length!=4)return false;
        for(String part:parts) {if(!part.matches("[0-9]{1,3}") || Integer.parseInt(part)>255)return false;}
        return true;
    }
}
