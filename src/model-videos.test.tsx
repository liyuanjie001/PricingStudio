import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { analyze, analyzeTeam, changePackageBilling, createPackage, createTeamPackage, editPackage } from './domain';
import { analyzeModelVideos, VIDEO_MODELS } from './model-videos';
import { ComparisonScroll } from './ComparisonScroll';

vi.mock('./export', () => ({ exportPlan: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('model video prices', () => {
  it('uses the supplied model credits, whole videos and discounted revenue', () => {
    const p = { ...createPackage('模型套餐', '500', '10'), manualCredits: '110' };
    const prices = analyzeModelVideos(analyze(p));
    expect(prices.map(model => model.creditsPerVideo)).toEqual([34, 23, 18, 12, 11]);
    expect(prices.map(model => model.videoCount)).toEqual([3, 4, 6, 9, 10]);
    expect(prices.map(model => model.unitPrice)).toEqual([150, 112.5, 75, 50, 45]);
    const discounted = analyzeModelVideos(analyze(editPackage(p, 'discount', '20')));
    expect(discounted.map(model => model.videoCount)).toEqual([3, 4, 6, 9, 10]);
    expect(discounted[0].unitPrice).toBeCloseTo(400 / 3);
  });

  it('does not pool team seat remainders and respects independently billed annual credits', () => {
    const team = { ...createTeamPackage(), seatCount: '3', fixedSeatCredits: '33' };
    const prices = analyzeModelVideos(analyzeTeam(team));
    expect(prices.map(model => model.videoCount)).toEqual([0, 3, 3, 6, 9]);
    expect(prices[0].unitPrice).toBeNull();
    expect(prices[1].unitPrice).toBe(200);
    const annual = analyzeModelVideos(analyzeTeam(changePackageBilling(team, 'annual')));
    expect(annual[0].videoCount).toBe(9);
    expect(annual[0].unitPrice).toBeCloseTo(2400 / 9);
  });

  it('handles no videos and zero revenue without nonfinite prices', () => {
    expect(analyzeModelVideos({ salePrice: 100, credits: 10 }).every(model => model.unitPrice === null)).toBe(true);
    expect(analyzeModelVideos({ salePrice: 0, credits: 100 }).every(model => model.unitPrice === 0)).toBe(true);
    expect(analyzeModelVideos({ salePrice: 0, credits: 0 }).every(model => model.unitPrice === null)).toBe(true);
  });

  it('places all model columns after actions and updates prices without replacing table rows', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('套餐原价'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('优惠百分比输入'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '110' } });
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader');
    expect(headers[14]).toHaveTextContent('操作');
    VIDEO_MODELS.forEach((model, index) => {
      expect(headers[index + 15]).toHaveTextContent(model.name);
      expect(headers[index + 15]).toHaveTextContent(`${model.creditsPerVideo} 积分 / 个`);
    });
    const row = screen.getByRole('row', { name: '基础套餐对比' });
    const cell = within(row).getByRole('cell', { name: '基础套餐 Seedance 2.5视频单价' });
    expect(within(row).getAllByRole('cell')[15]).toBe(cell);
    expect(cell).toHaveTextContent('¥150.00');
    expect(cell).toHaveTextContent('3 个视频');
    fireEvent.change(screen.getByLabelText('基础套餐优惠'), { target: { value: '20' } });
    expect(cell).toHaveTextContent('¥133.33');
    expect(screen.getByRole('row', { name: '基础套餐对比' })).toBe(row);
    fireEvent.change(screen.getByLabelText('基础套餐发放积分'), { target: { value: '0' } });
    expect(cell).toHaveTextContent('—');
    expect(screen.getByRole('cell', { name: '团队套餐 1 wan 3.0视频单价' })).toHaveTextContent('¥6.06');
  });
});

describe('collapsible calculator and comparison scroll', () => {
  it('preserves input drafts and table state across collapse, expansion and reload', () => {
    const view = render(<App />);
    const input = screen.getByLabelText('套餐原价');
    const toggle = screen.getByRole('button', { name: '收起计算器' });
    expect(toggle.parentElement).toHaveClass('layout-controls');
    expect(toggle.closest('.comparison-panel, .pricing-editor')).toBeNull();
    expect(toggle.parentElement?.nextElementSibling).toHaveClass('studio-layout');
    const region = screen.getByRole('region', { name: '套餐与模型价格横向滚动区' });
    region.scrollLeft = 250;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '收起计算器' }));
    expect(input).not.toBeVisible();
    expect(screen.getByLabelText('切换定价方案')).not.toBeVisible();
    expect(screen.queryByRole('group', { name: '定价版本' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开计算器' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '展开计算器' })).toBe(toggle);
    expect(screen.getByRole('button', { name: '展开计算器' })).toHaveAttribute('aria-controls', 'pricing-editor');
    expect(document.querySelector('.studio-layout')).toHaveClass('calculator-collapsed');
    expect(region.scrollLeft).toBe(250);
    fireEvent.click(screen.getByRole('button', { name: '展开计算器' }));
    expect(screen.getByLabelText('套餐原价')).toBe(input);
    expect(input).toHaveValue('');
    expect(input).toBeVisible();
    expect(screen.getByLabelText('切换定价方案')).toBeVisible();
    expect(screen.getByRole('group', { name: '定价版本' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '收起计算器' }));
    view.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: '展开计算器' })).toBeInTheDocument();
    expect(screen.getByLabelText('套餐原价')).not.toBeVisible();
    expect(screen.getByLabelText('切换定价方案')).not.toBeVisible();
    expect(screen.getAllByRole('row')).toHaveLength(6);
  });

  it('keeps ordinary wheel vertical, uses Shift+wheel horizontally and releases both edges', () => {
    render(<ComparisonScroll><input aria-label="测试输入" /><span>模型单价</span></ComparisonScroll>);
    const region = screen.getByRole('region');
    Object.defineProperties(region, { scrollWidth: { value: 2000 }, clientWidth: { value: 800 } });
    const wheel = (deltaY: number, shiftKey: boolean, target: HTMLElement = region) => {
      const event = new WheelEvent('wheel', { deltaY, shiftKey, bubbles: true, cancelable: true });
      fireEvent(target, event);
      return event;
    };
    expect(wheel(120, false).defaultPrevented).toBe(false);
    expect(region.scrollLeft).toBe(0);
    expect(wheel(120, true).defaultPrevented).toBe(true);
    expect(region.scrollLeft).toBe(120);
    expect(wheel(80, true, screen.getByLabelText('测试输入')).defaultPrevented).toBe(false);
    expect(region.scrollLeft).toBe(120);
    expect(wheel(-50, true).defaultPrevented).toBe(true);
    expect(region.scrollLeft).toBe(70);
    expect(wheel(80, false).defaultPrevented).toBe(false);
    expect(region.scrollLeft).toBe(70);
    region.scrollLeft = 1200;
    expect(wheel(100, true).defaultPrevented).toBe(false);
    region.scrollLeft = 0;
    expect(wheel(-100, true).defaultPrevented).toBe(false);
    const horizontal = new WheelEvent('wheel', { shiftKey: true, deltaX: 50, deltaY: 50, bubbles: true, cancelable: true });
    fireEvent(region, horizontal);
    expect(horizontal.defaultPrevented).toBe(false);
    const zoom = new WheelEvent('wheel', { shiftKey: true, ctrlKey: true, deltaY: 50, bubbles: true, cancelable: true });
    fireEvent(region, zoom);
    expect(zoom.defaultPrevented).toBe(false);
  });
});
