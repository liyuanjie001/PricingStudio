import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { analyze, analyzeTeam, changePackageBilling, createPackage, createTeamPackage, editPackage, editTeamPackage, initialState, restoreState, setPackageMargin, setTeamMargin } from './domain';
import { STORAGE_KEY } from './storage';
import { VIDEO_MODELS } from './model-videos';

vi.mock('./export', () => ({ exportPlan: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('unified editable margin calculations', () => {
  it('explicitly reconfigures personal credits, including a repeat of the old allocation target', () => {
    let p = createPackage('测试', '500', '0', '62');
    p = { ...p, accountCount: '2' };
    p = editPackage(p, 'discount', '5');
    expect(analyze(p)).toMatchObject({ credits: 690, actualCost: 190, salePrice: 475, margin: 60 });
    const next = setPackageMargin(p, '62');
    expect(next.manualCredits).toBeNull();
    expect(next.discountCredits).toBeUndefined();
    expect(analyze(next)).toMatchObject({ credits: 642, actualCost: 180.4 });
    expect(analyze(next).margin).toBeCloseTo(62.02105263157895);
    expect(analyze(p).credits).toBe(690);
    const manual = editPackage(next, 'credits', '1000');
    expect(analyze(setPackageMargin(manual, '60')).credits).toBe(690);
  });
  it.each(['quarterly', 'annual'] as const)('reconfigures %s team credits, then keeps them during a discount edit', cycle => {
    const base = changePackageBilling(createTeamPackage(), cycle);
    const discounted = editTeamPackage(base, 'discount', '10');
    const next = setTeamMargin(discounted, '60');
    const a = analyzeTeam(next);
    expect(next.fixedSeatCredits).toBeNull();
    expect(a.margin).toBeGreaterThanOrEqual(60);
    expect(a.margin! - 60).toBeLessThan(0.2);
    expect(analyzeTeam(editTeamPackage(next, 'discount', '20')).seatCredits).toBe(a.seatCredits);
  });
  it('supports negative margins and preserves them through storage restoration', () => {
    const state = initialState();
    state.plans[0].packages[0] = setPackageMargin(createPackage('亏损', '100'), '-20');
    state.plans[0].team.packages[0] = setTeamMargin(createTeamPackage(), '-25');
    const restored = restoreState(JSON.stringify(state));
    expect(analyze(restored.plans[0].packages[0])).toMatchObject({ credits: 600, margin: -20, loss: true });
    expect(analyzeTeam(restored.plans[0].team.packages[0])).toMatchObject({ margin: -25, loss: true });
  });
  it('rejects invalid or undefined margin requests without changing the package', () => {
    const personal = createPackage(), team = createTeamPackage();
    for (const raw of ['100', '101', '', '-', 'NaN']) {
      expect(() => setPackageMargin(personal, raw)).toThrow();
      expect(() => setTeamMargin(team, raw)).toThrow();
    }
    expect(() => setPackageMargin({ ...personal, listPrice: '0' }, '40')).toThrow('实收金额为 0');
    expect(() => setTeamMargin({ ...team, seatPrice: '0' }, '40')).toThrow('实收金额为 0');
    const impossible = setPackageMargin({ ...personal, listPrice: '10', accountCount: '1' }, '90');
    expect(analyze(impossible)).toMatchObject({ credits: 0, margin: -160 });
  });
});

describe('one visible editable margin field', () => {
  it('has one margin column and no allocation mode or duplicate actual-margin fields', () => {
    render(<App />);
    expect(screen.getAllByRole('columnheader', { name: '毛利率' })).toHaveLength(1);
    expect(screen.queryByText('目标毛利率')).not.toBeInTheDocument();
    expect(screen.queryByText('实际毛利率')).not.toBeInTheDocument();
    change('基础套餐优惠', '5');
    expect(screen.queryByText('保持 · 重新计算')).not.toBeInTheDocument();
    expect(screen.queryByText('自动')).not.toBeInTheDocument();
    const row = screen.getByRole('row', { name: '基础套餐对比' });
    expect(within(row).getAllByRole('cell')).toHaveLength(15 + VIDEO_MODELS.length);
    expect(within(row).getAllByRole('textbox', { name: /毛利率/ })).toHaveLength(1);
  });
  it('shows actual personal margin and updates it in either editor and after manual credit changes', () => {
    render(<App />);
    change('套餐原价', '500'); change('账号数量', '2'); change('毛利率', '62');
    change('基础套餐优惠', '5');
    expect(screen.getByLabelText('毛利率')).toHaveValue('60');
    expect(screen.getByLabelText('基础套餐毛利率')).toHaveValue('60');
    change('基础套餐毛利率', '62');
    expect(screen.getByLabelText('基础套餐发放积分')).toHaveValue('642');
    expect(screen.getByLabelText('毛利率')).toHaveValue('62.02');
    fireEvent.blur(screen.getByLabelText('基础套餐毛利率'));
    expect(screen.getByLabelText('基础套餐毛利率')).toHaveValue('62.02');
    change('发放积分', '690');
    expect(screen.getByLabelText('毛利率')).toHaveValue('60');
    expect(screen.getByLabelText('基础套餐毛利率')).toHaveValue('60');
  });
  it('updates team margin after seats and discounts, supports editing it and persists the result', () => {
    const view = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '团队套餐 1' }));
    change('团队套餐 1优惠', '10');
    expect(screen.getByLabelText('团队毛利率')).toHaveValue('44.44');
    expect(screen.getByLabelText('团队套餐 1毛利率')).toHaveValue('44.44');
    change('团队毛利率', '60');
    expect(screen.getByTestId('seat-credits')).toHaveTextContent('230');
    expect(screen.getByLabelText('团队套餐 1毛利率')).toHaveValue('60');
    change('团队套餐 1席位数', '3');
    expect(screen.getByTestId('seat-credits')).toHaveTextContent('230');
    expect(screen.getByLabelText('团队毛利率')).toHaveValue('64.81');
    fireEvent(window, new Event('pagehide')); view.unmount(); render(<App />);
    expect(screen.getByLabelText('团队毛利率')).toHaveValue('64.81');
    expect(restoreState(localStorage.getItem(STORAGE_KEY)!).plans[0].team.packages[0].seatCount).toBe('3');
  });
  it('preserves margin drafts, focus and input identity while updating the other view', async () => {
    const user = userEvent.setup(); render(<App />);
    const input = screen.getByLabelText('毛利率');
    await user.clear(input);
    expect(input).toHaveValue(''); expect(input).toHaveAttribute('aria-invalid', 'true');
    await user.type(input, '62.');
    expect(input).toHaveFocus(); expect(input).toHaveValue('62.');
    expect(screen.getByLabelText('毛利率')).toBe(input);
    expect(screen.getByLabelText('基础套餐毛利率')).toHaveValue('62');
    await user.type(input, '5'); await user.tab();
    expect(input).toHaveValue('62.6');
    expect(screen.getByLabelText('基础套餐毛利率')).toHaveValue('62.6');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('displays negative, 100 percent, and undefined realized margins without falsifying them', () => {
    render(<App />);
    change('发放积分', '1000');
    expect(screen.getByLabelText('毛利率')).toHaveValue('-100');
    change('毛利率', '-20');
    expect(screen.getByLabelText('发放积分')).toHaveValue('600');
    change('发放积分', '0');
    expect(screen.getByLabelText('毛利率')).toHaveValue('100');
    expect(screen.getByLabelText('毛利率')).toHaveAttribute('aria-invalid', 'false');
    change('套餐原价', '0');
    expect(screen.getByLabelText('毛利率')).toHaveValue('');
    expect(screen.getByLabelText('毛利率')).toHaveAttribute('placeholder', '—');
    change('毛利率', '40');
    expect(screen.getByLabelText('毛利率')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('实收金额为 0，请先设置售价后再调整毛利率')).toBeInTheDocument();
  });
});
