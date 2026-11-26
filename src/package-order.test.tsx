import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { initialState, orderedPackages, restoreState } from './domain';
import { STORAGE_KEY } from './storage';

vi.mock('./export', () => ({ exportPlan: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const rowNames = () => within(screen.getByRole('table', { name: '套餐对比数据' }))
  .getAllByRole('row').slice(1).map(row => row.getAttribute('aria-label'));

const expectSequentialNumbers = () => {
  const rows = within(screen.getByRole('table', { name: '套餐对比数据' })).getAllByRole('row').slice(1);
  rows.forEach((row, index) => expect(within(row).getByLabelText(`套餐编号 ${index + 1}`)).toHaveTextContent(String(index + 1)));
};

it('keeps mixed editions in insertion order through edits, copies, deletion and reload', () => {
  const view = render(<App />);
  const original = rowNames();
  fireEvent.click(screen.getByRole('button', { name: '新增团队套餐' }));
  fireEvent.click(screen.getByRole('button', { name: '保存套餐' }));
  fireEvent.click(screen.getByRole('button', { name: '新增个人套餐' }));
  fireEvent.click(screen.getByRole('button', { name: '保存套餐' }));
  fireEvent.click(screen.getByRole('button', { name: '复制基础套餐' }));
  const expected = [...original, '团队套餐 2对比', '新套餐 5对比', '基础套餐 · 副本对比'];
  expect(rowNames()).toEqual(expected);
  expectSequentialNumbers();
  fireEvent.change(screen.getByLabelText('基础套餐原价'), { target: { value: '9000' } });
  fireEvent.change(screen.getByLabelText('基础套餐优惠'), { target: { value: '80' } });
  fireEvent.change(screen.getByLabelText('基础套餐毛利率'), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText('团队套餐 2每席原价'), { target: { value: '50' } });
  expect(rowNames()).toEqual(expected);
  expect(screen.queryByLabelText('套餐排序')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '成本预算' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '删除基础套餐 · 副本' }));
  fireEvent.click(screen.getByRole('button', { name: '确认删除基础套餐 · 副本' }));
  expect(rowNames()).toEqual(expected.slice(0, -1));
  expectSequentialNumbers();
  fireEvent(window, new Event('pagehide'));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).plans[0].packageOrder).toHaveLength(expected.length - 1);
  view.unmount();
  render(<App />);
  expect(rowNames()).toEqual(expected.slice(0, -1));
  expectSequentialNumbers();
});

it('copies team rows with their full configuration, selects the copy and persists independent edits', () => {
  const state = initialState();
  const team = state.plans[0].team;
  const original = { ...team.packages[0], billingCycle: 'annual' as const, seatPrice: '1200', seatCount: '4', accountCount: '2', discount: '15', fixedSeatCredits: '1000' };
  team.packages = [original];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const view = render(<App />);
  const table = within(screen.getByRole('table', { name: '套餐对比数据' }));
  fireEvent.click(table.getByRole('button', { name: `复制${original.name}` }));
  expect(rowNames().at(-1)).toBe(`${original.name} · 副本对比`);
  expectSequentialNumbers();
  const copyRow = table.getByRole('row', { name: `${original.name} · 副本对比` });
  expect(copyRow).toHaveAttribute('aria-current', 'true');
  expect(screen.getByLabelText('团队套餐名称')).toHaveValue(`${original.name} · 副本`);
  expect(screen.getByLabelText('每席原价')).toHaveValue('1200');
  expect(screen.getByTestId('seat-credits')).toHaveTextContent('1,000');
  fireEvent.change(screen.getByLabelText('团队套餐优惠'), { target: { value: '20' } });
  fireEvent(window, new Event('pagehide'));
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!).plans[0].team;
  expect(stored.packages[0]).toEqual(original);
  expect(stored.packages[1]).toEqual({ ...original, id: expect.any(String), name: `${original.name} · 副本`, discount: '20' });
  expect(stored.packages[1].id).not.toBe(original.id);
  view.unmount();
  render(<App />);
  expect(screen.getByLabelText('团队套餐优惠')).toHaveValue('20');
  expect(rowNames().at(-1)).toBe(`${original.name} · 副本对比`);
});

it('confirms or cancels team row deletion and keeps a valid editor selection', () => {
  render(<App />);
  const table = within(screen.getByRole('table', { name: '套餐对比数据' }));
  expect(table.getByRole('button', { name: '删除团队套餐 1' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '新增团队套餐' }));
  fireEvent.click(screen.getByRole('button', { name: '保存套餐' }));
  fireEvent.click(table.getByRole('button', { name: '删除团队套餐 1' }));
  fireEvent.click(table.getByRole('button', { name: '取消删除' }));
  expect(table.getByRole('row', { name: '团队套餐 1对比' })).toBeInTheDocument();
  fireEvent.click(table.getByRole('button', { name: '删除团队套餐 1' }));
  fireEvent.click(table.getByRole('button', { name: '确认删除团队套餐 1' }));
  expect(table.queryByRole('row', { name: '团队套餐 1对比' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('团队套餐名称')).toHaveValue('团队套餐 2');
  fireEvent.click(table.getByRole('button', { name: '复制团队套餐 2' }));
  fireEvent.click(table.getByRole('button', { name: '删除团队套餐 2 · 副本' }));
  fireEvent.click(table.getByRole('button', { name: '确认删除团队套餐 2 · 副本' }));
  expect(screen.getByLabelText('团队套餐名称')).toHaveValue('团队套餐 2');
  expect(table.getByRole('row', { name: '团队套餐 2对比' })).toHaveAttribute('aria-current', 'true');
  expect(table.getByRole('button', { name: '删除团队套餐 2' })).toBeDisabled();
  expectSequentialNumbers();
});

it('preserves legacy array order and safely normalizes obsolete or duplicate order entries', () => {
  const state = initialState(), plan = state.plans[0];
  const original = orderedPackages(plan).map(entry => entry.key);
  const restored = restoreState(JSON.stringify(state));
  expect(restored.plans[0].packageOrder).toEqual(original);
  plan.packageOrder = [original[4], 'personal:removed', original[4], original[0]];
  const repaired = restoreState(JSON.stringify(state)).plans[0];
  expect(repaired.packageOrder).toEqual([original[4], original[0], ...original.slice(1, 4)]);
});
