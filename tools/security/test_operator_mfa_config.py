"""실제 서비스에 등록하지 않는 난수 파일로 키 생성기의 경로 제한·권한·덮어쓰기 거절을 검증한다."""
import base64
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('mfa_config', ROOT / 'tools/security/create-operator-mfa-config.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


class PrivateConfigurationTest(unittest.TestCase):
    def test_new_random_file_is_not_overwritten(self):
        (ROOT / 'build').mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='mfa-config-test-', dir=str(ROOT / 'build')) as directory:
            destination = Path(directory) / 'runtime.env'
            generator.write_private(destination)
            original = destination.read_bytes()
            values = dict(line.split('=', 1) for line in original.decode('ascii').splitlines())
            self.assertEqual(32, len(base64.b64decode(values['APP_SUPPORT_MFA_ENCRYPTION_KEY'])))
            self.assertGreaterEqual(len(values['APP_SUPPORT_MFA_BOOTSTRAP_SECRET']), 32)
            with self.assertRaises(FileExistsError):
                generator.write_private(destination)
            self.assertEqual(original, destination.read_bytes())
            if os.name != 'nt':
                self.assertEqual(0o600, destination.stat().st_mode & 0o777)

    def test_repository_source_is_never_a_valid_destination(self):
        with self.assertRaises(ValueError):
            generator.write_private(ROOT / 'src/mfa-secret-must-not-exist.env')
        self.assertFalse((ROOT / 'src/mfa-secret-must-not-exist.env').exists())


if __name__ == '__main__':
    unittest.main()
