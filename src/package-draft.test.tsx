import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY } from './storage';

vi.mock('./export', () => ({ exportPlan: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const save = () => fireEvent.click(screen.getByRole('button', { name: '保存套餐' }));

it('places creation in the left editor and save below the calculator', () => {
  render(<App />);
  for (const name of ['新增个人套餐', '新增团队套餐']) {
    expect(screen.getByRole('button', { name }).closest('#pricing-editor')).not.toBeNull();
  }
  expect(screen.getByRole('button', { name: '保存套餐' }).closest('.editor-bottom')).not.toBeNull();
  expect(within(screen.getByRole('region', { name: '全部套餐对比' })).queryByRole('button', { name: '新增个人套餐' })).not.toBeInTheDocument();
});

it('keeps new personal pricing out of the table, storage and export until saved', async () => {
  const view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新增个人套餐' }));
  change('套餐名称', '草稿个人');
  change('套餐原价', '600'); change('优惠百分比输入', '10'); change('毛利率', '60');
  change('账号数量', '1');
  expect(rows()).toHaveLength(5);
  expect(screen.queryByRole('row', { name: '草稿个人对比' })).not.toBeInTheDocument();
  fireEvent(window, new Event('pagehide'));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).plans[0].packages).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: '导出 Excel' }));
  const { exportPlan } = await import('./export');
  expect(vi.mocked(exportPlan).mock.calls.at(-1)![0].packages).toHaveLength(4);
  save();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).plans[0].packages).toHaveLength(5);
  const row = screen.getByRole('row', { name: '草稿个人对比' });
  expect(rows().at(-1)).toBe(row);
  expect(row).toHaveAttribute('aria-current', 'true');
  expect(within(row).getByLabelText('草稿个人原价')).toHaveValue('600');
  expect(rows()).toHaveLength(6);
  save(); expect(rows()).toHaveLength(6);
  fireEvent(window, new Event('pagehide'));
  view.unmount(); render(<App />);
  expect(screen.getByRole('row', { name: '草稿个人对比' })).toBeInTheDocument();
  expect(screen.getByLabelText('套餐原价')).toHaveValue('600');
});

it('saves an annual team draft with its seat, discount and credit configuration', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新增团队套餐' }));
  change('团队套餐名称', '草稿团队');
  change('每席原价', '500'); change('套餐席位数', '4'); change('团队毛利率', '60');
  change('团队套餐优惠', '15');
  fireEvent.click(screen.getByRole('checkbox', { name: /按年购买/ }));
  const credits = screen.getByTestId('team-credits').textContent;
  expect(rows()).toHaveLength(5);
  expect(screen.queryByRole('button', { name: '复制团队套餐' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('筛选版本'), { target: { value: 'personal' } });
  fireEvent.change(screen.getByLabelText('筛选周期'), { target: { value: 'quarterly' } });
  save();
  const row = screen.getByRole('row', { name: '草稿团队对比' });
  expect(row).toHaveAttribute('aria-current', 'true');
  expect(within(row).getByText('年付')).toBeInTheDocument();
  expect(screen.getByLabelText('草稿团队每席原价')).toHaveValue('2000');
  expect(screen.getByLabelText('草稿团队席位数')).toHaveValue('4');
  expect(screen.getByTestId('team-credits')).toHaveTextContent(credits!);
  expect(screen.getByLabelText('筛选版本')).toHaveValue('all');
  expect(screen.getByLabelText('筛选周期')).toHaveValue('all');
  fireEvent(window, new Event('pagehide'));
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).plans[0].team.packages.at(-1))
    .toMatchObject({ name: '草稿团队', seatCount: '4', seatPrice: '2000', discount: '15', billingCycle: 'annual' });
});

it('validates draft fields and supports discarding without creating a package', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新增个人套餐' }));
  change('套餐名称', '');
  expect(screen.getByRole('button', { name: '保存套餐' })).toBeDisabled();
  change('套餐名称', '未保存'); change('套餐原价', '');
  expect(screen.getByRole('button', { name: '保存套餐' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '放弃草稿' }));
  expect(rows()).toHaveLength(5);
  expect(screen.getByLabelText('套餐名称')).toHaveValue('基础套餐');
  expect(screen.getByRole('button', { name: '保存套餐' })).toBeEnabled();
});

it('retains separate pending drafts while switching editions and viewing saved packages', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新增个人套餐' }));
  change('套餐名称', '待保存个人'); change('套餐原价', '650');
  fireEvent.click(screen.getByRole('button', { name: '新增团队套餐' }));
  change('团队套餐名称', '待保存团队'); change('每席原价', '720');
  fireEvent.click(screen.getByRole('button', { name: '个人版' }));
  expect(screen.getByLabelText('套餐原价')).toHaveValue('650');
  fireEvent.click(screen.getByRole('button', { name: '基础套餐' }));
  expect(screen.getByLabelText('套餐名称')).toHaveValue('基础套餐');
  fireEvent.click(screen.getByRole('button', { name: '新增个人套餐' }));
  expect(screen.getByLabelText('套餐名称')).toHaveValue('待保存个人');
  expect(rows()).toHaveLength(5);
  save();
  fireEvent.click(screen.getByRole('button', { name: '团队版' }));
  expect(screen.getByLabelText('每席原价')).toHaveValue('720');
  save();
  expect(rows()).toHaveLength(7);
  expect(rows().slice(-2).map(row => row.getAttribute('aria-label'))).toEqual(['待保存个人对比', '待保存团队对比']);
});

it('retains an unpublished draft when browser storage fails and saves it on retry', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新增个人套餐' }));
  change('套餐名称', '保存失败草稿');
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
  save();
  expect(rows()).toHaveLength(5);
  expect(screen.getByLabelText('套餐名称')).toHaveValue('保存失败草稿');
  expect(screen.getByText('套餐保存失败，草稿已保留，请检查浏览器存储后重试。')).toBeInTheDocument();
  write.mockRestore();
  save();
  expect(screen.getByRole('row', { name: '保存失败草稿对比' })).toBeInTheDocument();
});

it('updates a pending allocation when the shared credit cost changes without publishing it', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新增团队套餐' }));
  change('团队套餐优惠', '10');
  expect(screen.getByTestId('seat-credits')).toHaveTextContent('370');
  fireEvent.click(document.querySelector('.scheme-settings summary')!);
  change('每积分成本', '0.4');
  expect(screen.getByTestId('seat-credits')).toHaveTextContent('160');
  expect(rows()).toHaveLength(5);
  save();
  expect(screen.getByLabelText('团队套餐 2优惠')).toHaveValue('10');
  expect(screen.getByTestId('seat-credits')).toHaveTextContent('160');
});
