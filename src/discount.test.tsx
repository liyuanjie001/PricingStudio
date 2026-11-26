import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { analyze, analyzeTeam, changeCreditCost, changePackageBilling, createPackage, createPlan, createTeamPackage, editPackage, editTeamPackage, initialState, restoreState } from './domain';
import { STORAGE_KEY } from './storage';

vi.mock('./export', () => ({ exportPlan: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('discount changes revenue, not the existing allocation', () => {
  it.each(['quarterly', 'annual'] as const)('retains personal credits, videos and cost for %s packages', cycle => {
    let p = changePackageBilling({ ...createPackage('测试', '100', '0', '40'), accountCount: '1' }, cycle);
    const initial = analyze(p);
    for (const discount of ['10', '25.5', '99', '0']) {
      p = editPackage(p, 'discount', discount);
      const next = analyze(p);
      expect(next).toMatchObject({ credits: initial.credits, videoCount: initial.videoCount, actualCost: initial.actualCost, manual: false });
      expect(next.salePrice).toBeCloseTo(initial.listPrice * (1 - Number(discount) / 100));
      expect(next.profit).toBeCloseTo(next.salePrice - initial.actualCost);
      expect(next.videoUnitPrice).toBeCloseTo(next.salePrice / initial.videoCount);
    }
  });
  it.each(['quarterly', 'annual'] as const)('retains team per-seat allocation and cost for %s packages', cycle => {
    let p = changePackageBilling(createTeamPackage(), cycle);
    const initial = analyzeTeam(p);
    for (const discount of ['10', '25.5', '99', '0']) {
      p = editTeamPackage(p, 'discount', discount);
      const next = analyzeTeam(p);
      expect(next).toMatchObject({ seatCredits: initial.seatCredits, credits: initial.credits, videoCount: initial.videoCount, actualCost: initial.actualCost });
      expect(next.profit).toBeCloseTo(next.salePrice - initial.actualCost);
      expect(next.margin).toBeCloseTo(next.profit / next.salePrice * 100);
    }
  });
  it('retains prior nonzero discounts and manual overrides without silently adopting a new recommendation', () => {
    const p = createPackage('旧折扣', '100', '10', '40');
    expect(analyze(editPackage(p, 'discount', '20')).credits).toBe(analyze(p).credits);
    const manual = editPackage(p, 'credits', '500');
    expect(analyze(editPackage(manual, 'discount', '99'))).toMatchObject({ credits: 500, actualCost: 100, profit: -99, manual: true, loss: true });
  });
  it('reconfigures personal allocation when other cost drivers actually change', () => {
    const p = editPackage(createPackage('测试', '100', '0', '40'), 'discount', '10');
    expect(analyze(p).credits).toBe(300);
    expect(editPackage(p, 'targetMargin', '40.0')).toBe(p);
    expect(analyze(editPackage(p, 'targetMargin', '50')).credits).toBe(225);
    expect(analyze(editPackage(p, 'listPrice', '200')).credits).toBe(540);
    expect(analyze(editPackage(p, 'accountCount', '1')).credits).toBe(140);
    const plan = createPlan(); plan.packages = [p];
    expect(changeCreditCost(plan, '0.20')).toBe(plan);
    const next = changeCreditCost(plan, '0.1');
    expect(analyze(next.packages[0], next.creditUnitCost).credits).toBe(540);
  });
  it('keeps team per-seat credits when discount and seat changes are interleaved', () => {
    let p = editTeamPackage(createTeamPackage(), 'seatCount', '5');
    p = editTeamPackage(p, 'discount', '20');
    expect(analyzeTeam(p)).toMatchObject({ seatCredits: 370, credits: 1850, actualCost: 422, salePrice: 800, profit: 378 });
    p = editTeamPackage(p, 'seatCount', '2');
    expect(analyzeTeam(p).seatCredits).toBe(370);
    p = editTeamPackage(p, 'targetMargin', '60');
    expect(analyzeTeam(p)).toMatchObject({ seatCredits: 190, credits: 380, actualCost: 128 });
  });
  it('preserves zero allocations and zero-video safeguards', () => {
    const personal = editPackage({ ...createPackage('零积分', '10'), accountCount: '1' }, 'discount', '99');
    expect(analyze(personal)).toMatchObject({ credits: 0, videoCount: 0, videoUnitPrice: null, loss: true });
    const team = editTeamPackage({ ...createTeamPackage(), seatPrice: '20' }, 'discount', '99');
    expect(analyzeTeam(team)).toMatchObject({ credits: 0, videoCount: 0, videoUnitPrice: null, loss: true });
  });
  it('persists personal allocation holds and scales them when making an annual copy', () => {
    const state = initialState();
    const p = editPackage(state.plans[0].packages[0], 'discount', '10');
    state.plans[0].packages[0] = p;
    const restored = restoreState(JSON.stringify(state));
    expect(analyze(restored.plans[0].packages[0])).toMatchObject({ credits: 350, actualCost: 70, profit: 20 });
    const annual = changePackageBilling(p, 'annual');
    expect(analyze(annual)).toMatchObject({ credits: 1400, actualCost: 280, salePrice: 360, profit: 80 });
    expect(analyze(p).credits).toBe(350);
    state.plans[0].packages[0] = { ...p, discountCredits: '-1' };
    expect(() => restoreState(JSON.stringify(state))).toThrow('折扣保留积分配置无效');
  });
});

describe('discount editing in the calculator and comparison', () => {
  it('keeps personal credits in the hero and table while the discount input and slider change margin', () => {
    const view = render(<App />);
    change('优惠百分比输入', '10');
    expect(screen.getByLabelText('发放积分')).toHaveValue('350');
    expect(screen.getByLabelText('基础套餐发放积分')).toHaveValue('350');
    expect(screen.getByTestId('configured-credits')).toHaveTextContent('350');
    expect(screen.getByTestId('actual-cost')).toHaveTextContent('70.00');
    expect(screen.getByLabelText('毛利率')).toHaveValue('22.22');
    fireEvent.change(screen.getByLabelText('优惠百分比滑块'), { target: { value: '50' } });
    expect(screen.getByTestId('actual-profit')).toHaveTextContent('-¥20.00');
    expect(screen.getByTestId('configured-credits')).toHaveTextContent('350');
    change('基础套餐优惠', '20');
    expect(screen.getByLabelText('发放积分')).toHaveValue('350');
    expect(screen.getByTestId('actual-videos')).toHaveTextContent('31 个');
    expect(screen.getByRole('cell', { name: '基础套餐视频单价' })).toHaveTextContent('¥2.58');
    fireEvent(window, new Event('pagehide')); view.unmount(); render(<App />);
    expect(screen.getByLabelText('发放积分')).toHaveValue('350');
    expect(restoreState(localStorage.getItem(STORAGE_KEY)!).plans[0].packages[0].discountCredits).toBe('350');
    change('毛利率', '30');
    expect(screen.getByLabelText('发放积分')).toHaveValue('280');
    expect(screen.getByTestId('configured-credits')).toHaveTextContent('280');
  });
  it('keeps team credits and costs while editing discounts in either view, including reload', () => {
    const view = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '团队套餐 1' }));
    change('团队套餐优惠', '10');
    expect(screen.getByTestId('team-credits')).toHaveTextContent('740');
    expect(screen.getByTestId('seat-credits')).toHaveTextContent('370');
    expect(screen.getByLabelText('团队毛利率')).toHaveValue('44.44');
    change('团队套餐 1优惠', '50');
    expect(screen.getByTestId('team-actual-cost')).toHaveTextContent('200.00');
    expect(screen.getByLabelText('团队毛利率')).toHaveValue('0');
    expect(screen.getByRole('cell', { name: '团队套餐 1视频个数' })).toHaveTextContent('66 个');
    expect(screen.getByRole('cell', { name: '团队套餐 1视频单价' })).toHaveTextContent('¥3.03');
    fireEvent(window, new Event('pagehide')); view.unmount(); render(<App />);
    expect(screen.getByTestId('seat-credits')).toHaveTextContent('370');
    change('团队套餐 1优惠', '99');
    expect(screen.getByTestId('team-credits')).toHaveTextContent('740');
    expect(screen.getByTestId('team-profit')).toHaveTextContent('-¥196.00');
  });
});
