import Decimal from 'decimal.js';

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });
const D = (value: Decimal.Value) => new Decimal(value);
export const DEFAULT_CREDIT_COST = '0.2';
export const ACCOUNT_UNIT_COST = '26';
export const CREDITS_PER_VIDEO = 11;
const MAX_CREDITS = Number.MAX_SAFE_INTEGER;
export type BillingCycle = 'quarterly' | 'annual';

export interface Package {
  id: string;
  billingCycle: BillingCycle;
  name: string;
  listPrice: string;
  discount: string;
  targetMargin: string;
  accountCount: string;
  manualCredits: string | null;
  // Discount edits retain the allocation without turning it into a manual override.
  discountCredits?: string;
  note: string;
}
export interface Plan {
  id: string;
  name: string;
  creditUnitCost: string;
  edition: 'personal' | 'team';
  team: TeamState;
  packages: Package[];
  packageOrder?: string[];
  selectedId: string;
  updatedAt: string;
  savedAt?: string;
}
export interface StudioState { version: 2; activeId: string; plans: Plan[] }
export function orderedPackages(plan: Plan) {
  const entries = [
    ...plan.packages.map(p => ({ key: `personal:${p.id}`, kind: 'personal' as const, p })),
    ...plan.team.packages.map(p => ({ key: `team:${p.id}`, kind: 'team' as const, p })),
  ];
  const remaining = new Map(entries.map(entry => [entry.key, entry]));
  const ordered: typeof entries = [];
  for (const key of plan.packageOrder ?? []) {
    const entry = remaining.get(key);
    if (entry) { ordered.push(entry); remaining.delete(key); }
  }
  return [...ordered, ...remaining.values()];
}
export interface TeamPackage {
  id: string; name: string; seatCount: string; seatPrice: string; targetMargin: string;
  billingCycle: BillingCycle;
  fixedSeatCredits: string | null;
  accountCount: string; discount: string;
  legacyCreditConfig?: { credits: string; targetMargin: string };
}
interface LegacyTeam { seats: { id: string; credits: string; targetMargin: string }[]; accountCount: string; discount: string }
export interface TeamState {
  packages: TeamPackage[]; selectedId: string;
  legacyBackup?: LegacyTeam;
  migrationNotice?: string;
}
export interface TeamAnalysis {
  seatCount: number; seatCredits: number; seatVideoCount: number; seatCost: number; seatPrice: number; seatProfit: number;
  credits: number; videoCount: number; videoUnitPrice: number | null; creditCost: number; accountCost: number;
  listPrice: number; discountAmount: number; salePrice: number; actualCost: number;
  profit: number; margin: number | null; loss: boolean;
  budget: number; creditBudget: number; targetProfit: number; budgetRemaining: number; overBudget: boolean;
}
export type NumericField = 'listPrice' | 'discount' | 'targetMargin' | 'margin' | 'accountCount' | 'credits' | 'creditUnitCost' | 'seatCount' | 'seatPrice';
export interface Analysis {
  listPrice: number;
  salePrice: number;
  discountAmount: number;
  budget: number;
  targetProfit: number;
  accountCost: number;
  creditBudget: number;
  creditCost: number;
  suggestedCredits: number;
  suggestedVideos: number;
  credits: number;
  videoCount: number;
  videoUnitPrice: number | null;
  actualCost: number;
  profit: number;
  margin: number | null;
  budgetRemaining: number;
  overBudget: boolean;
  loss: boolean;
  manual: boolean;
}

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function validateNumber(field: NumericField, raw: string): string | undefined {
  if (!raw.trim() || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return '请输入有效数字';
  const value = D(raw);
  if (!value.isFinite() || !Number.isFinite(value.toNumber())) return '数值超出可计算范围';
  if (value.lt(0) && field !== 'margin') return '不能输入负数';
  if (field === 'discount' && value.gt(99)) return '优惠范围为 0%～99%';
  if (field === 'targetMargin' && value.gte(100)) return '目标毛利率必须小于 100%';
  if (field === 'margin' && value.gte(100)) return '可设置的毛利率必须小于 100%';
  if (field === 'creditUnitCost' && value.lte(0)) return '每积分成本必须大于 0';
  if (field === 'credits' && (!value.isInteger() || value.gt(MAX_CREDITS))) return '请输入可计算范围内的非负整数积分';
  if (field === 'accountCount' && (!value.isInteger() || value.gt(MAX_CREDITS))) return '账号数量必须是可计算范围内的非负整数';
  if (field === 'seatCount' && (!value.isInteger() || value.lt(2) || value.gt(MAX_CREDITS))) return '每个团队套餐至少 2 个席位，请输入有效整数';
  return undefined;
}

export function analyze(p: Package, creditUnitCost = DEFAULT_CREDIT_COST): Analysis {
  if (p.manualCredits !== null && validateNumber('credits', p.manualCredits)) throw new Error('发放积分超出可计算范围');
  if (p.discountCredits !== undefined && (typeof p.discountCredits !== 'string' || validateNumber('credits', p.discountCredits))) throw new Error('折扣保留积分配置无效');
  const unit = D(creditUnitCost);
  const sale = D(p.listPrice).times(D(1).minus(D(p.discount).div(100)));
  const budget = sale.times(D(1).minus(D(p.targetMargin).div(100)));
  const accountCost = D(p.accountCount).times(ACCOUNT_UNIT_COST).times(p.billingCycle === 'annual' ? 4 : 1);
  const creditBudget = Decimal.max(0, budget.minus(accountCost));
  const suggested = creditBudget.div(unit).floor();
  if (suggested.gt(MAX_CREDITS)) throw new Error('建议积分超出可计算范围，请检查价格或每积分成本');
  const credits = p.manualCredits !== null ? D(p.manualCredits) : p.discountCredits !== undefined ? D(p.discountCredits) : suggested;
  const creditCost = credits.times(unit);
  const cost = accountCost.plus(creditCost);
  const profit = sale.minus(cost);
  const videos = credits.div(CREDITS_PER_VIDEO).floor();
  const result: Analysis = {
    listPrice: D(p.listPrice).toNumber(),
    salePrice: sale.toNumber(), discountAmount: D(p.listPrice).minus(sale).toNumber(),
    budget: budget.toNumber(), targetProfit: sale.minus(budget).toNumber(),
    accountCost: accountCost.toNumber(), creditBudget: creditBudget.toNumber(), creditCost: creditCost.toNumber(),
    suggestedCredits: suggested.toNumber(), credits: credits.toNumber(), actualCost: cost.toNumber(),
    suggestedVideos: suggested.div(CREDITS_PER_VIDEO).floor().toNumber(),
    videoCount: videos.toNumber(),
    videoUnitPrice: videos.isZero() ? null : sale.div(videos).toNumber(),
    profit: profit.toNumber(), margin: sale.isZero() ? null : profit.div(sale).times(100).toNumber(),
    budgetRemaining: budget.minus(cost).toNumber(), overBudget: cost.gt(budget), loss: profit.lt(0),
    manual: p.manualCredits !== null,
  };
  if (Object.values(result).some(value => typeof value === 'number' && !Number.isFinite(value))) throw new Error('计算结果超出范围，请减小输入数值');
  return result;
}

export function editPackage(p: Package, field: Exclude<NumericField, 'creditUnitCost' | 'seatCount' | 'seatPrice' | 'margin'>, raw: string, unitCost = DEFAULT_CREDIT_COST): Package {
  const error = validateNumber(field, raw);
  if (error) throw new Error(error);
  if (field !== 'credits' && D(raw).eq(p[field])) return p;
  const next = { ...p };
  if (field === 'discount' && p.manualCredits === null) next.discountCredits = String(analyze(p, unitCost).credits);
  else if (field !== 'discount') delete next.discountCredits;
  if (field === 'credits') next.manualCredits = D(raw).toString();
  else next[field] = D(raw).toString();
  analyze(next, unitCost);
  return next;
}

// Display the realized margin, but treat an explicit edit as a fresh allocation request.
// Never derive this request during render: whole-credit rounding must not create a loop.
export function setPackageMargin(p: Package, raw: string, unitCost = DEFAULT_CREDIT_COST): Package {
  const error = validateNumber('margin', raw);
  if (error) throw new Error(error);
  if (analyze(p, unitCost).salePrice === 0) throw new Error('实收金额为 0，请先设置售价后再调整毛利率');
  const next = { ...p, targetMargin: D(raw).toString(), manualCredits: null };
  delete next.discountCredits;
  analyze(next, unitCost);
  return next;
}

export function changeCreditCost(plan: Plan, raw: string): Plan {
  const error = validateNumber('creditUnitCost', raw);
  if (error) throw new Error(error);
  if (D(raw).eq(plan.creditUnitCost)) return plan;
  const next = { ...plan, creditUnitCost: D(raw).toString(),
    packages: plan.packages.map(p => { const next = { ...p }; delete next.discountCredits; return next; }),
    team: { ...plan.team, packages: plan.team.packages.map(p => ({ ...p, fixedSeatCredits: null })) } };
  validateBilling(next);
  return next;
}

// Stored inputs always describe one quarter. Billing conversion never mutates them.
export function forBillingCycle<T extends Analysis | TeamAnalysis>(base: T, cycle: BillingCycle): T {
  if (cycle === 'quarterly') return base;
  const result = { ...base };
  const counts = new Set(['credits', 'suggestedCredits', 'videoCount', 'suggestedVideos', 'seatCredits', 'seatVideoCount']);
  for (const [key, value] of Object.entries(base)) {
    if (typeof value !== 'number' || key === 'margin' || key === 'seatCount' || key === 'videoUnitPrice') continue;
    const scaled = D(value).times(4);
    if (!Number.isFinite(scaled.toNumber()) || (counts.has(key) && scaled.gt(MAX_CREDITS))) throw new Error('全年汇总超出可计算范围，请减小输入数值');
    Object.assign(result, { [key]: scaled.toNumber() });
  }
  return result;
}

export function validateBilling(plan: Plan) {
  plan.packages.forEach(p => analyze(p, plan.creditUnitCost));
  plan.team.packages.forEach(p => analyzeTeam(p, plan.creditUnitCost));
}

export function createTeamPackage(name = '团队套餐 1'): TeamPackage {
  return { id: uid(), name, billingCycle: 'quarterly', fixedSeatCredits: null, seatCount: '2', seatPrice: '200', targetMargin: '50', accountCount: '2', discount: '0' };
}

export function createTeam(): TeamState {
  const p = createTeamPackage();
  return { packages: [p], selectedId: p.id };
}

export function analyzeTeam(team: TeamPackage, creditUnitCost = DEFAULT_CREDIT_COST): TeamAnalysis {
  for (const [field, value] of [['creditUnitCost', creditUnitCost], ['accountCount', team.accountCount], ['discount', team.discount], ['seatCount', team.seatCount], ['seatPrice', team.seatPrice], ['targetMargin', team.targetMargin]] as const) {
    const error = validateNumber(field === 'targetMargin' ? 'margin' : field, value);
    if (error) throw new Error(error);
  }
  const count = D(team.seatCount), pricePerSeat = D(team.seatPrice);
  const totalPrice = pricePerSeat.times(count);
  const sale = totalPrice.times(D(1).minus(D(team.discount).div(100)));
  const budget = sale.times(D(1).minus(D(team.targetMargin).div(100)));
  const accountCost = D(team.accountCount).times(ACCOUNT_UNIT_COST).times(team.billingCycle === 'annual' ? 4 : 1);
  const creditBudget = Decimal.max(0, budget.minus(accountCost));
  // Allocate the same whole number of credits to every seat; unused budget is profit.
  if (team.fixedSeatCredits != null && validateNumber('credits', team.fixedSeatCredits)) throw new Error('每席积分配置无效');
  const credits = team.fixedSeatCredits == null ? creditBudget.div(count).div(creditUnitCost).floor() : D(team.fixedSeatCredits);
  const costPerSeat = credits.times(creditUnitCost);
  const videosPerSeat = credits.div(CREDITS_PER_VIDEO).floor();
  const totalCredits = credits.times(count), totalCost = costPerSeat.times(count);
  const totalVideos = videosPerSeat.times(count);
  if (totalCredits.gt(MAX_CREDITS)) throw new Error('团队总积分超出可计算范围');
  const cost = totalCost.plus(accountCost), profit = sale.minus(cost);
  const result: TeamAnalysis = { seatCount: count.toNumber(), seatCredits: credits.toNumber(), seatVideoCount: videosPerSeat.toNumber(),
    seatCost: costPerSeat.toNumber(), seatPrice: pricePerSeat.toNumber(), seatProfit: profit.div(count).toNumber(),
    credits: totalCredits.toNumber(), videoCount: totalVideos.toNumber(),
    videoUnitPrice: totalVideos.isZero() ? null : sale.div(totalVideos).toNumber(),
    creditCost: totalCost.toNumber(), accountCost: accountCost.toNumber(), listPrice: totalPrice.toNumber(),
    discountAmount: totalPrice.minus(sale).toNumber(), salePrice: sale.toNumber(), actualCost: cost.toNumber(),
    profit: profit.toNumber(), margin: sale.isZero() ? null : profit.div(sale).times(100).toNumber(), loss: profit.lt(0),
    budget: budget.toNumber(), creditBudget: creditBudget.toNumber(), targetProfit: sale.minus(budget).toNumber(),
    budgetRemaining: budget.minus(cost).toNumber(), overBudget: cost.gt(budget) };
  if (Object.values(result).some(value => typeof value === 'number' && (!Number.isFinite(value)))) {
    throw new Error('团队计算结果超出范围，请减小输入数值');
  }
  return result;
}

export function editTeamPackage(team: TeamPackage, field: 'seatPrice' | 'targetMargin' | 'seatCount' | 'accountCount' | 'discount', raw: string, unitCost = DEFAULT_CREDIT_COST): TeamPackage {
  const error = validateNumber(field, raw);
  if (error) throw new Error(error);
  if (D(raw).eq(team[field])) return team;
  const next = { ...team, [field]: D(raw).toString(), fixedSeatCredits: field === 'seatCount' || field === 'discount' ? String(analyzeTeam(team, unitCost).seatCredits) : null };
  analyzeTeam(next, unitCost);
  return next;
}

export function replaceTeamPackage(team: TeamState, p: TeamPackage): TeamState {
  return { ...team, packages: team.packages.map(current => current.id === p.id ? p : current) };
}

export function setTeamMargin(p: TeamPackage, raw: string, unitCost = DEFAULT_CREDIT_COST): TeamPackage {
  const error = validateNumber('margin', raw);
  if (error) throw new Error(error);
  if (analyzeTeam(p, unitCost).salePrice === 0) throw new Error('实收金额为 0，请先设置售价后再调整毛利率');
  const next = { ...p, targetMargin: D(raw).toString(), fixedSeatCredits: null };
  analyzeTeam(next, unitCost);
  return next;
}

// Period changes convert amounts once. From then on inputs are totals for that package's period.
export function changePackageBilling<T extends Package | TeamPackage>(p: T, cycle: BillingCycle, unitCost = DEFAULT_CREDIT_COST): T {
  if (cycle !== 'quarterly' && cycle !== 'annual') throw new Error('购买周期无效');
  if (p.billingCycle === cycle) return p;
  const factor = cycle === 'annual' ? 4 : 0.25;
  const next = { ...p, billingCycle: cycle };
  if ('seatCount' in next) {
    next.seatPrice = D(next.seatPrice).times(factor).toString();
    next.fixedSeatCredits = D(analyzeTeam(p as TeamPackage, unitCost).seatCredits).times(factor).floor().toString();
    analyzeTeam(next, unitCost);
  } else {
    next.listPrice = D(next.listPrice).times(factor).toString();
    if (next.manualCredits !== null) next.manualCredits = D(next.manualCredits).times(factor).floor().toString();
    if (next.discountCredits !== undefined) next.discountCredits = D(next.discountCredits).times(factor).floor().toString();
    analyze(next, unitCost);
  }
  return next;
}

export function createPackage(name = '新套餐', listPrice = '100', discount = '0', targetMargin = '40'): Package {
  return { id: uid(), name, billingCycle: 'quarterly', listPrice, discount, targetMargin, accountCount: '0', manualCredits: null, note: '' };
}
export function defaultPackages(): Package[] {
  return [createPackage('基础套餐', '100', '0', '30'), createPackage('标准套餐', '200', '5', '35'),
    createPackage('专业套餐', '500', '10', '40'), createPackage('旗舰套餐', '1000', '15', '45')];
}
export function createPlan(name = '我的定价方案', empty = false): Plan {
  const packages = empty ? [] : defaultPackages();
  return { id: uid(), name, creditUnitCost: DEFAULT_CREDIT_COST, edition: 'personal', team: createTeam(), packages, selectedId: packages[0]?.id ?? '', updatedAt: new Date().toISOString() };
}
export function initialState(): StudioState {
  const plan = createPlan();
  return { version: 2, activeId: plan.id, plans: [plan] };
}

export type Action =
  | { type: 'edition'; edition: Plan['edition'] }
  | { type: 'team'; team: TeamState }
  | { type: 'replace'; id: string; package: Package }
  | { type: 'unitCost'; value: string }
  | { type: 'select'; id: string }
  | { type: 'add'; package: Package }
  | { type: 'remove'; id: string }
  | { type: 'reset' }
  | { type: 'switch'; id: string }
  | { type: 'save'; name: string; asNew: boolean }
  | { type: 'rename'; id: string; name: string }
  | { type: 'deletePlan'; id: string }
  | { type: 'newPlan'; name: string };

export function studioReducer(state: StudioState, action: Action): StudioState {
  if (action.type === 'switch') return state.plans.some(p => p.id === action.id) ? { ...state, activeId: action.id } : state;
  if (action.type === 'rename') return { ...state, plans: state.plans.map(p => p.id === action.id ? { ...p, name: action.name, updatedAt: new Date().toISOString() } : p) };
  if (action.type === 'deletePlan') {
    const plans = state.plans.filter(p => p.id !== action.id);
    if (!plans.length) plans.push(createPlan());
    return { ...state, plans, activeId: plans.some(p => p.id === state.activeId) ? state.activeId : plans[0].id };
  }
  const plan = state.plans.find(p => p.id === state.activeId)!;
  if (action.type === 'newPlan') {
    const next = createPlan(action.name, true);
    return { ...state, activeId: next.id, plans: [...state.plans, next] };
  }
  if (action.type === 'save' && action.asNew) {
    const next = { ...structuredClone(plan), id: uid(), name: action.name, savedAt: new Date().toISOString() };
    return { ...state, activeId: next.id, plans: [...state.plans, next] };
  }
  let next: Plan = { ...plan, packageOrder: orderedPackages(plan).map(entry => entry.key), updatedAt: new Date().toISOString() };
  if (action.type === 'edition') next.edition = action.edition;
  if (action.type === 'team') { next.team = restoreTeam(action.team, plan.creditUnitCost); }
  if (action.type === 'replace') next.packages = plan.packages.map(p => p.id === action.id ? action.package : p);
  if (action.type === 'unitCost') next = changeCreditCost(next, action.value);
  if (action.type === 'select' && plan.packages.some(p => p.id === action.id)) next.selectedId = action.id;
  if (action.type === 'add') { next.packages = [...plan.packages, action.package]; next.selectedId = action.package.id; }
  if (action.type === 'remove') {
    next.packages = plan.packages.filter(p => p.id !== action.id);
    if (next.selectedId === action.id) next.selectedId = next.packages[0]?.id ?? '';
  }
  if (action.type === 'reset') { next.packages = defaultPackages(); next.selectedId = next.packages[0].id; next.team = createTeam(); next.creditUnitCost = DEFAULT_CREDIT_COST; }
  if (action.type === 'save') { next.name = action.name; next.savedAt = next.updatedAt; }
  next.packageOrder = orderedPackages(next).map(entry => entry.key);
  return { ...state, plans: state.plans.map(p => p.id === plan.id ? next : p) };
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object'; }

function restoreTeam(value: unknown, unitCost: string): TeamState {
  if (value === undefined) return createTeam();
  if (!record(value)) throw new Error('本地团队方案无效');
  // Keep a backup when converting the old per-seat configuration into independent packages.
  if (Array.isArray(value.seats)) {
    if (value.seats.length < 2 || typeof value.accountCount !== 'string' || typeof value.discount !== 'string') throw new Error('旧团队席位数据无效');
    const ids = new Set<string>(), groups = new Map<string, Omit<TeamPackage, 'seatPrice' | 'billingCycle' | 'fixedSeatCredits'> & { credits: string }>();
    for (const seat of value.seats) {
      if (!record(seat) || typeof seat.id !== 'string' || ids.has(seat.id) || typeof seat.credits !== 'string' || typeof seat.targetMargin !== 'string' || validateNumber('credits', seat.credits) || validateNumber('targetMargin', seat.targetMargin)) throw new Error('旧团队席位格式无效');
      ids.add(seat.id);
      const key = `${D(seat.credits).toString()}:${D(seat.targetMargin).toString()}`;
      const group = groups.get(key);
      if (group) group.seatCount = String(Number(group.seatCount) + 1);
      else groups.set(key, { id: seat.id, name: `团队套餐 ${groups.size + 1}`, seatCount: '1', credits: seat.credits,
        targetMargin: seat.targetMargin, accountCount: value.accountCount, discount: value.discount });
    }
    const packages = [...groups.values()].map(p => ({ ...p, seatCount: String(Math.max(2, Number(p.seatCount))) }));
    value = { packages, selectedId: packages[0].id, legacyBackup: structuredClone(value),
      migrationNotice: groups.size > 1 ? '旧团队中不同的席位配置已分为独立套餐，每个套餐至少 2 席。账号数和折扣分别保留，原始席位数据已备份在本地方案中；请核对各套餐席位数。' : '旧团队席位已合并为统一套餐配置，积分、价格与席位数保持不变，原始席位数据已备份。' };
  }
  if (!record(value) || !Array.isArray(value.packages) || !value.packages.length) throw new Error('至少保留一个团队套餐');
  const ids = new Set<string>();
  let migratedPrices = false;
  for (const p of value.packages) {
    if (!record(p) || typeof p.id !== 'string' || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim()) throw new Error('团队套餐格式无效');
    ids.add(p.id);
    // Upgrade credit-first packages once, keeping their quarterly prices and source configuration.
    if (p.seatPrice === undefined) {
      if (typeof p.credits !== 'string' || validateNumber('credits', p.credits) || typeof p.targetMargin !== 'string' || validateNumber('targetMargin', p.targetMargin)) throw new Error('旧团队套餐数值无效');
      p.seatPrice = D(p.credits).times(unitCost).div(D(1).minus(D(p.targetMargin).div(100))).toString();
      p.legacyCreditConfig = { credits: p.credits, targetMargin: p.targetMargin };
      delete p.credits;
      migratedPrices = true;
    }
    for (const field of ['seatPrice', 'targetMargin', 'seatCount', 'accountCount', 'discount'] as const) {
      if (typeof p[field] !== 'string' || validateNumber(field === 'targetMargin' ? 'margin' : field, p[field])) throw new Error('团队套餐数值无效');
    }
    if (p.billingCycle === undefined) p.billingCycle = 'quarterly';
    if (p.billingCycle !== 'quarterly' && p.billingCycle !== 'annual') throw new Error('购买周期无效');
    if (p.fixedSeatCredits === undefined) p.fixedSeatCredits = null;
    analyzeTeam(p as unknown as TeamPackage, unitCost);
  }
  if (migratedPrices) value.migrationNotice = '团队版已改为按价格计算积分：季度原价、席位数、账号数和折扣已保留；目标毛利率现包含账号及折扣，积分按新规则重新计算。旧积分配置已备份，请核对。' + (value.legacyBackup ? ' 原逐席位配置已合并或分为独立套餐，每个套餐至少 2 席，请核对席位数量。' : '');
  if (typeof value.selectedId !== 'string' || !ids.has(value.selectedId)) value = { ...value, selectedId: value.packages[0].id };
  return value as unknown as TeamState;
}

export function restoreState(raw: string): StudioState {
  const state: unknown = JSON.parse(raw);
  if (!record(state) || state.version !== 2 || !Array.isArray(state.plans) || !state.plans.length || typeof state.activeId !== 'string') throw new Error('本地方案版本或内容无效');
  const ids = new Set<string>();
  for (const plan of state.plans) {
    if (!record(plan) || typeof plan.id !== 'string' || ids.has(plan.id) || typeof plan.name !== 'string' || !Array.isArray(plan.packages) || typeof plan.creditUnitCost !== 'string' || validateNumber('creditUnitCost', plan.creditUnitCost) || typeof plan.updatedAt !== 'string') throw new Error('本地方案格式无效');
    ids.add(plan.id);
    if (plan.edition === undefined) plan.edition = 'personal';
    if (plan.edition !== 'personal' && plan.edition !== 'team') throw new Error('本地版本类型无效');
    const legacyCycle = plan.billingCycle;
    if (legacyCycle !== undefined && legacyCycle !== 'quarterly' && legacyCycle !== 'annual') throw new Error('购买周期无效');
    const legacyTeams = record(plan.team) && Array.isArray(plan.team.packages) ? plan.team.packages.filter(p => record(p) && p.billingCycle === undefined).map(p => (p as Record<string, unknown>).id) : [];
    const legacySeatFormat = record(plan.team) && Array.isArray(plan.team.seats);
    plan.team = restoreTeam(plan.team, plan.creditUnitCost);
    if (legacyCycle === 'annual') {
      const team = plan.team as TeamState;
      team.packages = team.packages.map(p => legacySeatFormat || legacyTeams.includes(p.id) ? changePackageBilling(p, 'annual', plan.creditUnitCost as string) : p);
    }
    delete plan.billingCycle;
    const packageIds = new Set<string>();
    for (const p of plan.packages) {
      if (!record(p) || typeof p.id !== 'string' || packageIds.has(p.id) || typeof p.name !== 'string' || typeof p.note !== 'string') throw new Error('本地套餐格式无效');
      packageIds.add(p.id);
      // Older v2 snapshots had no account charge; preserve their existing results.
      if (p.accountCount === undefined) p.accountCount = '0';
      if (p.billingCycle === undefined) {
        p.billingCycle = legacyCycle ?? 'quarterly';
        if (p.billingCycle === 'annual') {
          p.listPrice = D(p.listPrice as string).times(4).toString();
          if (p.manualCredits != null) p.manualCredits = D(p.manualCredits as string).times(4).toString();
          if (p.discountCredits != null) p.discountCredits = D(p.discountCredits as string).times(4).floor().toString();
        }
      }
      if (p.billingCycle !== 'quarterly' && p.billingCycle !== 'annual') throw new Error('购买周期无效');
      for (const field of ['listPrice', 'discount', 'targetMargin', 'accountCount'] as const) {
        if (typeof p[field] !== 'string' || validateNumber(field === 'targetMargin' ? 'margin' : field, p[field])) throw new Error('本地套餐数值无效');
      }
      if (p.manualCredits !== null && (typeof p.manualCredits !== 'string' || validateNumber('credits', p.manualCredits))) throw new Error('本地积分数值无效');
      analyze(p as unknown as Package, plan.creditUnitCost);
    }
    if (typeof plan.selectedId !== 'string' || !packageIds.has(plan.selectedId)) plan.selectedId = plan.packages[0]?.id ?? '';
    validateBilling(plan as unknown as Plan);
    const restored = plan as unknown as Plan;
    if (!Array.isArray(restored.packageOrder)) restored.packageOrder = [];
    restored.packageOrder = orderedPackages(restored).map(entry => entry.key);
  }
  if (!ids.has(state.activeId)) throw new Error('当前方案不存在');
  return state as unknown as StudioState;
}

export function migrateLegacy(raw: string): { state: StudioState; adjusted: number } {
  const legacy: unknown = JSON.parse(raw);
  if (!record(legacy) || legacy.version !== 1 || !Array.isArray(legacy.plans) || !legacy.plans.length) throw new Error('旧版本数据无效');
  let adjusted = 0;
  const plans: Plan[] = legacy.plans.map(value => {
    if (!record(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.packages)) throw new Error('旧版本方案无效');
    const packages = value.packages.map(p => {
      if (!record(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.listPrice !== 'string' || typeof p.discount !== 'string') throw new Error('旧版本套餐无效');
      let targetMargin = p.targetMargin;
      if (typeof targetMargin !== 'string' || validateNumber('targetMargin', targetMargin)) { targetMargin = '35'; adjusted++; }
      return { id: p.id, name: p.name, listPrice: p.listPrice, discount: p.discount, targetMargin,
        billingCycle: 'quarterly', accountCount: '0', manualCredits: null, note: typeof p.note === 'string' ? p.note : '' } as Package;
    });
    return { id: value.id, name: value.name, packages, creditUnitCost: DEFAULT_CREDIT_COST, edition: 'personal', team: createTeam(),
      selectedId: typeof value.selectedId === 'string' ? value.selectedId : packages[0]?.id ?? '',
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
      ...(typeof value.savedAt === 'string' ? { savedAt: value.savedAt } : {}) };
  });
  const state = restoreState(JSON.stringify({ version: 2, plans, activeId: plans.some(p => p.id === legacy.activeId) ? legacy.activeId : plans[0].id }));
  return { state, adjusted };
}
