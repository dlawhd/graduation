package shop.esjh.memoryjar.compat;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;

/** 실제 loopback HTTP로 합성 PNG 서버의 경로·메서드·출처 제한을 검사한 뒤에만 사진 서버를 시작한다. */
public final class LocalFixtureServerCheck {
    public static void main(String[] args) throws Exception {
        LocalComparisonLauncher.verifyIsolation();
        byte[] png=LocalFixtureServer.syntheticPng();
        check(Arrays.equals(png,LocalFixtureServer.syntheticPng()),"deterministic-png");
        check(png.length>8&&png[0]==(byte)137&&png[1]=='P'&&png[2]=='N'&&png[3]=='G',"png-signature");
        var server=LocalFixtureServer.create(new InetSocketAddress("127.0.0.1",0),png);server.start();
        try {
            var http=HttpClient.newHttpClient();String base="http://127.0.0.1:"+server.getAddress().getPort();
            String photo="/test-memory-jar-bucket/compatibility/fixture.png";
            var read=http.send(HttpRequest.newBuilder(URI.create(base+photo+"?dummy-signature=test")).GET().build(),HttpResponse.BodyHandlers.ofByteArray());
            check(read.statusCode()==200&&Arrays.equals(read.body(),png),"same-bytes");
            check(read.headers().firstValue("cache-control").orElse("").equals("no-store"),"cache-policy");
            check(send(http,base+"/private", "GET",null)==404,"path");
            check(send(http,base+photo,"DELETE",null)==405,"delete");
            check(send(http,base+photo,"PUT",null)==405,"upload");
            check(send(http,base+photo,"GET","https://outside.invalid")==403,"outside-origin");
            check(send(http,base+photo,"GET","http://127.0.0.1:18900")==200,"before-origin");
            check(send(http,base+photo,"GET","http://localhost:18901")==200,"after-origin");
            Files.writeString(Path.of("/session/fixture-check-public.json"),"{\"checksPassed\":10,\"checksFailed\":0}");
        } finally {server.stop(0);}
    }
    private static int send(HttpClient http,String url,String method,String origin) throws Exception {
        var request=HttpRequest.newBuilder(URI.create(url)).method(method,HttpRequest.BodyPublishers.noBody());
        if(origin!=null)request.header("Origin",origin);
        return http.send(request.build(),HttpResponse.BodyHandlers.discarding()).statusCode();
    }
    private static void check(boolean value,String name){if(!value)throw new AssertionError("Fixture boundary: "+name);}
}
