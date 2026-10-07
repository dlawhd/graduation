package shop.esjh.memoryjar.dto.ai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import shop.esjh.memoryjar.enums.ai.JarBodyStyle;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;

/** 사용자가 그린 닫힌 틀이다. 실행 가능한 SVG 대신 제한된 좌표와 색상만 저장한다. */
public record CustomJarBodyValue(@NotNull @Size(min=3, max=96) List<@NotNull @Valid Point> points,
                                @NotNull @Pattern(regexp="#[0-9a-fA-F]{6}") String color) {
    // 최종 저장 전후 비교에 쓰는 좌표가 외부 List 변경으로 뒤늦게 달라지지 않도록 복사한다.
    public CustomJarBodyValue {
        if (points != null) points = Collections.unmodifiableList(new ArrayList<>(points));
    }
    public record Point(@NotNull @DecimalMin("0.05") @DecimalMax("0.95") Double x,
                        @NotNull @DecimalMin("0.05") @DecimalMax("0.95") Double y) { }

    /** 작은 선/점, 겹치는 외곽선, 무한 좌표는 사진을 담을 수 없으므로 서버에서도 거절한다. */
    @AssertTrue(message="틀을 넓게 그리고 선이 서로 교차하지 않게 해주세요.")
    @com.fasterxml.jackson.annotation.JsonIgnore
    public boolean isUsableOutline() {
        if (points == null || points.size() < 3 || points.size() > 96) return false;
        double minX=1, minY=1, maxX=0, maxY=0, area=0;
        for (int i=0; i<points.size(); i++) {
            Point a=points.get(i), b=points.get((i+1)%points.size());
            if (!valid(a) || !valid(b)) return false;
            minX=Math.min(minX,a.x); minY=Math.min(minY,a.y);
            maxX=Math.max(maxX,a.x); maxY=Math.max(maxY,a.y);
            area+=a.x*b.y-b.x*a.y;
            if (Math.hypot(a.x-b.x,a.y-b.y)<0.0001) return false;
            for (int j=i+2; j<points.size(); j++) {
                if (i==0 && j==points.size()-1) continue;
                Point c=points.get(j), d=points.get((j+1)%points.size());
                if (!valid(c) || !valid(d)) return false;
                if (intersects(a,b,c,d)) return false;
            }
        }
        return maxX-minX>=.25 && maxY-minY>=.25 && Math.abs(area)/2>=.05;
    }

    private static boolean valid(Point p) {
        return p!=null && p.x!=null && p.y!=null && Double.isFinite(p.x) && Double.isFinite(p.y)
                && p.x>=.05 && p.x<=.95 && p.y>=.05 && p.y<=.95;
    }
    private static double cross(Point a, Point b, Point c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
    private static boolean intersects(Point a, Point b, Point c, Point d) {
        double abC=cross(a,b,c), abD=cross(a,b,d), cdA=cross(c,d,a), cdB=cross(c,d,b);
        if (abC*abD<0 && cdA*cdB<0) return true;
        return onLine(a,b,c,abC) || onLine(a,b,d,abD) || onLine(c,d,a,cdA) || onLine(c,d,b,cdB);
    }
    private static boolean onLine(Point a, Point b, Point p, double cross) {
        return Math.abs(cross)<1e-10 && p.x>=Math.min(a.x,b.x) && p.x<=Math.max(a.x,b.x)
                && p.y>=Math.min(a.y,b.y) && p.y<=Math.max(a.y,b.y);
    }

    /** CUSTOM 코드와 틀을 반드시 함께 받는다. 구 요청의 고정 본체/이미지 단독 계약은 유지한다. */
    public static void validateFor(JarBodyStyle style, CustomJarBodyValue value) {
        if ((style==JarBodyStyle.CUSTOM)!=(value!=null) || (value!=null &&
                (!value.isUsableOutline() || value.color==null || !value.color.matches("#[0-9a-fA-F]{6}"))))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "직접 만든 틀을 확인해 주세요.");
    }
}
