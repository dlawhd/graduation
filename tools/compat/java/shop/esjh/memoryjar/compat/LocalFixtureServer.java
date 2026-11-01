package shop.esjh.memoryjar.compat;

import com.sun.net.httpserver.HttpServer;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;

/** AWS 대신 같은 합성 PNG 한 장만 제공한다. 업로드·삭제·임의 파일 조회는 지원하지 않는다. */
public final class LocalFixtureServer {
    private static final Set<String> ORIGINS=Set.of("http://127.0.0.1:18900","http://localhost:18901");
    /** 동일 JVM 이미지에서 한 번 만든 PNG를 두 백엔드와 브라우저가 함께 읽는다. */
    public static void main(String[] args) throws Exception {
        if(!"1".equals(System.getenv("ISOLATED_LOCAL_COMPARISON"))) throw new IllegalStateException("Local fixture only");
        LocalComparisonLauncher.verifyIsolation();
        byte[] png=syntheticPng();
        Files.writeString(Path.of("/session/photo-public.json"),"{\"width\":480,\"height\":480,\"bytes\":"+png.length
            +",\"sha256\":\""+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(png))+"\"}");
        create(new InetSocketAddress("0.0.0.0",9000),png).start();
    }

    /** 경로와 메서드를 제한하며 브라우저 캐시를 사용하지 않는 동일 조건을 제공한다. 실제 AWS 인증 검증은 아니다. */
    static HttpServer create(InetSocketAddress bind,byte[] png) throws Exception {
        var server=HttpServer.create(bind,8);
        var reads=new AtomicInteger();
        server.createContext("/",exchange->{
            try {
                String method=exchange.getRequestMethod(),path=exchange.getRequestURI().getPath();
                if(!Set.of("GET","HEAD","OPTIONS").contains(method)) {exchange.sendResponseHeaders(405,-1);return;}
                String origin=exchange.getRequestHeaders().getFirst("Origin");
                if(origin!=null&&!ORIGINS.contains(origin)) {exchange.sendResponseHeaders(403,-1);return;}
                if(origin!=null) {exchange.getResponseHeaders().set("Access-Control-Allow-Origin",origin);exchange.getResponseHeaders().set("Vary","Origin");}
                exchange.getResponseHeaders().set("Cache-Control","no-store");
                if("OPTIONS".equals(method)) {exchange.sendResponseHeaders(204,-1);return;}
                if("/__fixture/stats".equals(path)) {
                    byte[] bytes=("{\"imageReads\":"+reads.get()+"}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type","application/json");
                    exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);return;
                }
                if(!"/test-memory-jar-bucket/compatibility/fixture.png".equals(path)) {exchange.sendResponseHeaders(404,-1);return;}
                exchange.getResponseHeaders().set("Content-Type","image/png");
                exchange.getResponseHeaders().set("Content-Length",String.valueOf(png.length));
                if("HEAD".equals(method)) {exchange.sendResponseHeaders(200,-1);return;}
                reads.incrementAndGet();exchange.sendResponseHeaders(200,png.length);exchange.getResponseBody().write(png);
            } finally {exchange.close();}
        });
        return server;
    }

    /** 인물·실제 사진 대신 고정 도형을 만든다. 폰트 설치나 외부 이미지 서비스도 필요 없다. */
    static byte[] syntheticPng() throws Exception {
        var image=new BufferedImage(480,480,BufferedImage.TYPE_INT_ARGB);var g=image.createGraphics();
        g.setColor(new Color(253,246,228));g.fillRect(0,0,480,480);
        g.setColor(new Color(215,233,223));g.fillOval(48,48,384,384);
        g.setColor(new Color(232,166,183));g.fillRect(112,185,256,170);
        g.setColor(Color.WHITE);g.fillOval(170,122,140,140);
        g.setColor(new Color(34,83,65));
        for(int i=0;i<7;i++)g.fillRect(148+i*27,300,14,30);
        g.dispose();
        var bytes=new ByteArrayOutputStream();ImageIO.write(image,"png",bytes);return bytes.toByteArray();
    }
}
