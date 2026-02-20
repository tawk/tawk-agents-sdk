import { validateUrl } from '../../../src/helpers/safe-fetch';

describe('safe-fetch', () => {
  describe('validateUrl', () => {
    it('should allow valid HTTPS URLs', () => {
      expect(() => validateUrl('https://api.example.com/data')).not.toThrow();
    });

    it('should block HTTP URLs by default', () => {
      expect(() => validateUrl('http://api.example.com/data')).toThrow('HTTPS');
    });

    it('should allow HTTP when explicitly enabled', () => {
      expect(() =>
        validateUrl('http://api.example.com/data', { allowHttp: true })
      ).not.toThrow();
    });

    it('should block localhost', () => {
      expect(() => validateUrl('https://localhost/data')).toThrow('private');
    });

    it('should block 127.0.0.1', () => {
      expect(() => validateUrl('https://127.0.0.1/data')).toThrow('private');
    });

    it('should block AWS metadata endpoint (169.254.169.254)', () => {
      expect(() => validateUrl('https://169.254.169.254/latest')).toThrow('private');
    });

    it('should block private 10.x.x.x range', () => {
      expect(() => validateUrl('https://10.0.0.1/internal')).toThrow('private');
    });

    it('should block private 192.168.x.x range', () => {
      expect(() => validateUrl('https://192.168.1.1/router')).toThrow('private');
    });

    it('should block private 172.16-31.x.x range', () => {
      expect(() => validateUrl('https://172.16.0.1/internal')).toThrow('private');
    });

    it('should block IPv6 loopback (::1)', () => {
      expect(() => validateUrl('https://[::1]/data')).toThrow('private');
    });

    it('should block 0.0.0.0', () => {
      expect(() => validateUrl('https://0.0.0.0/data')).toThrow('private');
    });

    it('should enforce allowedHosts', () => {
      expect(() =>
        validateUrl('https://evil.com/data', { allowedHosts: ['api.safe.com'] })
      ).toThrow('allowlist');
      expect(() =>
        validateUrl('https://api.safe.com/data', { allowedHosts: ['api.safe.com'] })
      ).not.toThrow();
    });

    it('should throw on invalid URLs', () => {
      expect(() => validateUrl('not-a-url')).toThrow();
    });

    it('should allow public IP addresses', () => {
      expect(() => validateUrl('https://8.8.8.8/dns')).not.toThrow();
    });
  });
});
