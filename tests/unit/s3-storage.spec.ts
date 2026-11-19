import { describe, it, expect } from 'vitest';
import { S3StorageProvider } from '../../packages/integrations/src/storage/s3-storage.provider';

describe('S3StorageProvider — Cloud Object Storage & Path Traversal Defense', () => {
  const provider = new S3StorageProvider({
    bucket: 'test-orbit-attachments',
    region: 'us-east-1',
    accessKeyId: 'mock_key',
    secretAccessKey: 'mock_secret',
  });

  it('successfully uploads and downloads object data', async () => {
    const key = 'tenant-123/tickets/attachment-1.png';
    const content = Buffer.from('fake-image-bytes-12345');
    const mimeType = 'image/png';

    const uploadRes = await provider.upload(key, content, mimeType);
    expect(uploadRes.key).toBe(key);
    expect(uploadRes.size).toBe(content.length);

    const exists = await provider.exists(key);
    expect(exists).toBe(true);

    const downloadRes = await provider.download(key);
    expect(downloadRes.buffer.toString()).toBe('fake-image-bytes-12345');
    expect(downloadRes.mimeType).toBe(mimeType);

    await provider.delete(key);
    const existsAfterDelete = await provider.exists(key);
    expect(existsAfterDelete).toBe(false);
  });

  it('rejects path traversal attempts containing directory walking sequences', async () => {
    const maliciousKeys = [
      '../outside.txt',
      'foo/../../etc/passwd',
      'tenant-1/../../../secret.env',
      './local.txt',
    ];

    for (const key of maliciousKeys) {
      await expect(
        provider.upload(key, Buffer.from('test'), 'text/plain')
      ).rejects.toThrow('Security violation: Path traversal detected in storage key');
    }
  });

  it('rejects keys containing null bytes or disallowed characters', async () => {
    await expect(
      provider.upload('evil\0file.png', Buffer.from('test'), 'image/png')
    ).rejects.toThrow('Security violation: Storage key contains null bytes');

    await expect(
      provider.upload('file;rm -rf.png', Buffer.from('test'), 'image/png')
    ).rejects.toThrow('Security violation: Storage key contains disallowed characters');
  });

  it('throws NotFound error when downloading non-existent object', async () => {
    await expect(provider.download('non-existent-key.txt')).rejects.toThrow(
      'Object not found in storage'
    );
  });
});
