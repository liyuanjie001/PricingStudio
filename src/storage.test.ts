import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_KEY, LEGACY_KEY, loadState, STORAGE_KEY } from './storage';
import { initialState } from './domain';

const legacy = JSON.stringify({ version: 1, activeId: 'plan', plans: [{ id: 'plan', name: '旧方案', selectedId: 'p', packages: [{ id: 'p', name: '旧套餐', listPrice: '100', discount: '10', targetMargin: '40' }] }] });
beforeEach(() => localStorage.clear());
describe('local migration and recovery', () => {
  it('loads sample data on the first visit', () => expect(loadState(localStorage).state.plans[0].packages).toHaveLength(4));
  it('backs up and preserves legacy data before writing the new version', () => {
    localStorage.setItem(LEGACY_KEY, legacy); const loaded = loadState(localStorage);
    expect(localStorage.getItem(LEGACY_KEY)).toBe(legacy); expect(localStorage.getItem(BACKUP_KEY)).toBe(legacy);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).version).toBe(2); expect(loaded.notice).toContain('旧方案已迁移');
  });
  it('does not overwrite an existing legacy backup or migrate twice', () => {
    localStorage.setItem(BACKUP_KEY, 'older backup'); localStorage.setItem(LEGACY_KEY, legacy);
    loadState(localStorage); expect(localStorage.getItem(BACKUP_KEY)).toBe('older backup');
    expect(loadState(localStorage).notice).toBe('');
  });
  it('prefers saved v2 state over legacy data', () => {
    const s = initialState(); s.plans[0].name = '新数据';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); localStorage.setItem(LEGACY_KEY, legacy);
    expect(loadState(localStorage).state.plans[0].name).toBe('新数据');
  });
  it('preserves damaged storage until the user changes data', () => {
    localStorage.setItem(STORAGE_KEY, 'broken');
    expect(loadState(localStorage).error).toContain('原始数据尚未覆盖'); expect(localStorage.getItem(STORAGE_KEY)).toBe('broken');
  });
  it('keeps migrated data usable even if storage is full', () => {
    localStorage.setItem(LEGACY_KEY, legacy); const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    try { const loaded = loadState(localStorage); expect(loaded.state.plans[0].name).toBe('旧方案'); expect(loaded.error).toContain('未能写入'); expect(localStorage.getItem(LEGACY_KEY)).toBe(legacy); }
    finally { write.mockRestore(); }
  });
});
