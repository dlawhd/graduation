package shop.esjh.memoryjar.compat;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/** PC loopback의 세 포트를 정해진 시험 앱/사진 서버로만 전달한다. 앱·DB는 내부 네트워크에 그대로 둔다. */
public final class LocalIngressProxy {
    private static final java.util.concurrent.ExecutorService WORKERS=Executors.newFixedThreadPool(64);
    private static final Semaphore CAPACITY=new Semaphore(30);

    /** 목적지는 실행 ID로 정한 컨테이너 세 개뿐이다. HTTP URL·헤더로 목적지를 바꾸거나 파일을 읽지 않는다. */
    public static void main(String[] args) throws Exception {
        String id=System.getenv("LOCAL_COMPARISON_RUN_ID");
        if(!"1".equals(System.getenv("ISOLATED_LOCAL_COMPARISON"))||id==null||!id.matches("local-compare-[a-f0-9]{12}"))
            throw new IllegalStateException("Local comparison identity required");
        selfCheck();
        Files.writeString(Path.of("/results/proxy-check.json"),"{\"checksPassed\":3,\"checksFailed\":0}");
        listen(9010,id+"-before-app",8080);
        listen(9011,id+"-after-app",8080);
        listen(9003,id+"-asset",9000);
    }

    /** 일반 HTTP와 WebSocket의 바이트를 그대로 전달한다. 동시 연결 수와 연결/읽기 대기를 제한한다. */
    private static void listen(int localPort,String target,int targetPort) throws Exception {
        var listener=new ServerSocket();listener.bind(new InetSocketAddress("0.0.0.0",localPort),16);
        var acceptor=new Thread(()->{
            while(!listener.isClosed())try{
                Socket client=listener.accept();
                if(!CAPACITY.tryAcquire()){client.close();continue;}
                WORKERS.execute(()->{
                    try(client;var upstream=new Socket()){
                        client.setSoTimeout(30000);client.setTcpNoDelay(true);
                        upstream.connect(new InetSocketAddress(target,targetPort),3000);
                        upstream.setSoTimeout(30000);upstream.setTcpNoDelay(true);
                        var reverse=WORKERS.submit(()->copy(upstream,client));
                        copy(client,upstream);reverse.get(35,TimeUnit.SECONDS);
                    }catch(Exception expected){/* 연결 종료·시간 초과 때 URL/헤더/본문을 기록하지 않는다. */}
                    finally{CAPACITY.release();}
                });
            }catch(java.io.IOException expected){/* 일시적 연결 실패는 다른 시험 연결을 중단하지 않는다. */}
        },"local-comparison-ingress-"+localPort);
        acceptor.start();
    }

    private static void copy(Socket from,Socket to){
        try{from.getInputStream().transferTo(to.getOutputStream());to.shutdownOutput();}
        catch(java.io.IOException expected){try{from.close();}catch(java.io.IOException ignored){}}
    }

    /** 프록시 시작 전에 실제 loopback TCP의 양방향 전달·반쪽 종료와 목적지 ID 제한을 확인한다. */
    private static void selfCheck() throws Exception {
        if("outside.invalid".matches("local-compare-[a-f0-9]{12}"))throw new AssertionError("identity");
        try(var target=new ServerSocket(0,1,InetAddress.getLoopbackAddress());var local=new ServerSocket(0,1,InetAddress.getLoopbackAddress())){
            var response=new Thread(()->{try(var socket=target.accept()){
                byte[] request=socket.getInputStream().readAllBytes();
                if(!java.util.Arrays.equals(request,new byte[]{1,2,3,4}))throw new AssertionError("forward");
                socket.getOutputStream().write(new byte[]{9,8,7});socket.shutdownOutput();
            }catch(java.io.IOException failure){throw new RuntimeException(failure);}});
            var proxy=new Thread(()->{try(var client=local.accept();var upstream=new Socket(InetAddress.getLoopbackAddress(),target.getLocalPort())){
                var reverse=new Thread(()->copy(upstream,client));reverse.start();copy(client,upstream);reverse.join(3000);
            }catch(Exception failure){throw new RuntimeException(failure);}});
            response.start();proxy.start();
            try(var client=new Socket(InetAddress.getLoopbackAddress(),local.getLocalPort())){
                client.setSoTimeout(3000);client.getOutputStream().write(new byte[]{1,2,3,4});client.shutdownOutput();
                if(!java.util.Arrays.equals(client.getInputStream().readAllBytes(),new byte[]{9,8,7}))throw new AssertionError("reverse");
            }
            proxy.join(3000);response.join(3000);
            if(proxy.isAlive()||response.isAlive())throw new AssertionError("half-close");
        }
    }
}
