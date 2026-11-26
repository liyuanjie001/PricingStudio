import { describe, expect, it } from 'vitest';
import { analyze, analyzeTeam, changePackageBilling, createPackage, createTeamPackage, editPackage, editTeamPackage, initialState, restoreState, studioReducer } from './domain';

describe('independent package billing', () => {
  it('converts the selected package once and then edits annual totals directly', () => {
    const p = { ...createPackage('示例', '100', '10', '40'), accountCount: '1' };
    const annual = changePackageBilling(p, 'annual');
    expect(p.listPrice).toBe('100');
    expect(annual.listPrice).toBe('400');
    expect(analyze(annual)).toMatchObject({ salePrice: 360, credits: 560, accountCost: 104, profit: 144, margin: 40, videoCount: 50 });
    expect(changePackageBilling(annual, 'annual')).toBe(annual);
    const edited = editPackage(annual, 'listPrice', '500');
    expect(analyze(edited)).toMatchObject({ salePrice: 450, accountCost: 104, credits: 830 });
    expect(changePackageBilling(edited, 'quarterly').listPrice).toBe('125');
  });
  it('converts team amounts while retaining per-seat allocation and independent quantities', () => {
    const team = editTeamPackage(createTeamPackage(), 'discount', '10');
    const year = changePackageBilling(team, 'annual');
    expect(year.seatPrice).toBe('800');
    expect(analyzeTeam(year)).toMatchObject({ seatCount: 2, seatCredits: 1480, credits: 2960,
      salePrice: 1440, actualCost: 800, accountCost: 208, profit: 640, margin: 400 / 9, videoCount: 268 });
    const enlarged = editTeamPackage(year, 'seatCount', '3');
    expect(analyzeTeam(enlarged)).toMatchObject({ seatCredits: 1480, credits: 4440, salePrice: 2160, actualCost: 1096 });
    expect(analyzeTeam(enlarged).margin).toBeGreaterThan(analyzeTeam(year).margin!);
  });
  it('preserves manual credits and loss on conversion', () => {
    const p = { ...createPackage('免费', '0'), accountCount: '1', manualCredits: '50' };
    expect(analyze(changePackageBilling(p, 'annual'))).toMatchObject({ profit: -144, loss: true, margin: null, credits: 200 });
  });
  it('saves mixed cycles independently and resets only the current plan', () => {
    let state = initialState();
    const first = state.plans[0].packages[0];
    state = studioReducer(state, { type: 'replace', id: first.id, package: changePackageBilling(first, 'annual') });
    const restored = restoreState(JSON.stringify(state));
    expect(restored.plans[0].packages.map(p => p.billingCycle)).toEqual(['annual', 'quarterly', 'quarterly', 'quarterly']);
    expect(restored.plans[0].team.packages[0].billingCycle).toBe('quarterly');
    expect(restored).toEqual(state);
    expect(studioReducer(state, { type: 'reset' }).plans[0].packages.every(p => p.billingCycle === 'quarterly')).toBe(true);
  });
  it('migrates old global annual configuration once without multiplying new packages', () => {
    const legacy = JSON.parse(JSON.stringify(initialState()));
    legacy.plans[0].billingCycle = 'annual';
    for (const p of legacy.plans[0].packages) delete p.billingCycle;
    for (const p of legacy.plans[0].team.packages) { delete p.billingCycle; delete p.fixedSeatCredits; }
    const restored = restoreState(JSON.stringify(legacy));
    expect(restored.plans[0]).not.toHaveProperty('billingCycle');
    expect(restored.plans[0].packages[0]).toMatchObject({ billingCycle: 'annual', listPrice: '400' });
    expect(restored.plans[0].team.packages[0]).toMatchObject({ billingCycle: 'annual', seatPrice: '800', fixedSeatCredits: '1480' });
    expect(restoreState(JSON.stringify(restored))).toEqual(restored);
  });
  it('defaults missing cycles to quarterly and rejects invalid cycles and overflow', () => {
    const legacy = JSON.parse(JSON.stringify(initialState()));
    delete legacy.plans[0].packages[0].billingCycle;
    expect(restoreState(JSON.stringify(legacy)).plans[0].packages[0].billingCycle).toBe('quarterly');
    legacy.plans[0].packages[0].billingCycle = 'weekly';
    expect(() => restoreState(JSON.stringify(legacy))).toThrow('购买周期无效');
    const large = { ...createPackage(), manualCredits: String(Number.MAX_SAFE_INTEGER) };
    expect(() => changePackageBilling(large, 'annual')).toThrow();
  });
});
