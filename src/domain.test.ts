import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { analyze, changeCreditCost, createPackage, createPlan, defaultPackages, editPackage, initialState, migrateLegacy, orderedPackages, restoreState, studioReducer, validateNumber } from './domain';

describe('price → budget → credits', () => {
  it('converts the screenshot example into complete videos', () => {
    const p = editPackage(createPackage('视频套餐', '500', '0', '60'), 'accountCount', '2');
    expect(analyze(p)).toMatchObject({ suggestedCredits: 740, suggestedVideos: 67, videoCount: 67,
      actualCost: 200, profit: 300, margin: 60 });
    expect(analyze(editPackage(p, 'credits', '110'))).toMatchObject({ suggestedVideos: 67, videoCount: 10 });
  });
  it.each([[0, 0], [10, 0], [11, 1], [21, 1], [22, 2], [740, 67]])('converts %i credits to %i complete videos', (credits, videos) => {
    const p = editPackage(createPackage(), 'credits', String(credits));
    expect(analyze(p).videoCount).toBe(videos);
  });
  it('deducts account costs before allocating credits', () => {
    const p = editPackage(createPackage('账号套餐', '100', '10', '40'), 'accountCount', '1');
    expect(analyze(p)).toMatchObject({ budget: 54, accountCost: 26, creditBudget: 28,
      suggestedCredits: 140, creditCost: 28, actualCost: 54, profit: 36, margin: 40 });
    expect(analyze(editPackage(p, 'accountCount', '2'))).toMatchObject({ accountCost: 52, creditBudget: 2, credits: 10 });
  });
  it('shows impossible targets and losses without negative suggested credits', () => {
    const p = editPackage(createPackage('账号超支', '100', '10', '40'), 'accountCount', '3');
    expect(analyze(p)).toMatchObject({ accountCost: 78, creditBudget: 0, credits: 0, actualCost: 78,
      profit: 12, budgetRemaining: -24, overBudget: true, loss: false });
    expect(analyze(editPackage(p, 'accountCount', '4'))).toMatchObject({ credits: 0, actualCost: 104, profit: -14, loss: true });
    expect(analyze(editPackage(p, 'listPrice', '0'))).toMatchObject({ credits: 0, profit: -78, margin: null, loss: true });
  });
  it('preserves manual credits as accounts and conversion rates change', () => {
    let p = editPackage(createPackage('手动', '100', '10', '40'), 'credits', '300');
    p = editPackage(p, 'accountCount', '1');
    expect(analyze(p)).toMatchObject({ credits: 300, accountCost: 26, creditCost: 60, actualCost: 86, profit: 4, overBudget: true });
    expect(analyze(p, '0.1')).toMatchObject({ credits: 300, suggestedCredits: 280, actualCost: 56 });
    expect(analyze({ ...p, manualCredits: null })).toMatchObject({ credits: 140, actualCost: 54 });
  });
  it('floors remaining budget accurately and handles an exact account budget', () => {
    const p = editPackage(createPackage('取整', '99', '10', '40'), 'accountCount', '1');
    expect(analyze(p)).toMatchObject({ creditBudget: 27.46, credits: 137, actualCost: 53.4, budgetRemaining: 0.06 });
    expect(analyze({ ...p, listPrice: '26', discount: '0', targetMargin: '0' })).toMatchObject({ credits: 0, profit: 0, overBudget: false });
  });
  it('calculates the agreed 100 / 10% / 40% example', () => {
    const p = createPackage('示例', '100', '10', '40');
    expect(analyze(p)).toMatchObject({ salePrice: 90, budget: 54, targetProfit: 36, suggestedCredits: 270,
      credits: 270, actualCost: 54, profit: 36, margin: 40, budgetRemaining: 0, manual: false, overBudget: false });
  });
  it('reports actual profit independently when manually granting 300 credits', () => {
    const p = editPackage(createPackage('示例', '100', '10', '40'), 'credits', '300');
    const a = analyze(p);
    expect(a).toMatchObject({ budget: 54, suggestedCredits: 270, credits: 300, actualCost: 60, profit: 30, overBudget: true, manual: true, budgetRemaining: -6 });
    expect(a.margin).toBeCloseTo(33.33333333333333); expect(p.targetMargin).toBe('40');
  });
  it('floors credits and includes the unspent budget in profit', () => {
    const a = analyze(createPackage('Test', '99', '10', '40'));
    expect(a.budget).toBe(53.46); expect(a.suggestedCredits).toBe(267);
    expect(a.actualCost).toBe(53.4); expect(a.budgetRemaining).toBe(0.06);
    expect(a.margin).toBeGreaterThan(40);
  });
  it('keeps manual allocations while changing price, discount and target', () => {
    let p = editPackage(createPackage(), 'credits', '123');
    p = editPackage(p, 'listPrice', '200'); p = editPackage(p, 'discount', '10'); p = editPackage(p, 'targetMargin', '50');
    expect(analyze(p)).toMatchObject({ credits: 123, suggestedCredits: 450, actualCost: 24.6, manual: true });
    expect(analyze({ ...p, manualCredits: null })).toMatchObject({ credits: 450, manual: false, margin: 50 });
  });
  it('does not reverse-price when the margin changes', () => {
    const p = editPackage(createPackage('Test', '99', '20'), 'targetMargin', '75');
    expect(p.listPrice).toBe('99'); expect(p.discount).toBe('20'); expect(analyze(p).salePrice).toBe(79.2);
  });
  it('updates the whole plan rate while preserving manual credits', () => {
    let plan = createPlan(); plan.packages[1] = editPackage(plan.packages[1], 'credits', '500');
    plan = changeCreditCost(plan, '0.1');
    expect(analyze(plan.packages[0], plan.creditUnitCost).credits).toBe(700);
    expect(analyze(plan.packages[1], plan.creditUnitCost).credits).toBe(500);
    expect(analyze(plan.packages[1], plan.creditUnitCost).actualCost).toBe(50);
  });
  it('does not lose a credit due to floating point rounding', () => {
    expect(analyze(createPackage('Decimal', '1', '0', '40')).credits).toBe(3);
    expect(analyze(createPackage('Decimal', '0.3', '0', '0'), '0.1').credits).toBe(3);
  });
  it('handles zero sales without dividing by zero', () => {
    const p = createPackage('免费', '0');
    expect(analyze(p)).toMatchObject({ budget: 0, credits: 0, profit: 0, margin: null });
    expect(analyze({ ...p, manualCredits: '50' })).toMatchObject({ actualCost: 10, profit: -10, margin: null, overBudget: true, loss: true });
  });
  it('permits zero credits and reports a real loss on excess credits', () => {
    const p = editPackage(createPackage('Test', '10'), 'credits', '100');
    expect(analyze(p)).toMatchObject({ profit: -10, margin: -100, loss: true });
    expect(analyze(editPackage(p, 'credits', '0'))).toMatchObject({ actualCost: 0, profit: 10, margin: 100 });
  });
  it('supports high valid discounts and targets', () => {
    const a = analyze(createPackage('Test', '10000', '99', '99.9'), '0.0001');
    expect(a).toMatchObject({ salePrice: 100, budget: 0.1, suggestedCredits: 1000 });
  });
  it('always recommends an affordable integer for varied inputs', () => {
    for (const price of ['0.01', '19.99', '100', '999.95']) for (const discount of ['0', '12.5', '99']) for (const margin of ['0', '35', '99.9']) {
      const p = createPackage('Test', price, discount, margin), a = analyze(p);
      const exactBudget = new Decimal(price).times(new Decimal(1).minus(new Decimal(discount).div(100))).times(new Decimal(1).minus(new Decimal(margin).div(100)));
      expect(Number.isInteger(a.credits)).toBe(true);
      expect(new Decimal(a.credits).times('0.2').lte(exactBudget)).toBe(true);
      expect(new Decimal(a.credits + 1).times('0.2').gt(exactBudget)).toBe(true);
    }
  });
  it.each([
    ['listPrice', '-1'], ['listPrice', ''], ['listPrice', 'Infinity'], ['discount', '100'], ['discount', '-1'],
    ['targetMargin', '100'], ['targetMargin', '-5'], ['credits', '1.5'], ['credits', '-1'], ['credits', '9007199254740992'],
    ['creditUnitCost', '0'], ['creditUnitCost', '-0.2'],
    ['accountCount', '-1'], ['accountCount', '1.5'], ['accountCount', ''], ['accountCount', '9007199254740992'],
  ] as const)('rejects invalid %s=%s', (field, raw) => expect(validateNumber(field, raw)).toBeTruthy());
  it('accepts decimal drafts and safe zero values', () => {
    expect(validateNumber('listPrice', '7.')).toBeUndefined(); expect(validateNumber('listPrice', '.5')).toBeUndefined();
    expect(validateNumber('credits', '0')).toBeUndefined(); expect(validateNumber('targetMargin', '0')).toBeUndefined();
  });
  it('rejects conversions too large for a reliable credit count', () => {
    expect(() => analyze(createPackage(), '0.00000000000000000001')).toThrow('积分超出');
    expect(() => changeCreditCost(createPlan(), '0')).toThrow('大于 0');
  });
});

