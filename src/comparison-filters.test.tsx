import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { changePackageBilling, createPackage, createTeamPackage, initialState } from './domain';
import { STORAGE_KEY } from './storage';

vi.mock('./export', () => ({ exportPlan: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => {
  localStorage.clear();
  const state = initialState();
  const plan = state.plans[0];
  const personal = createPackage('个人季付');
  const annual = { ...changePackageBilling(createPackage('个人年付'), 'annual') };
  const team = createTeamPackage('团队季付');
  const teamAnnual = changePackageBilling(createTeamPackage('团队年付'), 'annual');
  plan.packages = [personal, annual];
  plan.team.packages = [team, teamAnnual];
  plan.selectedId = personal.id;
  plan.team.selectedId = team.id;
  plan.packageOrder = [`personal:${personal.id}`, `team:${teamAnnual.id}`, `team:${team.id}`, `personal:${annual.id}`];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
});
afterEach(cleanup);

const filter = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } });
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const names = () => rows().map(row => row.getAttribute('aria-label'));

it('combines version and cycle filters without sorting or renumbering packages', () => {
  render(<App />);
  expect(names()).toEqual(['个人季付对比', '团队年付对比', '团队季付对比', '个人年付对比']);
  filter('筛选周期', 'annual');
  expect(names()).toEqual(['团队年付对比', '个人年付对比']);
  expect(within(rows()[0]).getByLabelText('套餐编号 2')).toBeInTheDocument();
  expect(within(rows()[1]).getByLabelText('套餐编号 4')).toBeInTheDocument();
  filter('筛选版本', 'team');
  expect(names()).toEqual(['团队年付对比']);
  expect(screen.getByText('显示 1 / 4 个套餐')).toBeInTheDocument();
  filter('筛选周期', 'quarterly');
  expect(names()).toEqual(['团队季付对比']);
  filter('筛选版本', 'personal');
  expect(names()).toEqual(['个人季付对比']);
  fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
  expect(names()).toEqual(['个人季付对比', '团队年付对比', '团队季付对比', '个人年付对比']);
  expect(screen.getByLabelText('筛选版本')).toHaveValue('all');
  expect(screen.getByLabelText('筛选周期')).toHaveValue('all');
});

it('preserves editor selection, table input drafts and controls when filtering or collapsing', () => {
  render(<App />);
  const input = screen.getByLabelText('个人季付原价');
  fireEvent.change(input, { target: { value: '' } });
  filter('筛选版本', 'team');
  expect(input).not.toBeVisible();
  expect(screen.getByLabelText('套餐名称')).toHaveValue('个人季付');
  filter('筛选版本', 'all');
  expect(screen.getByLabelText('个人季付原价')).toBe(input);
  expect(input).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '收起计算器' }));
  expect(screen.getByLabelText('筛选版本')).toBeVisible();
  filter('筛选版本', 'team');
  expect(names()).toEqual(['团队年付对比', '团队季付对比']);
});

it('updates matching rows when billing changes and offers recovery from an empty filter', () => {
  render(<App />);
  filter('筛选版本', 'personal');
  filter('筛选周期', 'annual');
  fireEvent.click(screen.getByRole('button', { name: '个人年付' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /按年购买/ }));
  expect(screen.getByText('显示 0 / 4 个套餐')).toBeInTheDocument();
  expect(screen.getByText('没有符合筛选条件的套餐，请调整或清除筛选。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
  expect(rows()).toHaveLength(4);
  expect(screen.queryByText('没有符合筛选条件的套餐，请调整或清除筛选。')).not.toBeInTheDocument();
});
