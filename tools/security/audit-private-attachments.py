"""API 호스트에서 실행하는 읽기 전용 점검. 키·사진·정책 원문을 출력하거나 파일을 변경하지 않는다."""
import datetime
import fnmatch
import hashlib
import hmac
import ipaddress
import json
import re
import socket
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """인증 요청이나 익명 점검이 다른 서버로 전달되는 것을 막는다."""
    def redirect_request(self, *args, **kwargs):
        return None


def error_code(body):
    match = re.search(br'<Code>([A-Za-z0-9_]+)</Code>', body)
    return match.group(1).decode() if match else 'UNAVAILABLE'


class AwsReader:
    """인스턴스 역할의 단기 자격 증명을 메모리에만 두고 GET/HEAD만 서명한다."""
    def __init__(self):
        inspected = json.loads(subprocess.check_output(['docker', 'inspect', 'spring-api']))[0]
        env = dict(item.split('=', 1) for item in inspected['Config']['Env'] if '=' in item)
        self.region = env['APP_S3_REGION']
        self.bucket = env['APP_S3_BUCKET']
        self.public_base = env.get('APP_S3_PUBLIC_BASE_URL', '')
        if not re.fullmatch(r'[a-z0-9-]+', self.region) or not re.fullmatch(r'[a-z0-9.-]+', self.bucket):
            raise ValueError('UNEXPECTED_STORAGE_CONFIGURATION')
        self.host = self.bucket + '.s3.' + self.region + '.amazonaws.com'
        self.http = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        token = self.http.open(urllib.request.Request('http://169.254.169.254/latest/api/token', method='PUT',
            headers={'X-aws-ec2-metadata-token-ttl-seconds': '60'}), timeout=3).read().decode()
        def metadata(path):
            request = urllib.request.Request('http://169.254.169.254/latest/meta-data/' + path,
                headers={'X-aws-ec2-metadata-token': token})
            return self.http.open(request, timeout=3).read().decode()
        role = metadata('iam/security-credentials/').strip()
        self.credentials = json.loads(metadata('iam/security-credentials/' + role))

    def get(self, path='/', params=None, method='GET', service='s3', host=None):
        if method not in ('GET', 'HEAD'):
            raise ValueError('READ_ONLY_OPERATION_REQUIRED')
        host = host or self.host
        region = self.region if service == 's3' else 'us-east-1'
        query = urllib.parse.urlencode(sorted((params or {}).items()), quote_via=urllib.parse.quote)
        now = datetime.datetime.now(datetime.timezone.utc)
        date, stamp = now.strftime('%Y%m%d'), now.strftime('%Y%m%dT%H%M%SZ')
        payload = hashlib.sha256(b'').hexdigest()
        headers = {'host': host, 'x-amz-date': stamp, 'x-amz-content-sha256': payload,
                   'x-amz-security-token': self.credentials['Token']}
        names = ';'.join(sorted(headers))
        canonical = '\n'.join([method, path, query,
            ''.join(key + ':' + headers[key] + '\n' for key in sorted(headers)), names, payload])
        scope = date + '/' + region + '/' + service + '/aws4_request'
        value = 'AWS4-HMAC-SHA256\n' + stamp + '\n' + scope + '\n' + hashlib.sha256(canonical.encode()).hexdigest()
        key = ('AWS4' + self.credentials['SecretAccessKey']).encode()
        for part in (date, region, service, 'aws4_request'):
            key = hmac.new(key, part.encode(), hashlib.sha256).digest()
        signature = hmac.new(key, value.encode(), hashlib.sha256).hexdigest()
        headers['Authorization'] = 'AWS4-HMAC-SHA256 Credential=' + self.credentials['AccessKeyId'] + '/' + scope + ', SignedHeaders=' + names + ', Signature=' + signature
        url = 'https://' + host + path + ('?' + query if query else '')
        return self.request(urllib.request.Request(url, headers=headers, method=method))

    def request(self, request):
        try:
            response = self.http.open(request, timeout=12)
            return response.status, response.read(65536), response.headers
        except urllib.error.HTTPError as error:
            return error.code, error.read(65536), error.headers

    def anonymous_head(self, url):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
            return {'skipped': 'INVALID_PUBLIC_ENDPOINT'}
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            return {'skipped': 'NON_PUBLIC_ENDPOINT'}
        code, _, headers = self.request(urllib.request.Request(url, method='HEAD'))
        return {'httpStatus': code, 'publiclyReadable': code == 200,
                'cloudFrontHeader': bool(headers.get('X-Amz-Cf-Id'))}


