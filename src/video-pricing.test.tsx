import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { analyze, analyzeTeam, changePackageBilling, createPackage, createTeamPackage, forBillingCycle, restoreState } from './domain';
import { STORAGE_KEY } from './storage';

vi.mock('./export', () => ({ exportPlan: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('video unit price', () => {
  it('uses discounted revenue and issued whole videos, not the budget or recommended videos', () => {
    const p = { ...createPackage('测试', '500', '10', '40'), manualCredits: '110' };
    expect(analyze(p)).toMatchObject({ salePrice: 450, videoCount: 10, videoUnitPrice: 45 });
    expect(analyze({ ...p, manualCredits: '10' }).videoUnitPrice).toBeNull();
    expect(analyze({ ...p, listPrice: '0' }).videoUnitPrice).toBe(0);
  });
  it('divides by the sum of per-seat whole videos, including annual packages', () => {
    const p = { ...createTeamPackage(), seatCount: '3', fixedSeatCredits: '21' };
    const a = analyzeTeam(p);
    expect(a).toMatchObject({ credits: 63, videoCount: 3, videoUnitPrice: 200 });
    const year = analyzeTeam(changePackageBilling(p, 'annual'));
    expect(year.videoUnitPrice).toBeCloseTo(year.salePrice / year.videoCount);
    expect(analyzeTeam({ ...p, fixedSeatCredits: '10' }).videoUnitPrice).toBeNull();
    expect(forBillingCycle(a, 'annual').videoUnitPrice).toBe(200);
  });
  it('renders immediately after video count and updates on edits', () => {
    render(<App />);
    change('套餐原价', '500'); change('优惠百分比输入', '10'); change('发放积分', '110');
    const videos = screen.getByRole('cell', { name: '基础套餐视频个数' });
    const price = screen.getByRole('cell', { name: '基础套餐视频单价' });
    expect(videos.nextElementSibling).toBe(price);
    expect(price).toHaveTextContent('¥45.00');
    change('基础套餐优惠', '20'); expect(price).toHaveTextContent('¥40.00');
    change('基础套餐发放积分', '0'); expect(price).toHaveTextContent('—');
  });
});

describe('editable team comparison', () => {
  it('shows total and per-person whole videos, preserving per-person counts when seats change', () => {
    render(<App />);
    const cell = screen.getByRole('cell', { name: '团队套餐 1视频个数' });
    expect(within(cell).getByText('66 个')).toBeInTheDocument();
    expect(within(cell).getByText('33 个 / 人')).toHaveClass('table-hint');
    change('团队套餐 1席位数', '3');
    expect(within(cell).getByText('99 个')).toBeInTheDocument();
    expect(within(cell).getByText('33 个 / 人')).toBeInTheDocument();
    change('团队套餐 1优惠', '10');
    expect(within(cell).getByText('99 个')).toBeInTheDocument();
    expect(within(cell).getByText('33 个 / 人')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '团队套餐 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /按年购买/ }));
    expect(within(cell).getByText('402 个')).toBeInTheDocument();
    expect(within(cell).getByText('134 个 / 人')).toBeInTheDocument();
    change('团队套餐 1每席原价', '0');
    expect(within(cell).getByText('0 个')).toBeInTheDocument();
    expect(within(cell).getByText('0 个 / 人')).toBeInTheDocument();
  });
  it('edits all pricing drivers without switching the current editor and persists them', () => {
    const view = render(<App />);
    change('团队套餐 1每席原价', '300');
    change('团队套餐 1优惠', '10');
    change('团队套餐 1毛利率', '60');
    change('团队套餐 1账号数量', '1');
    change('团队套餐 1席位数', '3');
    expect(screen.getByLabelText('套餐名称')).toHaveValue('基础套餐');
    const row = screen.getByRole('row', { name: '团队套餐 1对比' });
    expect(within(row).getByRole('cell', { name: '团队套餐 1视频个数' })).toHaveTextContent('129 个');
    expect(within(row).getByRole('cell', { name: '团队套餐 1视频单价' })).toHaveTextContent('¥6.28');
    fireEvent(window, new Event('pagehide'));
    const plan = restoreState(localStorage.getItem(STORAGE_KEY)!).plans[0];
    expect(plan.team.packages[0]).toMatchObject({ seatPrice: '300', discount: '10', targetMargin: '60', accountCount: '1', seatCount: '3', fixedSeatCredits: '475' });
    view.unmount(); render(<App />);
    expect(screen.getByLabelText('团队套餐 1每席原价')).toHaveValue('300');
    expect(screen.getByRole('cell', { name: '团队套餐 1视频单价' })).toHaveTextContent('¥6.28');
  });
  it('synchronizes both editors and preserves per-seat credits when changing seats', () => {
    render(<App />); fireEvent.click(screen.getByRole('button', { name: '团队套餐 1' }));
    expect(screen.getByTestId('seat-credits')).toHaveTextContent('370');
    change('团队套餐 1席位数', '4');
    expect(screen.getByLabelText('套餐席位数')).toHaveValue('4');
    expect(screen.getByTestId('seat-credits')).toHaveTextContent('370');
    expect(screen.getByRole('cell', { name: '团队套餐 1视频个数' })).toHaveTextContent('132 个');
    change('团队套餐 1每席原价', '300');
    expect(screen.getByLabelText('每席原价')).toHaveValue('300');
    change('团队套餐优惠', '10'); expect(screen.getByLabelText('团队套餐 1优惠')).toHaveValue('10');
  });
  it.each(['团队套餐 1每席原价', '团队套餐 1席位数', '团队套餐 1优惠', '团队套餐 1毛利率', '团队套餐 1账号数量'])('keeps focus and DOM stable while clearing %s', label => {
    render(<App />);
    const input = screen.getByLabelText(label) as HTMLInputElement, value = input.value;
    const price = screen.getByRole('cell', { name: '团队套餐 1视频单价' }).textContent;
    input.focus(); change(label, '');
    expect(input).toHaveFocus(); expect(screen.getByLabelText(label)).toBe(input);
    expect(input).toHaveValue(''); expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('cell', { name: '团队套餐 1视频单价' })).toHaveTextContent(price!);
    change(label, value); expect(input).toHaveFocus(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('rejects invalid team inputs without replacing valid calculations', () => {
    render(<App />);
    change('团队套餐 1每席原价', '300');
    for (const [label, invalid] of [['团队套餐 1席位数', '1'], ['团队套餐 1优惠', '100'], ['团队套餐 1毛利率', '100'], ['团队套餐 1账号数量', '1.5']]) {
      change(label, invalid); expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }
    fireEvent(window, new Event('pagehide'));
    const team = restoreState(localStorage.getItem(STORAGE_KEY)!);
    expect(team.plans[0].team.packages[0]).toMatchObject({ seatCount: '2', discount: '0', targetMargin: '50', accountCount: '2' });
  });
});
