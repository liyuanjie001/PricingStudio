import { initialState, migrateLegacy, restoreState } from './domain';
import type { StudioState } from './domain';

export const STORAGE_KEY = 'pricing-studio:v2';
export const LEGACY_KEY = 'pricing-studio:v1';
export const BACKUP_KEY = 'pricing-studio:v1:backup';
export interface LoadedState { state: StudioState; error: string; notice: string }

export function loadState(storage: Storage): LoadedState {
  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current !== null) return { state: restoreState(current), error: '', notice: '' };
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy === null) return { state: initialState(), error: '', notice: '' };
    const { state, adjusted } = migrateLegacy(legacy);
    const notice = `旧方案已迁移：保留价格与目标毛利率，按 ¥0.2／积分重新计算。原始数据已保留。${adjusted ? `其中 ${adjusted} 个不适用的目标毛利率已改为 35%，请检查。` : ''}`;
    try {
      if (storage.getItem(BACKUP_KEY) === null) storage.setItem(BACKUP_KEY, legacy);
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return { state, error: '', notice };
    } catch {
      return { state, error: '旧方案已在当前页面转换，但未能写入本地存储。旧版原始数据未删除，请导出 Excel 备份。', notice };
    }
  } catch {
    return { state: initialState(), error: '本地方案无法读取，已临时加载示例。原始数据尚未覆盖；修改或保存后会写入新版数据。', notice: '' };
  }
}
