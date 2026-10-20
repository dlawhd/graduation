package shop.esjh.memoryjar.config;

import java.util.HashMap;
import org.hibernate.cfg.SessionEventSettings;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import shop.esjh.memoryjar.monitoring.ReadDatabaseDiagnosticsListener;
import static org.assertj.core.api.Assertions.*;

/** 기본 꺼짐·명시 활성화·다른 Hibernate 설정 및 리스너 보호를 검사한다. */
class ReadDatabaseDiagnosticsConfigTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(ReadDatabaseDiagnosticsConfig.class);

    @Test void disabledByDefaultAndOnlyExplicitTrueInstallsCustomizer() {
        context.run(c -> assertThat(c).doesNotHaveBean(HibernatePropertiesCustomizer.class));
        context.withPropertyValues("app.monitoring.read-diagnostics-enabled=false")
                .run(c -> assertThat(c).doesNotHaveBean(HibernatePropertiesCustomizer.class));
        context.withPropertyValues("app.monitoring.read-diagnostics-enabled=true").run(c -> {
            var properties = new HashMap<String, Object>();
            properties.put("other.setting", "untouched");
            c.getBean(HibernatePropertiesCustomizer.class).customize(properties);
            assertThat(properties).containsEntry("other.setting", "untouched")
                    .containsEntry(SessionEventSettings.AUTO_SESSION_EVENTS_LISTENER, ReadDatabaseDiagnosticsListener.class.getName());
        });
    }

    @Test void anExistingDifferentListenerIsNotReplaced() {
        var properties = new HashMap<String, Object>();
        properties.put(SessionEventSettings.AUTO_SESSION_EVENTS_LISTENER, "existing.Listener");
        assertThatThrownBy(() -> new ReadDatabaseDiagnosticsConfig().readDatabaseDiagnosticsCustomizer().customize(properties))
                .isInstanceOf(IllegalStateException.class);
        assertThat(properties).containsEntry(SessionEventSettings.AUTO_SESSION_EVENTS_LISTENER, "existing.Listener");
    }
}
