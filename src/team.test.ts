import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { analyzeTeam, changeCreditCost, createPlan, createTeamPackage, editTeamPackage, initialState, replaceTeamPackage, restoreState, studioReducer } from './domain';

describe('price-first team packages', () => {
  it('allocates an identical credit budget to every seat after shared accounts', () => {
    expect(analyzeTeam(createTeamPackage())).toMatchObject({ seatCount: 2, seatPrice: 200, seatCredits: 370,
      seatCost: 74, seatProfit: 100, seatVideoCount: 33, credits: 740, videoCount: 66,
      listPrice: 400, salePrice: 400, budget: 200, creditBudget: 148, accountCost: 52, actualCost: 200, profit: 200, margin: 50 });
  });
  it('changes quantity without increasing credits per seat', () => {
    const p = editTeamPackage(createTeamPackage(), 'seatCount', '5');
    expect(analyzeTeam(p)).toMatchObject({ seatCount: 5, seatPrice: 200, seatCredits: 370, credits: 1850,
      listPrice: 1000, creditCost: 370, accountCost: 52, profit: 578, margin: 57.8 });
    expect(analyzeTeam(editTeamPackage(p, 'seatCount', '2')).seatCredits).toBe(370);
    expect(analyzeTeam(editTeamPackage(p, 'targetMargin', '60')).seatCredits).toBe(348);
    expect(p).not.toHaveProperty('seats');
    expect(p).not.toHaveProperty('credits');
  });
  it('keeps all packages independent', () => {
    const team = createPlan().team;
    const first = team.packages[0], second = { ...createTeamPackage('专业'), seatPrice: '500', targetMargin: '60', seatCount: '3', discount: '10', accountCount: '5' };
    team.packages.push(second);
    const changed = replaceTeamPackage(team, editTeamPackage(second, 'discount', '20'));
    expect(changed.packages[0]).toEqual(first);
    expect(analyzeTeam(changed.packages[1])).toMatchObject({ seatPrice: 500, credits: 2049, salePrice: 1200, budget: 480, accountCost: 130, actualCost: 539.8, profit: 660.2 });
  });
  it('keeps the configured price, target and credits while discount changes actual margin', () => {
    expect(analyzeTeam(editTeamPackage(createTeamPackage(), 'discount', '10'))).toMatchObject({
      seatPrice: 200, credits: 740, listPrice: 400, discountAmount: 40, salePrice: 360, actualCost: 200, profit: 160, margin: 400 / 9 });
  });
  it('derives credits from seat price and a margin that includes account costs', () => {
    let p = editTeamPackage(createTeamPackage(), 'seatPrice', '500');
    p = editTeamPackage(p, 'targetMargin', '60');
    expect(analyzeTeam(p)).toMatchObject({ seatPrice: 500, seatCost: 174, listPrice: 1000, credits: 1740, actualCost: 400, profit: 600, margin: 60 });
    expect(analyzeTeam(editTeamPackage(p, 'accountCount', '4')).credits).toBe(1480);
  });
  it('changes credit counts without changing configured prices when the unit cost changes', () => {
    const plan = createPlan(); plan.team.packages.push({ ...createTeamPackage('第二个'), seatPrice: '500' });
    const next = changeCreditCost(plan, '0.1');
    expect(analyzeTeam(next.team.packages[0], next.creditUnitCost)).toMatchObject({ credits: 1480, listPrice: 400, actualCost: 200 });
    expect(analyzeTeam(next.team.packages[1], next.creditUnitCost)).toMatchObject({ credits: 4480, listPrice: 1000, actualCost: 500 });
  });
  it('floors per-seat credits and videos and carries spare budget into profit', () => {
    const a = analyzeTeam({ ...createTeamPackage(), seatPrice: '1.01', targetMargin: '30', seatCount: '3', accountCount: '0' });
    expect(a).toMatchObject({ seatCredits: 3, credits: 9, videoCount: 0, listPrice: 3.03, budget: 2.121, actualCost: 1.8, profit: 1.23, budgetRemaining: 0.321 });
  });
  it('reports impossible margins, losses and zero revenue safely', () => {
    expect(analyzeTeam(editTeamPackage(createTeamPackage(), 'discount', '99'))).toMatchObject({ salePrice: 4, credits: 740, profit: -196, margin: -4900, loss: true, overBudget: true });
    const zero = editTeamPackage(createTeamPackage(), 'seatPrice', '0');
    expect(analyzeTeam(zero)).toMatchObject({ credits: 0, profit: -52, margin: null, loss: true });
    expect(analyzeTeam({ ...zero, accountCount: '0' })).toMatchObject({ profit: 0, margin: null, loss: false });
    expect(analyzeTeam({ ...createTeamPackage(), seatPrice: '30' })).toMatchObject({ credits: 0, profit: 8, overBudget: true, loss: false });
  });
  it('validates prices, quantities, ratios and aggregate credit overflow', () => {
    const p = createTeamPackage();
    for (const invalid of ['0', '1', '-1', '2.5', '9007199254740992']) expect(() => editTeamPackage(p, 'seatCount', invalid)).toThrow();
    expect(() => editTeamPackage(p, 'targetMargin', '100')).toThrow();
    expect(() => editTeamPackage(p, 'seatPrice', '-1')).toThrow();
    expect(() => editTeamPackage(p, 'accountCount', '1.5')).toThrow();
    expect(() => editTeamPackage(p, 'discount', '100')).toThrow();
    expect(() => editTeamPackage(p, 'seatPrice', '9007199254740991')).toThrow('总积分');
  });
  it('meets the target over varied prices, counts, discounts and account quantities', () => {
    for (const price of ['0.3', '26', '100', '199.99', '500']) for (const count of ['2', '3', '7']) for (const discount of ['0', '15', '99']) {
      const p = { ...createTeamPackage(), seatPrice: price, seatCount: count, discount, targetMargin: '37.5' };
      const a = analyzeTeam(p);
      const budget = new Decimal(price).times(count).times(new Decimal(1).minus(new Decimal(discount).div(100))).times('0.625');
      if (budget.lt(52)) { expect(a.seatCredits).toBe(0); expect(a.overBudget).toBe(true); }
      else {
        const cost = new Decimal(a.seatCredits).times(count).times('0.2').plus(52);
        expect(cost.lte(budget)).toBe(true);
        expect(cost.plus(new Decimal(count).times('0.2')).gt(budget)).toBe(true);
        expect(a.margin).toBeGreaterThanOrEqual(37.5);
      }
    }
  });
  it('copies plans without sharing package changes and resets only the active plan', () => {
    let s = initialState(); const personal = structuredClone(s.plans[0].packages);
    s = studioReducer(s, { type: 'edition', edition: 'team' });
    const team = s.plans[0].team;
    s = studioReducer(s, { type: 'team', team: replaceTeamPackage(team, editTeamPackage(team.packages[0], 'discount', '10')) });
    s = studioReducer(s, { type: 'save', name: '复制团队', asNew: true });
    const next = s.plans[1].team;
    s = studioReducer(s, { type: 'team', team: replaceTeamPackage(next, editTeamPackage(next.packages[0], 'accountCount', '5')) });
    expect(s.plans[0].team.packages[0].accountCount).toBe('2');
    expect(s.plans[1].team.packages[0].accountCount).toBe('5');
    expect(s.plans[1].packages).toEqual(personal);
    expect(restoreState(JSON.stringify(s))).toEqual(s);
    s = studioReducer(s, { type: 'reset' });
    expect(s.plans[1].team.packages).toHaveLength(1);
    expect(s.plans[1].team.packages[0].seatCount).toBe('2');
    expect(s.plans[0].team.packages[0].discount).toBe('10');
  });
  it('initializes old personal snapshots and validates new package snapshots', () => {
    const s = initialState();
    const raw = JSON.stringify(s, (key, value) => key === 'team' || key === 'edition' ? undefined : value);
    const restored = restoreState(raw);
    expect(restored.plans[0].edition).toBe('personal');
    expect(restored.plans[0].packages).toEqual(s.plans[0].packages);
    expect(restored.plans[0].team.packages[0].seatCount).toBe('2');
    restored.plans[0].team.packages[0].seatCount = '1';
    expect(() => restoreState(JSON.stringify(restored))).toThrow('数值');
  });
  it('migrates legacy seats preserving prices and the original backup', () => {
    const s = initialState();
    const legacy = { seats: [1, 2, 3].map(id => ({ id: String(id), credits: '500', targetMargin: '50' })), accountCount: '4', discount: '10' };
    const raw = JSON.stringify({ ...s, plans: [{ ...s.plans[0], team: legacy }] });
    const restored = restoreState(raw).plans[0].team;
    expect(restored.packages).toHaveLength(1);
    expect(restored.packages[0]).toMatchObject({ seatCount: '3', accountCount: '4', discount: '10' });
    expect(analyzeTeam(restored.packages[0])).toMatchObject({ listPrice: 600, salePrice: 540, actualCost: 269.6, credits: 828 });
    expect(restored.legacyBackup).toEqual(legacy);
    expect(restoreState(JSON.stringify({ ...s, plans: [{ ...s.plans[0], team: restored }] })).plans[0].team).toEqual(restored);
  });
  it('migrates credit-first packages once without losing their original config', () => {
    const s = initialState();
    const old = { id: 'old', name: '旧套餐', credits: '500', targetMargin: '50', seatCount: '2', accountCount: '2', discount: '10' };
    const snapshot = JSON.stringify({ ...s, plans: [{ ...s.plans[0], team: { packages: [old], selectedId: old.id } }] });
    const restored = restoreState(snapshot), p = restored.plans[0].team.packages[0];
    expect(p.seatPrice).toBe('200');
    expect(p.legacyCreditConfig).toEqual({ credits: '500', targetMargin: '50' });
    expect(p).not.toHaveProperty('credits');
    expect(analyzeTeam(p)).toMatchObject({ credits: 640, listPrice: 400, margin: 50 });
    expect(restoreState(JSON.stringify(restored))).toEqual(restored);
  });
  it('preserves different legacy configurations as separate packages and explains minimum counts', () => {
    const s = initialState();
    const legacy = { seats: [{ id: 'one', credits: '500', targetMargin: '50' }, { id: 'two', credits: '1000', targetMargin: '60' }], accountCount: '2', discount: '10' };
    const restored = restoreState(JSON.stringify({ ...s, plans: [{ ...s.plans[0], team: legacy }] })).plans[0].team;
    expect(restored.packages).toHaveLength(2);
    expect(restored.packages.map(p => p.seatCount)).toEqual(['2', '2']);
    expect(restored.packages.map(p => analyzeTeam(p).seatPrice)).toEqual([200, 500]);
    expect(restored.legacyBackup).toEqual(legacy);
    expect(restored.migrationNotice).toContain('请核对');
  });
  it('preserves the unrounded original price while migrating fractional legacy prices', () => {
    const s = initialState();
    const old = { id: 'fraction', name: '小数价格', credits: '501', targetMargin: '35', seatCount: '3', accountCount: '2', discount: '7.5' };
    const restored = restoreState(JSON.stringify({ ...s, plans: [{ ...s.plans[0], team: { packages: [old], selectedId: old.id } }] }));
    const p = restored.plans[0].team.packages[0];
    expect(p.seatPrice).toBe(new Decimal('501').times('0.2').div('0.65').toString());
    expect(p.legacyCreditConfig?.credits).toBe('501');
    expect(analyzeTeam(p).margin).toBeGreaterThanOrEqual(35);
    expect(restoreState(JSON.stringify(restored))).toEqual(restored);
  });
});