describe('plan state', () => {
  it('sets sample prices and never stores obsolete quantity/cost drivers', () => {
    expect(defaultPackages().map(p => p.listPrice)).toEqual(['100', '200', '500', '1000']);
    expect(defaultPackages()[0]).not.toHaveProperty('quantity'); expect(defaultPackages()[0]).not.toHaveProperty('driver');
  });
  it('keeps copied plans independent', () => {
    let s = initialState(); const first = s.activeId;
    s = studioReducer(s, { type: 'save', name: '另存方案', asNew: true });
    s = studioReducer(s, { type: 'unitCost', value: '0.4' });
    expect(s.plans.find(p => p.id === first)?.creditUnitCost).toBe('0.2'); expect(s.plans[1].creditUnitCost).toBe('0.4');
    const p = s.plans[1].packages[0]; s = studioReducer(s, { type: 'replace', id: p.id, package: { ...p, manualCredits: '20' } });
    expect(s.plans[0].packages[0].manualCredits).toBeNull();
  });
  it('supports empty plans, adding and deleting every package', () => {
    let s = initialState(); s = studioReducer(s, { type: 'newPlan', name: '空白' });
    const p = createPackage(); s = studioReducer(s, { type: 'add', package: p });
    expect(s.plans[1].selectedId).toBe(p.id); s = studioReducer(s, { type: 'remove', id: p.id });
    expect(s.plans[1].packages).toHaveLength(0); expect(s.plans[1].selectedId).toBe('');
  });
  it('renames or deletes an inactive plan without switching the current plan', () => {
    let s = initialState(); const first = s.activeId;
    s = studioReducer(s, { type: 'newPlan', name: '第二份' }); const active = s.activeId;
    s = studioReducer(s, { type: 'rename', id: first, name: '已改名' }); expect(s.activeId).toBe(active);
    s = studioReducer(s, { type: 'deletePlan', id: first }); expect(s.activeId).toBe(active);
    s = studioReducer(s, { type: 'deletePlan', id: active }); expect(s.plans).toHaveLength(1); expect(s.plans[0].packages).toHaveLength(4);
  });
  it('resets only the active plan and its conversion rate', () => {
    let s = initialState(); s = studioReducer(s, { type: 'unitCost', value: '0.8' });
    s = studioReducer(s, { type: 'save', name: '第二份', asNew: true }); s = studioReducer(s, { type: 'reset' });
    expect(s.plans[0].creditUnitCost).toBe('0.8'); expect(s.plans[1].creditUnitCost).toBe('0.2');
  });
  it('restores the current model and corrects a missing selection', () => {
    const s = initialState(); s.plans[0].packages[0].manualCredits = '123';
    s.plans[0].packageOrder = orderedPackages(s.plans[0]).map(entry => entry.key);
    expect(restoreState(JSON.stringify(s))).toEqual(s);
    s.plans[0].selectedId = 'missing'; expect(restoreState(JSON.stringify(s)).plans[0].selectedId).toBe(s.plans[0].packages[0].id);
  });
  it('restores older v2 data without changing its calculations', () => {
    const s = initialState();
    const raw = JSON.stringify({ ...s, plans: s.plans.map(plan => ({ ...plan,
      packages: plan.packages.map(p => Object.fromEntries(Object.entries(p).filter(([key]) => key !== 'accountCount'))) })) });
    s.plans[0].packageOrder = orderedPackages(s.plans[0]).map(entry => entry.key);
    expect(restoreState(raw)).toEqual(s);
    s.plans[0].packages[0].accountCount = '2';
    expect(restoreState(JSON.stringify(s))).toEqual(s);
    s.plans[0].packages[0].accountCount = '1.5';
    expect(() => restoreState(JSON.stringify(s))).toThrow('数值无效');
  });
  it('rejects damaged snapshots and invalid conversion rates', () => {
    expect(() => restoreState('{oops')).toThrow();
    const s = initialState(); s.plans[0].creditUnitCost = '0'; expect(() => restoreState(JSON.stringify(s))).toThrow();
  });
  it('migrates old prices without treating sales quantity or cost as credits', () => {
    const legacy = { version: 1, activeId: 'plan', plans: [{ id: 'plan', name: '旧方案', selectedId: 'p', packages: [
      { id: 'p', name: '旧套餐', listPrice: '100', discount: '10', targetMargin: '40', quantity: '10000', unitCost: '7', fixedCost: '500', note: '保留备注' },
      { id: 'p2', name: '旧高毛利', listPrice: '100', discount: '0', targetMargin: '100' },
    ] }] };
    const migrated = migrateLegacy(JSON.stringify(legacy));
    expect(migrated.adjusted).toBe(1); expect(migrated.state.plans[0].packages[1].targetMargin).toBe('35');
    expect(analyze(migrated.state.plans[0].packages[0]).credits).toBe(270);
    expect(migrated.state.plans[0].packages[0]).toMatchObject({ note: '保留备注', manualCredits: null, listPrice: '100' });
  });
});
