import { MemorySession } from '@tawk-agents-sdk/core';

describe('MemorySession', () => {
  let session: InstanceType<typeof MemorySession>;

  beforeEach(() => {
    session = new MemorySession('test-session', 10);
  });

  it('should start with empty history', async () => {
    const history = await session.getHistory();
    expect(history).toEqual([]);
  });

  it('should have a session id', () => {
    expect(session.id).toBe('test-session');
  });

  it('should add messages', async () => {
    await session.addMessages([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]);
    const history = await session.getHistory();
    expect(history).toHaveLength(2);
  });

  it('should preserve message order', async () => {
    await session.addMessages([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Second' },
      { role: 'user', content: 'Third' },
    ]);
    const history = await session.getHistory();
    expect(history[0].content).toBe('First');
    expect(history[1].content).toBe('Second');
    expect(history[2].content).toBe('Third');
  });

  it('should trim messages beyond maxMessages', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));
    await session.addMessages(messages);
    const history = await session.getHistory();
    expect(history.length).toBeLessThanOrEqual(10);
  });

  it('should keep most recent messages when trimming', async () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));
    await session.addMessages(messages);
    const history = await session.getHistory();
    // The last message should be Message 14
    expect(history[history.length - 1].content).toBe('Message 14');
  });

  it('should clear history', async () => {
    await session.addMessages([{ role: 'user', content: 'Hello' }]);
    await session.clear();
    const history = await session.getHistory();
    expect(history).toEqual([]);
  });

  it('should clear metadata on clear', async () => {
    await session.updateMetadata({ key: 'value' });
    await session.clear();
    const meta = await session.getMetadata();
    expect(meta).toEqual({});
  });

  it('should manage metadata', async () => {
    await session.updateMetadata({ key: 'value' });
    const meta = await session.getMetadata();
    expect(meta.key).toBe('value');
  });

  it('should merge metadata on update', async () => {
    await session.updateMetadata({ key1: 'value1' });
    await session.updateMetadata({ key2: 'value2' });
    const meta = await session.getMetadata();
    expect(meta.key1).toBe('value1');
    expect(meta.key2).toBe('value2');
  });

  it('should override existing metadata keys', async () => {
    await session.updateMetadata({ key: 'old' });
    await session.updateMetadata({ key: 'new' });
    const meta = await session.getMetadata();
    expect(meta.key).toBe('new');
  });

  it('should return a copy of metadata (not reference)', async () => {
    await session.updateMetadata({ key: 'value' });
    const meta1 = await session.getMetadata();
    meta1.key = 'modified';
    const meta2 = await session.getMetadata();
    expect(meta2.key).toBe('value');
  });

  it('should work without maxMessages limit', async () => {
    const unlimitedSession = new MemorySession('unlimited');
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: 'user' as const,
      content: `Message ${i}`,
    }));
    await unlimitedSession.addMessages(messages);
    const history = await unlimitedSession.getHistory();
    expect(history).toHaveLength(100);
  });

  it('should accumulate messages across multiple addMessages calls', async () => {
    await session.addMessages([{ role: 'user', content: 'First' }]);
    await session.addMessages([{ role: 'assistant', content: 'Second' }]);
    const history = await session.getHistory();
    expect(history).toHaveLength(2);
  });
});
