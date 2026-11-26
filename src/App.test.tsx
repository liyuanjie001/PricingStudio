import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY } from './storage';
import { restoreState } from './domain';

vi.mock('./export', () => ({ exportPlan: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

function example() {
  fireEvent.change(screen.getByLabelText('套餐原价'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('优惠百分比输入'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '40' } });
}

describe('simplified pricing workspace', () => {
  it.each(['套餐原价', '优惠百分比输入', '毛利率', '账号数量', '发放积分', '基础套餐原价'])('preserves %s and the summary container when clearing and retyping', (label) => {
    render(<App />);
    const input = screen.getByLabelText(label) as HTMLInputElement;
    const original = input.value;
    const summary = document.querySelector('.input-validation-summary');
    const budget = screen.getByTestId('budget').textContent;
    const comparison = screen.getByRole('table', { name: '套餐对比数据' });
    input.focus();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByLabelText(label)).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('');
    expect(screen.getByTestId('budget')).toHaveTextContent(budget!);
    expect(document.querySelector('.input-validation-summary')).toBe(summary);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByRole('table', { name: '套餐对比数据' })).toBe(comparison);
    fireEvent.change(input, { target: { value: original } });
    expect(input).toHaveFocus();
    expect(input).toHaveValue(original);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelector('.input-validation-summary')).toBe(summary);
  });
  it('keeps creation on the left and export in the comparison header', async () => {
    render(<App />);
    const comparison = screen.getByRole('region', { name: '全部套餐对比' });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '保存方案' })).not.toBeInTheDocument();
    expect(screen.queryByText('A CLEARER WAY TO PRICE')).not.toBeInTheDocument();
    fireEvent.click(within(comparison).getByRole('button', { name: '导出 Excel' }));
    const { exportPlan } = await import('./export');
    expect(exportPlan).toHaveBeenCalled();
    expect(within(comparison).queryByRole('button', { name: '新增团队套餐' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新增团队套餐' }));
    expect(screen.getByLabelText('团队套餐名称')).toHaveValue('团队套餐 2');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新增个人套餐' }));
    expect(screen.getByLabelText('套餐名称')).toHaveValue('新套餐 5');
    fireEvent.click(within(comparison).getByRole('button', { name: '基础套餐' }));
    expect(screen.getByLabelText('套餐名称')).toHaveValue('基础套餐');
  });
  it('shows credits with units and synchronized video counts in the comparison table', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('套餐原价'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '2' } });
    const input = screen.getByLabelText('基础套餐发放积分');
    expect(input).toHaveValue('740');
    expect(input.closest('td')).toHaveTextContent('积分');
    expect(screen.getByRole('columnheader', { name: '视频个数' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '基础套餐视频个数' })).toHaveTextContent('67 个');
    fireEvent.change(input, { target: { value: '110' } });
    expect(screen.getByRole('cell', { name: '基础套餐视频个数' })).toHaveTextContent('10 个');
    expect(screen.getByTestId('actual-videos')).toHaveTextContent('10 个视频');
    fireEvent.change(screen.getByLabelText('基础套餐毛利率'), { target: { value: '60' } });
    expect(screen.getByRole('cell', { name: '基础套餐视频个数' })).toHaveTextContent('67 个');
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '8' } });
    expect(screen.getByRole('cell', { name: '基础套餐视频个数' })).toHaveTextContent('0 个');
  });
  it('shows only configured video counts and updates them live', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('套餐原价'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '2' } });
    expect(screen.getByTestId('configured-credits')).toHaveTextContent('740');
    expect(screen.getByTestId('configured-videos')).toHaveTextContent('67 个');
    expect(screen.getByTestId('actual-videos')).toHaveTextContent('67 个视频');
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '110' } });
    expect(screen.getByTestId('configured-videos')).toHaveTextContent('10 个');
    expect(screen.getByTestId('actual-videos')).toHaveTextContent('10 个视频');
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '60' } });
    expect(screen.getByTestId('actual-videos')).toHaveTextContent('67 个视频');
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '8' } });
    expect(screen.getByTestId('configured-videos')).toHaveTextContent('0 个');
    expect(screen.getByTestId('actual-videos')).toHaveTextContent('0 个视频');
  });
  it('edits account quantity and synchronizes budgets, credits and the comparison table', () => {
    render(<App />); example();
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '1' } });
    expect(screen.getByTestId('account-cost')).toHaveTextContent('26.00');
    expect(screen.getByTestId('credit-budget')).toHaveTextContent('28.00');
    expect(screen.getByTestId('configured-credits')).toHaveTextContent('140');
    expect(screen.getByTestId('actual-cost')).toHaveTextContent('54.00');
    expect(screen.getByLabelText('基础套餐账号数量')).toHaveValue('1');
    fireEvent.change(screen.getByLabelText('基础套餐账号数量'), { target: { value: '2' } });
    expect(screen.getByLabelText('账号数量')).toHaveValue('2');
    expect(screen.getByLabelText('发放积分')).toHaveValue('10');
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '3' } });
    expect(screen.getByTestId('actual-cost')).toHaveTextContent('78.00');
    expect(screen.getByLabelText('发放积分')).toHaveValue('0');
    expect(screen.getByLabelText('毛利率')).toHaveValue('13.33');
  });
  it('validates and persists account quantities without overwriting manual credits', () => {
    const view = render(<App />); example();
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '1' } });
    expect(screen.getByLabelText('发放积分')).toHaveValue('300');
    expect(screen.getByTestId('actual-cost')).toHaveTextContent('86.00');
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '1.5' } });
    expect(screen.getByLabelText('账号数量')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('account-cost')).toHaveTextContent('26.00');
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '2' } });
    fireEvent(window, new Event('pagehide'));
    view.unmount(); render(<App />);
    expect(screen.getByLabelText('账号数量')).toHaveValue('2');
    expect(screen.getByLabelText('发放积分')).toHaveValue('300');
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '40' } });
    expect(screen.getByLabelText('发放积分')).toHaveValue('10');
  });
  it('copies account configurations independently', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: '复制基础套餐' }));
    expect(screen.getByLabelText('账号数量')).toHaveValue('2');
    fireEvent.change(screen.getByLabelText('账号数量'), { target: { value: '1' } });
    expect(screen.getByLabelText('基础套餐账号数量')).toHaveValue('2');
  });
  it('shows the agreed calculation and removes the old cost/quantity workflow', () => {
    render(<App />); example();
    expect(screen.getByTestId('budget')).toHaveTextContent('54.00');
    expect(screen.getByTestId('configured-credits')).toHaveTextContent('270');
    expect(screen.getByTestId('actual-profit')).toHaveTextContent('36.00');
    expect(screen.getByLabelText('发放积分')).toHaveValue('270');
    expect(screen.queryByText('固定成本')).not.toBeInTheDocument(); expect(screen.queryByLabelText('销售数量')).not.toBeInTheDocument();
    expect(screen.getByLabelText('基础套餐发放积分')).toHaveValue('270');
  });
  it('retains manual credits across changes, then resumes automatic suggestions', () => {
    render(<App />); example();
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '300' } });
    expect(screen.getByTestId('actual-cost')).toHaveTextContent('60.00');
    expect(screen.getByLabelText('毛利率')).toHaveValue('33.33');
    fireEvent.change(screen.getByLabelText('套餐原价'), { target: { value: '200' } });
    expect(screen.getByLabelText('发放积分')).toHaveValue('300'); expect(screen.getByTestId('configured-credits')).toHaveTextContent('300');
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '40' } });
    expect(screen.getByLabelText('发放积分')).toHaveValue('540');
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '50' } });
    expect(screen.getByLabelText('发放积分')).toHaveValue('450');
  });
  it('preserves typing and focus when automatic credits become manual', async () => {
    const user = userEvent.setup(); render(<App />);
    const input = screen.getByLabelText('发放积分'); await user.clear(input); await user.type(input, '300');
    expect(input).toHaveFocus(); expect(input).toHaveValue('300');
    expect(screen.queryByText('已手动调整')).not.toBeInTheDocument();
  });
  it('recovers a cleared invalid credit input when the margin is edited', () => {
    render(<App />); example();
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('请修正');
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '41' } });
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '40' } });
    expect(screen.getByLabelText('发放积分')).toHaveValue('270'); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('synchronizes sliders and clears superseded invalid input', () => {
    render(<App />); fireEvent.change(screen.getByLabelText('优惠百分比输入'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('优惠百分比滑块'), { target: { value: '10' } });
    expect(screen.getByLabelText('优惠百分比输入')).toHaveValue('10'); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('优惠 10% = 9 折')).toBeInTheDocument();
  });
  it('updates scheme-wide conversion rate without changing manual grants', () => {
    render(<App />); example();
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '300' } });
    fireEvent.click(document.querySelector('.scheme-settings summary')!);
    fireEvent.change(screen.getByLabelText('每积分成本'), { target: { value: '0.1' } });
    expect(screen.getByTestId('configured-credits')).toHaveTextContent('300');
    expect(screen.getByLabelText('发放积分')).toHaveValue('300'); expect(screen.getByTestId('actual-cost')).toHaveTextContent('30.00');
    expect(screen.getByLabelText('标准套餐发放积分')).toHaveValue('1235');
  });
  it('shows an actual loss and undefined margin on a free package with credits', () => {
    render(<App />); fireEvent.change(screen.getByLabelText('套餐原价'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '50' } });
    expect(screen.getByText('已亏损')).toBeInTheDocument(); expect(screen.getByTestId('actual-profit')).toHaveTextContent('-¥10.00');
    expect(screen.getByLabelText('毛利率')).toHaveValue('');
  });
  it('blocks saving bad inputs and keeps the most recent valid results', () => {
    render(<App />); example(); fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: '管理方案' }));
    fireEvent.click(screen.getByRole('button', { name: '另存当前方案' }));
    expect(screen.getByRole('dialog', { name: '我的定价方案' })).toBeInTheDocument(); expect(screen.getByTestId('budget')).toHaveTextContent('54.00');
    fireEvent.click(screen.getByRole('button', { name: '关闭弹窗' }));
    fireEvent.change(screen.getByLabelText('毛利率'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: '管理方案' }));
    fireEvent.click(screen.getByRole('button', { name: '另存当前方案' })); expect(screen.getByRole('dialog', { name: '保存定价方案' })).toBeInTheDocument();
  });
  it('copies and deletes packages without sorting the comparison table', () => {
    render(<App />); fireEvent.click(screen.getByRole('button', { name: '复制基础套餐' }));
    expect(screen.getByRole('button', { name: '基础套餐 · 副本' }).closest('tr')).toHaveClass('selected-row');
    fireEvent.click(screen.getByRole('button', { name: '删除基础套餐 · 副本' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除基础套餐 · 副本' }));
    expect(screen.queryByRole('button', { name: '基础套餐 · 副本' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '成本预算' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '成本预算' })).not.toHaveAttribute('aria-sort');
  });
  it('persists multiple plans, manual credits and per-plan unit costs', async () => {
    const view = render(<App />); example();
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: '管理方案' }));
    fireEvent.click(screen.getByRole('button', { name: '另存当前方案' }));
    fireEvent.change(screen.getByLabelText('方案名称'), { target: { value: '新版方案' } });
    expect(screen.getByLabelText('另存为新方案，保留当前方案')).toBeChecked();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存方案' }));
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toContain('新版方案'));
    const saved = restoreState(localStorage.getItem(STORAGE_KEY)!); expect(saved.plans).toHaveLength(2);
    view.unmount(); render(<App />);
    expect(screen.getByLabelText('切换定价方案')).toHaveDisplayValue('新版方案'); expect(screen.getByLabelText('发放积分')).toHaveValue('300');
  });
  it('starts a blank plan and creates its first package', () => {
    render(<App />); fireEvent.click(screen.getByRole('button', { name: '管理方案' }));
    fireEvent.click(screen.getByRole('button', { name: '新建空白方案' })); expect(screen.getByText('从一个套餐开始')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '创建第一个套餐' })); expect(screen.getByLabelText('套餐原价')).toHaveValue('100');
  });
  it('flushes edits before fast page refresh and reports storage failures', async () => {
    render(<App />); fireEvent.change(screen.getByLabelText('套餐原价'), { target: { value: '234' } });
    fireEvent(window, new Event('pagehide')); expect(restoreState(localStorage.getItem(STORAGE_KEY)!).plans[0].packages[0].listPrice).toBe('234');
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    try {
      fireEvent.change(screen.getByLabelText('套餐原价'), { target: { value: '235' } });
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('本地存储不可用'));
    } finally { write.mockRestore(); }
  });
  it('resets an invalid conversion draft and restores the example packages', () => {
    render(<App />); fireEvent.click(document.querySelector('.scheme-settings summary')!);
    fireEvent.change(screen.getByLabelText('每积分成本'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '重置当前方案' }));
    fireEvent.click(screen.getByRole('button', { name: '确认重置' }));
    expect(screen.getByLabelText('每积分成本')).toHaveValue('0.2'); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