def summarize(reader):
    """설정 조회 권한이 없으면 미확인으로 남긴다. 표본의 403을 전체 파일 비공개로 단정하지 않는다."""
    report = {'readOnly': True, 'objectContentsRead': False, 'prefixes': {}, 'configuration': {}}
    for name, params in (
            ('blockPublicAccess', {'publicAccessBlock': ''}), ('policyStatus', {'policyStatus': ''}),
            ('bucketAcl', {'acl': ''}), ('ownershipControls', {'ownershipControls': ''}), ('bucketPolicy', {'policy': ''})):
        code, body, _ = reader.get(params=params)
        result = {'httpStatus': code}
        if code >= 400:
            result['errorCode'] = error_code(body)
        elif name == 'bucketPolicy':
            statements = json.loads(body).get('Statement', [])
            if isinstance(statements, dict):
                statements = [statements]
            result['statements'] = len(statements)
            possible = set()
            for statement in statements:
                principal = statement.get('Principal')
                if statement.get('Effect') != 'Allow' or not (principal == '*' or isinstance(principal, dict) and principal.get('AWS') in ('*', ['*'])):
                    continue
                actions = statement.get('Action', [])
                resources = statement.get('Resource', [])
                actions = [actions] if isinstance(actions, str) else actions
                resources = [resources] if isinstance(resources, str) else resources
                if any(fnmatch.fnmatchcase('s3:getobject', action.lower()) for action in actions):
                    for prefix in ('notes', 'profiles', 'jars'):
                        sample = 'arn:aws:s3:::' + reader.bucket + '/' + prefix + '/_audit_example_'
                        if any(fnmatch.fnmatchcase(sample, resource) for resource in resources):
                            possible.add(prefix)
            result['potentialWildcardReadPrefixes'] = sorted(possible)
        else:
            root = ET.fromstring(body)
            if name == 'blockPublicAccess':
                result['flags'] = {tag: root.findtext('.//{*}' + tag) for tag in (
                    'BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets')}
            elif name == 'policyStatus':
                result['isPublic'] = root.findtext('.//{*}IsPublic')
            elif name == 'bucketAcl':
                result['publicGrantees'] = sum(1 for item in root.findall('.//{*}URI')
                    if item.text and item.text.endswith(('/AllUsers', '/AuthenticatedUsers')))
            elif name == 'ownershipControls':
                result['ownership'] = root.findtext('.//{*}ObjectOwnership')
        report['configuration'][name] = result

    for prefix in ('notes', 'profiles', 'jars'):
        code, body, _ = reader.get(params={'list-type': '2', 'prefix': prefix + '/', 'max-keys': '5'})
        result = {'listHttpStatus': code}
        if code == 200:
            keys = [item.text for item in ET.fromstring(body).findall('.//{*}Contents/{*}Key')
                    if item.text and not item.text.endswith('/') and '.pending' not in item.text]
            if keys:
                key = keys[0]
                encoded = urllib.parse.quote(key, safe='/')
                signed, _, _ = reader.get('/' + encoded, method='HEAD')
                result['signedHeadHttpStatus'] = signed
                result['anonymousS3'] = reader.anonymous_head('https://' + reader.host + '/' + encoded)
                acl_status, acl_body, _ = reader.get('/' + encoded, {'acl': ''})
                result['objectAclHttpStatus'] = acl_status
                if acl_status == 200:
                    result['objectPublicGrantees'] = sum(1 for item in ET.fromstring(acl_body).findall('.//{*}URI')
                        if item.text and item.text.endswith(('/AllUsers', '/AuthenticatedUsers')))
                if reader.public_base:
                    result['configuredPublicEndpoint'] = reader.anonymous_head(reader.public_base.rstrip('/') + '/' + encoded)
            else:
                result['sampleAvailable'] = False
        else:
            result['errorCode'] = error_code(body)
        report['prefixes'][prefix] = result

    status, body, _ = reader.get('/2020-05-31/distribution', service='cloudfront', host='cloudfront.amazonaws.com')
    report['cloudFrontInventory'] = {'httpStatus': status}
    if status == 200:
        root = ET.fromstring(body)
        matching = []
        for distribution in root.findall('.//{*}DistributionSummary'):
            origins = distribution.findall('.//{*}Origin')
            if any(reader.bucket in (origin.findtext('{*}DomainName') or '') for origin in origins):
                matching.append({'enabled': distribution.findtext('{*}Enabled'),
                    'originsHaveAccessControl': all(bool(origin.findtext('{*}OriginAccessControlId'))
                        or bool(origin.findtext('.//{*}OriginAccessIdentity')) for origin in origins)})
        report['cloudFrontInventory']['matchingDistributions'] = matching
    else:
        report['cloudFrontInventory']['errorCode'] = error_code(body)
    report['coverage'] = 'At most one existing object per prefix; configuration permission failures remain unverified.'
    return report


if __name__ == '__main__':
    try:
        print(json.dumps(summarize(AwsReader()), sort_keys=True))
    except Exception as error:
        # AWS 오류 원문·요청 헤더·서명 주소는 출력하지 않는다.
        print(json.dumps({'readOnly': True, 'errorType': type(error).__name__}))
        raise SystemExit(1)
