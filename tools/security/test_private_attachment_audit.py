"""운영 점검이 사진 원문을 읽거나 목록 조회 실패를 비공개 성공으로 오인하지 않는지 대역으로 검증한다."""
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('private_audit', Path(__file__).with_name('audit-private-attachments.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class Reader:
    """AWS나 실제 저장소 없이 고정된 구성 메타데이터만 반환한다."""
    bucket = 'local-audit-fixture'
    host = 'local-audit-fixture.s3.ap-northeast-2.amazonaws.com'
    public_base = 'https://' + host
    def __init__(self, forbidden=False):
        self.forbidden = forbidden
        self.operations = []

    def get(self, path='/', params=None, method='GET', **kwargs):
        self.operations.append((path, params, method))
        if self.forbidden:
            return 403, b'<Error><Code>AccessDenied</Code></Error>', {}
        if params and 'list-type' in params:
            prefix = params['prefix']
            return 200, ('<ListBucketResult><Contents><Key>' + prefix + 'synthetic.png</Key></Contents></ListBucketResult>').encode(), {}
        if method == 'HEAD':
            return 200, b'', {}
        if params and 'policy' in params:
            return 200, json.dumps({'Statement': []}).encode(), {}
        if path.startswith('/2020-05-31/'):
            return 200, b'<DistributionList><Items/></DistributionList>', {}
        return 200, b'<Configuration/>', {}

    def anonymous_head(self, url):
        return {'httpStatus': 403, 'publiclyReadable': False, 'cloudFrontHeader': False}


class PrivateAuditTest(unittest.TestCase):
    def test_existing_object_is_only_checked_with_head(self):
        reader = Reader()
        result = audit.summarize(reader)
        self.assertTrue(result['readOnly'])
        self.assertFalse(result['objectContentsRead'])
        self.assertEqual(3, sum(method == 'HEAD' for _, _, method in reader.operations))
        self.assertFalse(any(path.endswith('.png') and method != 'HEAD' and params != {'acl': ''}
                             for path, params, method in reader.operations))
        self.assertNotIn('synthetic.png', json.dumps(result))

    def test_access_denied_is_not_reported_as_proven_private(self):
        result = audit.summarize(Reader(True))
        for prefix in result['prefixes'].values():
            self.assertEqual(403, prefix['listHttpStatus'])
            self.assertNotIn('anonymousS3', prefix)
        self.assertEqual(403, result['configuration']['bucketPolicy']['httpStatus'])

    def test_write_operations_are_rejected_before_network_or_credentials(self):
        reader = audit.AwsReader.__new__(audit.AwsReader)
        with self.assertRaisesRegex(ValueError, 'READ_ONLY'):
            reader.get(method='PUT')


if __name__ == '__main__':
    unittest.main()
