import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { ArrowDownToLine, Check, CheckCircle2, ChevronDown, CircleHelp, Copy, FolderOpen, Layers3, LoaderCircle, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Save, Settings2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { ACCOUNT_UNIT_COST, CREDITS_PER_VIDEO, analyze, analyzeTeam, changeCreditCost, createPackage, createTeamPackage, editPackage, editTeamPackage, replaceTeamPackage, changePackageBilling, initialState, studioReducer, uid, validateBilling, setPackageMargin, setTeamMargin, orderedPackages } from './domain';
import type { Action, Analysis, BillingCycle, NumericField, Package, Plan, TeamAnalysis, TeamPackage, TeamState } from './domain';
import { loadState, STORAGE_KEY } from './storage';
import { NumberField } from './NumberField';
import { TeamStudio } from './TeamStudio';
import { PackageBilling } from './PackageBilling';
import { exportPlan } from './export';
import { analyzeModelVideos, VIDEO_MODELS } from './model-videos';
import { ComparisonScroll } from './ComparisonScroll';

export { STORAGE_KEY } from './storage';
const money = (value: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const integer = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
type Modal = 'save' | 'manage' | 'help' | 'reset' | null;
type PackageDraft = { kind: 'personal'; p: Package; active: boolean } | { kind: 'team'; p: TeamPackage; active: boolean };
type PackageField = Exclude<NumericField, 'creditUnitCost' | 'seatCount' | 'seatPrice' | 'margin'>;
type FieldRenderer = (p: Package, key: PackageField, label: string, options?: { compact?: boolean; prefix?: string; suffix?: string; scope?: string }) => ReactNode;
type TeamFieldRenderer = (p: TeamPackage, key: 'seatCount' | 'seatPrice' | 'discount' | 'targetMargin' | 'accountCount', label: string, options?: { prefix?: string; suffix?: string }) => ReactNode;

export default function App() {
  const [boot] = useState(() => {
    try { return loadState(localStorage); }
    catch { return { state: initialState(), error: '浏览器未允许本地存储，当前可正常计算，但无法自动保存。请导出 Excel 备份。', notice: '' }; }
  });
  const [state, dispatch] = useReducer(studioReducer, boot.state);
  const [storageError, setStorageError] = useState(boot.error);
  const [notice, setNotice] = useState(boot.notice);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [planName, setPlanName] = useState('');
  const [saveAs, setSaveAs] = useState(false);
  const [resets, setResets] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, PackageDraft>>({});
  const [editionFilter, setEditionFilter] = useState<'all' | 'personal' | 'team'>('all');
  const [cycleFilter, setCycleFilter] = useState<'all' | BillingCycle>('all');
  const [calculatorCollapsed, setCalculatorCollapsed] = useState(() => {
    try { return localStorage.getItem('pricing-studio:calculator-collapsed') === 'true'; } catch { return false; }
  });
  function toggleCalculator() {
    const next = !calculatorCollapsed;
    setCalculatorCollapsed(next);
    try { localStorage.setItem('pricing-studio:calculator-collapsed', String(next)); } catch { /* Layout remains usable without persistence. */ }
  }
  const initial = useRef(state);
  const latest = useRef(state);
  latest.current = state;
  const plan = state.plans.find(p => p.id === state.activeId)!;
  const draftKey = `${plan.id}:${plan.edition}`;
  const draft = drafts[draftKey]?.active ? drafts[draftKey] : undefined;
  const selected = draft?.kind === 'personal' ? draft.p : plan.packages.find(p => p.id === plan.selectedId);
  const editorTeam = draft?.kind === 'team' ? { ...plan.team, selectedId: draft.p.id, packages: [draft.p] } : plan.team;
  const hasErrors = Object.keys(errors).length > 0;
  const rows = useMemo(() => orderedPackages(plan).map((entry, index) => entry.kind === 'personal'
    ? { ...entry, number: index + 1, a: analyze(entry.p, plan.creditUnitCost) }
    : { ...entry, number: index + 1, a: analyzeTeam(entry.p, plan.creditUnitCost) }), [plan]);
  const matchesFilters = (row: typeof rows[number]) => (editionFilter === 'all' || row.kind === editionFilter)
    && (cycleFilter === 'all' || row.p.billingCycle === cycleFilter);
  const visibleCount = rows.filter(matchesFilters).length;
  const filtersActive = editionFilter !== 'all' || cycleFilter !== 'all';

  const reportError = useCallback((id: string, error?: string) => setErrors(previous => {
    if (previous[id] === error) return previous;
    const next = { ...previous };
    if (error) next[id] = error; else delete next[id];
    return next;
  }), []);

  useEffect(() => {
    if (state === initial.current) return;
    setSaved(false);
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); setStorageError(''); setSaved(true); }
      catch { setStorageError('本地存储不可用或空间不足，当前更改尚未保存。请导出 Excel 备份。'); }
    }, 350);
    return () => clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    const flush = () => {
      if (latest.current === initial.current) return;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current)); } catch { /* The active page already reports write failures. */ }
    };
    window.addEventListener('pagehide', flush); window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', flush); };
  }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    if (!Object.keys(drafts).length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts]);

  function setDraftActive(kind: Plan['edition'], active: boolean) {
    const key = `${plan.id}:${kind}`;
    setDrafts(previous => previous[key] ? { ...previous, [key]: { ...previous[key], active } } : previous);
  }
  function clearDraft(key = draftKey) {
    setDrafts(previous => { const next = { ...previous }; delete next[key]; return next; });
  }
  function replacePersonal(next: Package) {
    const key = `${plan.id}:personal`, pending = drafts[key];
    if (pending?.kind === 'personal' && pending.p.id === next.id) {
      setDrafts(previous => ({ ...previous, [key]: { ...pending, p: next } }));
    } else dispatch({ type: 'replace', id: next.id, package: next });
  }
  function updateCreditCost(raw: string) {
    const personal = drafts[`${plan.id}:personal`], team = drafts[`${plan.id}:team`];
    const pendingPlan = {
      ...plan,
      packages: personal?.kind === 'personal' ? [...plan.packages, personal.p] : plan.packages,
      team: { ...plan.team, packages: team?.kind === 'team' ? [...plan.team.packages, team.p] : plan.team.packages },
    };
    const next = changeCreditCost(pendingPlan, raw);
    setDrafts(previous => {
      const updated = { ...previous };
      if (personal?.kind === 'personal') updated[`${plan.id}:personal`] = { ...personal, p: next.packages.find(p => p.id === personal.p.id)! };
      if (team?.kind === 'team') updated[`${plan.id}:team`] = { ...team, p: next.team.packages.find(p => p.id === team.p.id)! };
      return updated;
    });
    dispatch({ type: 'unitCost', value: raw });
  }

  const resetDraft = (id: string) => setResets(previous => ({ ...previous, [id]: (previous[id] ?? 0) + 1 }));
  function edit(p: Package, field: PackageField, value: string) {
    const next = field === 'targetMargin' ? setPackageMargin(p, value, plan.creditUnitCost) : editPackage(p, field, value, plan.creditUnitCost);
    replacePersonal(next);
    if (field === 'targetMargin') resetDraft(`${p.id}-credits`);
  }
  function updateTeam(team: TeamState) {
    validateBilling({ ...plan, team });
    const key = `${plan.id}:team`, pending = drafts[key];
    const changed = pending?.kind === 'team' ? team.packages.find(p => p.id === pending.p.id) : undefined;
    if (pending?.kind === 'team' && changed) {
      setDrafts(previous => ({ ...previous, [key]: { ...pending, p: changed } }));
      return;
    }
    dispatch({ type: 'team', team });
  }
  function selectTeam(p: TeamPackage) {
    setDraftActive('team', false);
    updateTeam({ ...plan.team, selectedId: p.id });
    dispatch({ type: 'edition', edition: 'team' });
  }
  function selectPersonal(p: Package) {
    setDraftActive('personal', false);
    dispatch({ type: 'select', id: p.id });
    dispatch({ type: 'edition', edition: 'personal' });
  }
  function setBilling(cycle: BillingCycle, duplicate = false) {
    if (!selected) return;
    try {
      const converted = changePackageBilling(selected, cycle, plan.creditUnitCost);
      if (duplicate) {
        const next = { ...converted, id: uid(), name: selected.name + (cycle === 'annual' ? ' · 年付' : ' · 季付') };
        dispatch({ type: 'add', package: next });
      } else replacePersonal(converted);
    } catch (error) { setToast((error as Error).message); }
  }
  function editSlider(p: Package, field: 'discount' | 'targetMargin', value: string) {
    try { edit(p, field, value); resetDraft(`${p.id}-${field}`); }
    catch (error) { setToast((error as Error).message); }
  }
  function add() {
    const key = `${plan.id}:personal`;
    const next = createPackage(`新套餐 ${plan.packages.length + 1}`);
    try {
      analyze(next, plan.creditUnitCost);
      setDrafts(previous => ({ ...previous, [key]: previous[key] ? { ...previous[key], active: true } : { kind: 'personal', p: next, active: true } }));
      dispatch({ type: 'edition', edition: 'personal' });
    }
    catch { setToast('当前积分单价过小，请先调整方案设置再新增套餐'); }
  }
  function copy(p: Package) { setDraftActive('personal', false); dispatch({ type: 'add', package: { ...p, id: uid(), name: `${p.name} · 副本` } }); dispatch({ type: 'edition', edition: 'personal' }); setToast('套餐已复制'); }
  function copyTeam(p: TeamPackage) {
    setDraftActive('team', false);
    const next = { ...p, id: uid(), name: `${p.name} · 副本` };
    updateTeam({ ...plan.team, selectedId: next.id, packages: [...plan.team.packages, next] });
    dispatch({ type: 'edition', edition: 'team' });
    setToast('套餐已复制');
  }
  function removeTeam(p: TeamPackage) {
    if (plan.team.packages.length <= 1) return;
    const packages = plan.team.packages.filter(current => current.id !== p.id);
    updateTeam({ ...plan.team, packages, selectedId: plan.team.selectedId === p.id ? packages[0].id : plan.team.selectedId });
    setToast('套餐已删除');
  }
  function addTeam() {
    const key = `${plan.id}:team`;
    const next = createTeamPackage(`团队套餐 ${plan.team.packages.length + 1}`);
    try {
      analyzeTeam(next, plan.creditUnitCost);
      setDrafts(previous => ({ ...previous, [key]: previous[key] ? { ...previous[key], active: true } : { kind: 'team', p: next, active: true } }));
      dispatch({ type: 'edition', edition: 'team' });
    } catch (error) { setToast((error as Error).message); }
  }
  function savePackage() {
    if (hasErrors) { setToast('请先修正标红输入，再保存套餐'); return; }
    try {
      if (draft) {
        if (!draft.p.name.trim()) throw new Error('请填写套餐名称');
        let action: Action;
        if (draft.kind === 'personal') {
          analyze(draft.p, plan.creditUnitCost);
          action = { type: 'add', package: draft.p };
        } else {
          const team = { ...plan.team, selectedId: draft.p.id, packages: [...plan.team.packages, draft.p] };
          validateBilling({ ...plan, team });
          action = { type: 'team', team };
        }
        // Do not publish a new package or discard its draft if local saving fails.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(studioReducer(state, action)));
        dispatch(action);
        setStorageError('');
        clearDraft();
        setEditionFilter('all'); setCycleFilter('all');
        setToast('套餐已保存到右侧列表');
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current));
        setStorageError(''); setSaved(true); setToast('套餐已保存');
      }
    } catch { setToast('套餐保存失败，草稿已保留，请检查浏览器存储后重试。'); }
  }
  function openSave() {
    if (hasErrors) { setToast('请先修正标红输入，再保存方案'); return; }
    setPlanName(plan.name); setSaveAs(false); setModal('save');
  }
  function save() {
    if (!planName.trim() || hasErrors) return;
    dispatch({ type: 'save', name: planName.trim(), asNew: saveAs }); setModal(null); setToast(saveAs ? '已另存为新方案' : '方案已保存');
  }
  async function download() {
    if (hasErrors) { setToast('请先修正标红输入，再导出'); return; }
    setExporting(true);
    try { await exportPlan(plan); setToast('Excel 已导出'); } catch { setToast('导出失败，请重试'); }
    finally { setExporting(false); }
  }
  const field: FieldRenderer = (p, key, label, options = {}) => {
    const a = analyze(p, plan.creditUnitCost);
    const value = key === 'credits' ? a.credits : key === 'targetMargin' ? a.margin : p[key];
    return <NumberField key={`${options.scope ?? 'editor'}-${p.id}-${key}`} id={`${options.scope ?? 'editor'}-${p.id}-${key}`}
      field={key === 'targetMargin' ? 'margin' : key} fractionDigits={key === 'targetMargin' ? 2 : undefined} value={value} label={label} {...options} resetToken={resets[`${p.id}-${key}`] ?? 0}
      onCommit={raw => edit(p, key, raw)} onError={reportError} />;
  };
  const teamField: TeamFieldRenderer = (p, key, label, options = {}) => (
    <NumberField key={`table-team-${p.id}-${key}`} id={`table-team-${p.id}-${key}`}
      field={key === 'targetMargin' ? 'margin' : key} fractionDigits={key === 'targetMargin' ? 2 : undefined} value={key === 'targetMargin' ? analyzeTeam(p, plan.creditUnitCost).margin : p[key]} label={label} compact {...options}
      onCommit={raw => updateTeam(replaceTeamPackage(plan.team, key === 'targetMargin' ? setTeamMargin(p, raw, plan.creditUnitCost) : editTeamPackage(p, key, raw, plan.creditUnitCost)))}
      onError={reportError} />
  );

  return <div className="app">
    <header className="site-header"><div className="header-inner">
      <a href="#" className="brand"><span className="brand-icon"><Layers3 size={21} /></span><strong>Pricing Studio</strong><span className="brand-tag">积分定价工作台</span></a>
      <span className="private-label"><ShieldCheck size={14} /> 本地保存 · CNY</span>
    </div></header>
    <main>
      <div className="layout-controls">
        <button className="button small calculator-toggle" aria-expanded={!calculatorCollapsed} aria-controls="pricing-editor" onClick={toggleCalculator}>{calculatorCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}{calculatorCollapsed ? '展开计算器' : '收起计算器'}</button>
      </div>
      <div className={`studio-layout${calculatorCollapsed ? ' calculator-collapsed' : ''}`}>
      <div className="pricing-editor" id="pricing-editor" hidden={calculatorCollapsed}>
      <div className="editor-toolbar">
      <div className="scheme-toolbar"><div className="scheme-selector-group"><div className="plan-picker"><FolderOpen size={15} /><select aria-label="切换定价方案" value={state.activeId} onChange={e => dispatch({ type: 'switch', id: e.target.value })}>{state.plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><ChevronDown size={12} /><button className="icon-button" aria-label="管理方案" title="管理方案" onClick={() => setModal('manage')}><MoreHorizontal size={18} /></button></div><div className="edition-switch" role="group" aria-label="定价版本"><button aria-pressed={plan.edition === 'personal'} onClick={() => dispatch({ type: 'edition', edition: 'personal' })}>个人版</button><button aria-pressed={plan.edition === 'team'} onClick={() => dispatch({ type: 'edition', edition: 'team' })}>团队版</button></div></div><div className="editor-create-actions"><button className="button small" onClick={add}><Plus size={14} />新增个人套餐</button><button className="button small" onClick={addTeam}><Plus size={14} />新增团队套餐</button></div><span className={`save-status ${storageError ? 'error' : ''}`}><i />{storageError ? '本地存储异常' : hasErrors ? '有待修正输入' : draft ? '草稿未保存' : saved ? '已自动保存' : '所有结果实时更新'}</span></div>
      {notice && <div className="notice"><span>{notice}</span><button className="icon-button" aria-label="关闭迁移提示" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {storageError && <div className="alert" role="alert">{storageError}</div>}
      <div className="input-validation-summary"><span hidden={!hasErrors} role={hasErrors ? 'alert' : undefined}>请修正标红输入；结果暂按最后有效值计算。</span></div>
      </div>

      <div className="calculator-panel" id="calculator-panel" hidden={calculatorCollapsed} key={plan.id}>
        {draft && <div className="draft-notice" role="status"><span>新套餐 · 尚未保存，保存后才会出现在右侧列表</span><button className="text-button" onClick={() => clearDraft()}>放弃草稿</button></div>}
        {plan.edition === 'team' ? <TeamStudio key={editorTeam.selectedId} team={editorTeam} isDraft={draft?.kind === 'team'} unitCost={plan.creditUnitCost} onChange={updateTeam} onError={reportError} /> : <>
        {selected ? <div className="workspace-grid" key={selected.id}>
          <section className="card input-card"><div className="card-heading"><div className="step">1</div><div><h2>设置套餐</h2><p>只需填写这三个定价条件</p></div><span className="card-corner">每份套餐</span></div>
            <div className="editor-body">
              <NameField key={selected.id} value={selected.name} id={`name-${selected.id}`} label="套餐名称" onCommit={name => replacePersonal({ ...selected, name })} onError={reportError} />
              <PackageBilling cycle={selected.billingCycle} onChange={cycle => setBilling(cycle)} onDuplicate={draft ? undefined : cycle => setBilling(cycle, true)} />
              <div className="price-field">{field(selected, 'listPrice', '套餐原价', { prefix: '¥' })}<span className="field-hint">{selected.billingCycle === 'annual' ? '全年优惠前标价，可直接修改年付价格' : '每季度优惠前的标价'}</span></div>
              <div className="slider-field"><div className="slider-heading"><label htmlFor="discount-slider">优惠百分比</label>{field(selected, 'discount', '优惠百分比输入', { suffix: '%', compact: true })}</div>
                <input id="discount-slider" type="range" aria-label="优惠百分比滑块" min="0" max="99" step="0.5" value={selected.discount} style={{ '--fill': `${Number(selected.discount) / 99 * 100}%` } as React.CSSProperties} onChange={e => editSlider(selected, 'discount', e.target.value)} />
                <div className="range-legend"><span>{Number(selected.discount) === 0 ? '不打折，按原价出售' : `优惠 ${Number(selected.discount)}% = ${(10 * (1 - Number(selected.discount) / 100)).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 折`}</span><span>0—99%</span></div>
              </div>
              <p className="field-hint">修改优惠只影响实收和毛利率，不改变已配置的积分。</p>
              <div className="received"><span>用户实际支付（{selected.billingCycle === 'annual' ? '全年' : '每季'}）</span><strong>{money(analyze(selected, plan.creditUnitCost).salePrice)}</strong></div>
              <div className="margin-field">
                {field(selected, 'targetMargin', '毛利率', { suffix: '%' })}
                <p className="field-hint">显示当前毛利率；修改后按实收金额重新配置积分。</p>
              </div>
              <details className="note-details"><summary>套餐备注 <ChevronDown size={13} /></summary><textarea aria-label="套餐备注" placeholder="例如：月度套餐，积分当月有效…" value={selected.note} onChange={e => replacePersonal({ ...selected, note: e.target.value })} /></details>
            </div>
          </section>
          <Results p={selected} a={analyze(selected, plan.creditUnitCost)} billingCycle={selected.billingCycle} unitCost={plan.creditUnitCost} field={field} />
        </div> : <section className="empty-state card"><Layers3 size={30} /><h2>从一个套餐开始</h2><p>设定价格，算出成本预算和可发放积分。</p><button className="button primary" onClick={add}><Plus size={15} />创建第一个套餐</button></section>}

        </>}
      </div>
<div className="editor-bottom" hidden={calculatorCollapsed}>        <details className="scheme-settings" hidden={calculatorCollapsed}><summary><span><Settings2 size={15} />方案设置 <small>当前 ¥{Number(plan.creditUnitCost).toLocaleString('zh-CN', { maximumFractionDigits: 8 })}／积分</small></span><ChevronDown size={14} /></summary><div className="settings-body"><div>{<NumberField id={`unit-cost-${plan.id}`} field="creditUnitCost" value={plan.creditUnitCost} label="每积分成本" prefix="¥" suffix="／积分" resetToken={resets['unit-cost'] ?? 0} onError={reportError} onCommit={updateCreditCost} />}<p className="field-hint">个人版与团队版共用此单价。个人版手动积分保持不变；团队版价格保持不变，积分按成本预算重新计算。</p></div><div className="reset-setting"><span>恢复默认套餐、团队席位和 ¥0.2／积分</span><button className="button small" onClick={() => setModal('reset')}><RotateCcw size={13} />重置当前方案</button></div></div></details><div className="package-save-bar"><span>{draft ? '新套餐配置完成后，点击保存加入列表' : '已有套餐的修改实时同步至列表'}</span><button className="button primary" onClick={savePackage} disabled={hasErrors || (!selected && plan.edition === 'personal')}><Save size={15} />保存套餐</button></div></div>

      </div>
      <section className="comparison-panel" aria-label="全部套餐对比">
        <div className="comparison-heading"><div><h2>全部套餐对比 <span>{rows.length} 个套餐</span></h2><p>点击套餐名称选中编辑，结果实时同步。年付与季付独立保存。</p></div><div className="comparison-actions">
          <button className="button small primary" onClick={download} disabled={exporting}>{exporting ? <LoaderCircle size={14} className="spin" /> : <ArrowDownToLine size={14} />}{exporting ? '正在导出' : '导出 Excel'}</button></div></div>
        <div className="comparison-surface"><div className="comparison card">
          <div className="comparison-filters" role="group" aria-label="套餐列表筛选">
            <label>版本<select aria-label="筛选版本" value={editionFilter} onChange={event => setEditionFilter(event.target.value as typeof editionFilter)}><option value="all">全部版本</option><option value="personal">个人版</option><option value="team">团队版</option></select></label>
            <label>周期<select aria-label="筛选周期" value={cycleFilter} onChange={event => setCycleFilter(event.target.value as typeof cycleFilter)}><option value="all">全部周期</option><option value="quarterly">季付</option><option value="annual">年付</option></select></label>
            <span role="status">显示 {visibleCount} / {rows.length} 个套餐</span>
            {filtersActive && <button className="text-button" onClick={() => { setEditionFilter('all'); setCycleFilter('all'); }}>清除筛选</button>}
          </div>
          <div className="model-price-help" id="model-price-help"><span>模型视频单价 · 480P</span><span>实收金额 ÷ 完整视频数；团队按每席取整后汇总。各模型为独立测算，不叠加使用积分。</span><span className="scroll-hint">滚轮上下滚动 · Shift + 滚轮左右滚动</span></div>
          <ComparisonScroll><table role="table" aria-label="套餐对比数据">
            <colgroup>{[150, 55, 55, 98, 66, 95, 90, 100, 100, 110, 80, 85, 100, 100, 76].map((width, index) => <col key={index} style={{ width }} />)}{VIDEO_MODELS.map(model => <col key={model.id} style={{ width: 132 }} />)}</colgroup>
            <thead role="rowgroup"><tr role="row"><th>套餐 / 版本</th><th>周期</th><th>席位</th><th>原价</th><th>优惠</th><th>实收金额</th><th>毛利率</th><th>成本预算</th><th>账号 / 成本</th><th>发放积分</th><th title={`积分按套餐周期、按席位除以 ${CREDITS_PER_VIDEO} 向下取整后汇总`}>视频个数</th><th title="实收金额 ÷ 视频个数">视频单价</th><th>总成本</th><th>总利润</th><th>操作</th>{VIDEO_MODELS.map(model => <th key={model.id} className="model-price-heading" scope="col">{model.name}<small>480P · {model.creditsPerVideo} 积分 / 个</small></th>)}</tr></thead>
            <tbody role="rowgroup">{rows.map((row) => row.kind === 'personal' ? <PackageRow number={row.number} hidden={!matchesFilters(row)} key={'personal-' + row.p.id} p={row.p} a={row.a} billingCycle={row.p.billingCycle} selected={!draft && plan.edition === 'personal' && row.p.id === selected?.id} field={field} onSelect={() => selectPersonal(row.p)} onCopy={() => copy(row.p)} onDelete={() => { dispatch({ type: 'remove', id: row.p.id }); setToast('套餐已删除'); }} /> : <TeamComparisonRow number={row.number} hidden={!matchesFilters(row)} key={'team-' + row.p.id} p={row.p} a={row.a} billingCycle={row.p.billingCycle} selected={!draft && plan.edition === 'team' && row.p.id === plan.team.selectedId} field={teamField} onSelect={() => selectTeam(row.p)} onCopy={() => copyTeam(row.p)} onDelete={() => removeTeam(row.p)} deleteDisabled={plan.team.packages.length <= 1} />)}{!visibleCount && <tr><td colSpan={15 + VIDEO_MODELS.length} className="empty-table">{filtersActive ? '没有符合筛选条件的套餐，请调整或清除筛选。' : '暂无套餐，添加一个开始计算。'}</td></tr>}</tbody>
          </table></ComparisonScroll>
          <div className="table-footer"><span><i />每行按套餐周期计算；年付、季付可独立定价</span><span>模型积分按截图配置；不足生成 1 个视频时显示 —</span></div>
        </div>
        </div>
      </section>
      </div>
      <footer><span><ShieldCheck size={13} />数据只保存在当前浏览器</span><button onClick={() => setModal('help')}><CircleHelp size={13} />计算说明</button></footer>
    </main>
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast('')} aria-label="关闭提示"><X size={14} /></button></div>}
    {modal && <ModalFrame title={{ save: '保存定价方案', manage: '我的定价方案', help: '计算说明', reset: '重置当前方案' }[modal]} onClose={() => setModal(null)}>
      {modal === 'save' && <form onSubmit={e => { e.preventDefault(); save(); }}><p className="modal-description">保存个人套餐、团队席位、账号数量、折扣及积分设置。</p><label className="modal-label" htmlFor="plan-name">方案名称</label><input id="plan-name" className="text-input" autoFocus maxLength={80} value={planName} onChange={e => setPlanName(e.target.value)} /><label className="checkbox-label"><input type="checkbox" checked={saveAs} onChange={e => setSaveAs(e.target.checked)} />另存为新方案，保留当前方案</label><div className="modal-actions"><button type="button" className="button" onClick={() => setModal(null)}>取消</button><button className="button primary" disabled={!planName.trim() || hasErrors}><Save size={14} />保存方案</button></div></form>}
      {modal === 'reset' && <><p className="modal-description">将「{plan.name}」恢复为四个个人示例套餐和默认的 2 个团队席位，积分单价恢复为 ¥0.2。其他方案不受影响。此操作无法撤销，可先另存一份方案。</p><div className="modal-actions"><button className="button" onClick={() => setModal(null)}>取消</button><button className="button danger" onClick={() => { clearDraft(plan.id + ':personal'); clearDraft(plan.id + ':team'); dispatch({ type: 'reset' }); resetDraft('unit-cost'); setModal(null); setToast('已恢复默认设置'); }}>确认重置</button></div></>}
      {modal === 'manage' && <><p className="modal-description">每份方案独立自动保存，可使用不同的积分单价。</p><div className="plan-list">{state.plans.map(p => <PlanItem key={p.id} plan={p} active={p.id === plan.id} onSelect={() => { dispatch({ type: 'switch', id: p.id }); setModal(null); }} onRename={name => dispatch({ type: 'rename', id: p.id, name })} onDelete={() => { dispatch({ type: 'deletePlan', id: p.id }); setToast('方案已删除'); }} />)}</div><button className="button full-width" onClick={() => { openSave(); setSaveAs(true); }}><Copy size={14} />另存当前方案</button><button className="button full-width" onClick={() => { dispatch({ type: 'newPlan', name: `新定价方案 ${state.plans.length + 1}` }); setModal(null); }}><Plus size={14} />新建空白方案</button></>}
      {modal === 'help' && <div className="help-content">
        <p>所有结果按售出一份套餐计算。毛利率始终显示（实收金额 − 总成本）÷ 实收金额。</p>
        <h3>修改毛利率</h3><p>输入毛利率后，按“实收金额 ×（1 − 输入毛利率）”计算成本预算，扣除账号成本后换算积分。积分按整数向下取整，因此最终显示的毛利率可能略高；账号成本超出预算时显示可实现的毛利率。</p>
        <h3>折扣与积分</h3><p>修改折扣保持积分和成本不变，只更新实收、利润、毛利率和视频单价。直接调整个人版发放积分也会更新毛利率；再次修改毛利率将重新配置积分。</p>
        <h3>团队版</h3><p>同一套餐所有席位共用每席价格和积分，最低 2 席。增减席位保留每席积分，更新总积分和毛利率。修改毛利率、价格或账号数将重新配置每席积分。</p>
        <h3>购买周期与保存</h3><p>年付与季付分别保存，年付初始价格为季付 ×4。账号成本每季 ¥26、每年 ¥104。数据保存在当前浏览器，清除浏览器数据前请导出备份。</p>
      </div>}
    </ModalFrame>}
  </div>;
}

function Results({ p, a, billingCycle, unitCost, field }: { p: Package; a: Analysis; billingCycle: BillingCycle; unitCost: string; field: FieldRenderer }) {
  const profitWidth = a.salePrice > 0 ? Math.min(100, Math.max(0, a.margin ?? 0)) : 0;
  return <section className="card results-card" aria-label="套餐计算结果"><div className="card-heading"><div className="step result-step">2</div><div><h2>成本与积分</h2><p>按当前发放积分计算</p></div><span className="live-badge"><i />实时计算</span></div><div className="result-body">
    <div className="result-hero"><div className="budget-tile"><div className="result-label">套餐总成本</div><strong data-testid="budget">{money(a.actualCost)}</strong><small>账号与积分的实际成本</small></div><div className="credit-tile"><div className="result-label"><Sparkles size={13} />发放积分</div><strong data-testid="configured-credits">{integer(a.credits)}<span>积分</span></strong><small>每积分 ¥{Number(unitCost).toLocaleString('zh-CN', { maximumFractionDigits: 8 })}</small><div className="video-estimate"><span>可生成视频</span><b data-testid="configured-videos">{integer(a.videoCount)} 个</b><span>每个 {CREDITS_PER_VIDEO} 积分，向下取整</span></div></div></div>
    <div className="budget-equation"><span>实收 <b>{money(a.salePrice)}</b></span><span className="equation-symbol">−</span><span>成本 <b>{money(a.actualCost)}</b></span><span className="equation-symbol">=</span><span>利润 <b>{money(a.profit)}</b></span></div>
    <div className="account-allocation">
      <div className="account-heading"><h3>账号成本</h3><span>¥{Number(ACCOUNT_UNIT_COST) * (billingCycle === 'annual' ? 4 : 1)} / 个 / {billingCycle === 'annual' ? '年' : '季'}</span></div>
      <div className="account-input">{field(p, 'accountCount', '账号数量', { suffix: '个' })}<div><span>账号小计</span><strong data-testid="account-cost">{money(a.accountCost)}</strong></div></div>
      <div className="credit-budget"><span>积分成本</span><strong data-testid="credit-budget">{money(a.creditCost)}</strong></div>
    </div>
    <div className="allocation"><div className="allocation-heading"><h3>发放配置{billingCycle === 'annual' ? '（全年）' : '（每季）'}</h3></div><div className="allocation-input">{field(p, 'credits', '发放积分', { suffix: '积分' })}<span>可生成 <b data-testid="actual-videos">{integer(a.videoCount)} 个视频</b><br />按发放积分 ÷ {CREDITS_PER_VIDEO}，向下取整</span></div></div>
    <div className="actual-metrics"><div><span>总成本</span><strong data-testid="actual-cost">{money(a.actualCost)}</strong></div><div><span>总利润</span><strong className={a.loss ? 'text-red' : 'text-green'} data-testid="actual-profit">{money(a.profit)}</strong></div></div>
    <p className="cost-breakdown">总成本 = 账号 {money(a.accountCost)} + 积分 {money(a.creditCost)}</p>
    <div className={`composition-bar ${a.loss ? 'loss' : ''}`} role="img" aria-label={`总成本 ${money(a.actualCost)}，总利润 ${money(a.profit)}`}><span style={{ width: `${a.loss ? 100 : a.salePrice === 0 ? 100 : 100 - profitWidth}%` }} /><span style={{ width: `${a.loss ? 0 : profitWidth}%` }} /></div>
    <div className={`result-status ${a.loss ? 'warning' : ''}`}><span><i />{a.loss ? '已亏损' : a.salePrice === 0 ? '暂无收入' : '盈利'}</span><span>视频单价 {a.videoUnitPrice === null ? '—' : money(a.videoUnitPrice)}</span></div>
    <p className="result-footnote">折扣不改变积分；修改毛利率会重新配置积分。积分向下取整，显示值以当前收入和成本为准。</p>
  </div></section>;
}

function selectComparisonRow(event: ReactMouseEvent<HTMLTableRowElement>, onSelect: () => void) {
  // Nested controls keep their own actions and input focus.
  if ((event.target as Element).closest('button, input, select, textarea, a, label, .number-field, [contenteditable="true"]')) return;
  onSelect();
}

function activateComparisonRow(event: ReactKeyboardEvent<HTMLTableRowElement>, onSelect: () => void) {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  onSelect();
}

function PackageRow({ p, a, number, hidden, billingCycle, selected, field, onSelect, onCopy, onDelete }: { p: Package; a: Analysis; number: number; hidden: boolean; billingCycle: BillingCycle; selected: boolean; field: FieldRenderer; onSelect: () => void; onCopy: () => void; onDelete: () => void }) {
  const annual = billingCycle === 'annual';
  return <tr role="row" hidden={hidden} className={`selectable-row${selected ? ' selected-row' : ''}`} tabIndex={0} aria-current={selected ? 'true' : undefined} aria-label={p.name + '对比'} onClick={event => selectComparisonRow(event, onSelect)} onKeyDown={event => activateComparisonRow(event, onSelect)}><td role="cell" data-label="套餐 / 版本"><span className="package-number" aria-label={`套餐编号 ${number}`}>{number}</span><button className="table-name" aria-label={p.name} onClick={onSelect}><i />{p.name}{selected && <span>编辑中</span>}</button><span className="edition-badge">个人版</span></td>
    <td role="cell" data-label="周期">{annual ? '年付' : '季付'}</td><td role="cell" data-label="席位">—</td>
    <td role="cell" data-label="原价">{field(p, 'listPrice', `${p.name}原价`, { prefix: '¥', compact: true, scope: 'table' })}</td><td role="cell" data-label="优惠">{field(p, 'discount', `${p.name}优惠`, { suffix: '%', compact: true, scope: 'table' })}</td><td role="cell" data-label="实收金额">{money(a.salePrice)}</td><td role="cell" data-label="毛利率">{field(p, 'targetMargin', `${p.name}毛利率`, { suffix: '%', compact: true, scope: 'table' })}</td><td role="cell" data-label="成本预算" className="budget-cell">{money(a.budget)}</td>
    <td role="cell" data-label="账号 / 成本">{field(p, 'accountCount', `${p.name}账号数量`, { suffix: '个', compact: true, scope: 'table' })}<div className="table-account-cost">{money(a.accountCost)}</div></td>
    <td role="cell" data-label="发放积分" className="table-credits">{field(p, 'credits', `${p.name}发放积分`, { suffix: '积分', compact: true, scope: 'table' })}</td>
    <td role="cell" data-label="视频个数" className="table-videos" aria-label={`${p.name}视频个数`}><strong>{integer(a.videoCount)}</strong><span> 个</span><div className="table-video-hint">{CREDITS_PER_VIDEO} 积分 / 个</div></td>
    <td role="cell" data-label="视频单价" aria-label={`${p.name}视频单价`} title="实收金额 ÷ 视频个数">{a.videoUnitPrice === null ? '—' : money(a.videoUnitPrice)}</td>
    <td role="cell" data-label="总成本">{money(a.actualCost)}</td><td role="cell" data-label="总利润" className={a.loss ? 'text-red' : 'text-green'}>{money(a.profit)}</td>
    <td role="cell" data-label="操作"><PackageRowActions name={p.name} onCopy={onCopy} onDelete={onDelete} /></td><ModelPriceCells name={p.name} analysis={a} /></tr>;
}

function TeamComparisonRow({ p, a, number, hidden, billingCycle, selected, field, onSelect, onCopy, onDelete, deleteDisabled }: { p: TeamPackage; a: TeamAnalysis; number: number; hidden: boolean; billingCycle: BillingCycle; selected: boolean; field: TeamFieldRenderer; onSelect: () => void; onCopy: () => void; onDelete: () => void; deleteDisabled: boolean }) {
  return <tr role="row" hidden={hidden} className={`selectable-row${selected ? ' selected-row' : ''}`} tabIndex={0} aria-current={selected ? 'true' : undefined} aria-label={p.name + '对比'} onClick={event => selectComparisonRow(event, onSelect)} onKeyDown={event => activateComparisonRow(event, onSelect)}>
    <td role="cell" data-label="套餐 / 版本"><span className="package-number" aria-label={`套餐编号 ${number}`}>{number}</span><button className="table-name" aria-label={p.name} onClick={onSelect}><i />{p.name}{selected && <span>编辑中</span>}</button><span className="edition-badge team">团队版</span></td>
    <td role="cell" data-label="周期">{billingCycle === 'annual' ? '年付' : '季付'}</td>
    <td role="cell" data-label="席位">{field(p, 'seatCount', p.name + '席位数')}</td>
    <td role="cell" data-label="原价">{field(p, 'seatPrice', p.name + '每席原价', { prefix: '¥', suffix: '/席' })}<small className="table-hint">合计 {money(a.listPrice)}</small></td>
    <td role="cell" data-label="优惠">{field(p, 'discount', p.name + '优惠', { suffix: '%' })}</td>
    <td role="cell" data-label="实收金额">{money(a.salePrice)}</td>
    <td role="cell" data-label="毛利率">{field(p, 'targetMargin', p.name + '毛利率', { suffix: '%' })}</td>
    <td role="cell" data-label="成本预算" className="budget-cell">{money(a.budget)}</td>
    <td role="cell" data-label="账号 / 成本">{field(p, 'accountCount', p.name + '账号数量', { suffix: '个' })}<small className="table-hint">{money(a.accountCost)}</small></td>
    <td role="cell" data-label="发放积分">{integer(a.credits)} 积分<small className="table-hint">{integer(a.seatCredits)} / 席</small></td>
    <td role="cell" data-label="视频个数" aria-label={p.name + '视频个数'} title="总视频数 = 每人完整视频数 × 席位数"><span>{integer(a.videoCount)} 个</span><small className="table-hint">{integer(a.seatVideoCount)} 个 / 人</small></td>
    <td role="cell" data-label="视频单价" aria-label={p.name + '视频单价'} title="实收金额 ÷ 视频个数">{a.videoUnitPrice === null ? '—' : money(a.videoUnitPrice)}</td>
    <td role="cell" data-label="总成本">{money(a.actualCost)}</td><td role="cell" data-label="总利润" className={a.loss ? 'text-red' : 'text-green'}>{money(a.profit)}</td><td role="cell" data-label="操作"><PackageRowActions name={p.name} onCopy={onCopy} onDelete={onDelete} deleteDisabled={deleteDisabled} /></td><ModelPriceCells name={p.name} analysis={a} />
  </tr>;
}

function ModelPriceCells({ name, analysis }: { name: string; analysis: Analysis | TeamAnalysis }) {
  return <>{analyzeModelVideos(analysis).map(model => <td key={model.id} role="cell" className="model-price-cell" data-label={model.name} aria-label={`${name} ${model.name}视频单价`} title={`${model.name} · 480P · ${model.creditsPerVideo} 积分/个；本套餐可生成 ${model.videoCount} 个完整视频`}>
    <strong>{model.unitPrice === null ? '—' : money(model.unitPrice)}</strong><small>{integer(model.videoCount)} 个视频</small>
  </td>)}</>;
}

function PackageRowActions({ name, onCopy, onDelete, deleteDisabled = false }: { name: string; onCopy: () => void; onDelete: () => void; deleteDisabled?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="row-actions">{confirming ? <><button className="icon-button danger-icon" aria-label={`确认删除${name}`} title="确认删除套餐" disabled={deleteDisabled} onClick={onDelete}><Check size={14} /></button><button className="icon-button" aria-label="取消删除" title="取消删除" onClick={() => setConfirming(false)}><X size={14} /></button></> : <><button className="icon-button" aria-label={`复制${name}`} title="复制套餐" onClick={onCopy}><Copy size={14} /></button><button className="icon-button delete" aria-label={`删除${name}`} title={deleteDisabled ? '至少保留一个团队套餐' : '删除套餐'} disabled={deleteDisabled} onClick={() => setConfirming(true)}><Trash2 size={14} /></button></>}</div>;
}

function NameField({ value, id, label, onCommit, onError }: { value: string; id: string; label: string; onCommit: (value: string) => void; onError: (id: string, error?: string) => void }) {
  const [draft, setDraft] = useState(value);
  const invalid = !draft.trim();
  const report = useRef(onError); report.current = onError;
  useEffect(() => () => report.current(id, undefined), [id]);
  return <div className="name-field"><label htmlFor={id}>{label}</label><input id={id} className="text-input" maxLength={50} value={draft} aria-invalid={invalid} onChange={e => { const next = e.target.value; setDraft(next); onError(id, next.trim() ? undefined : '请填写套餐名称'); if (next.trim()) onCommit(next); }} />{invalid && <span className="field-error">请填写套餐名称</span>}</div>;
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const elements = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,a[href]') ?? []);
    (ref.current?.querySelector<HTMLElement>('[autofocus]') ?? elements()[0])?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') { const nodes = elements(), first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
}

function PlanItem({ plan, active, onSelect, onRename, onDelete }: { plan: Plan; active: boolean; onSelect: () => void; onRename: (name: string) => void; onDelete: () => void }) {
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(plan.name), [confirming, setConfirming] = useState(false);
  return <div className={`plan-item ${active ? 'active' : ''}`}><FolderOpen size={18} /><div className="plan-item-main">{renaming ? <form onSubmit={e => { e.preventDefault(); if (name.trim()) { onRename(name.trim()); setRenaming(false); } }}><input aria-label="重命名方案" value={name} onChange={e => setName(e.target.value)} autoFocus maxLength={80} /><button className="icon-button" disabled={!name.trim()} aria-label="确认重命名"><Check size={14} /></button></form> : <button className="plan-item-name" onClick={onSelect}>{plan.name}{active && <span>当前</span>}</button>}<small>{plan.packages.length} 个套餐 · ¥{Number(plan.creditUnitCost)}／积分</small></div>{confirming ? <><button className="button small danger" onClick={onDelete}>确认删除</button><button className="icon-button" aria-label="取消删除方案" onClick={() => setConfirming(false)}><X size={14} /></button></> : <><button className="icon-button" aria-label={`重命名${plan.name}`} title="重命名" onClick={() => setRenaming(!renaming)}><Settings2 size={14} /></button><button className="icon-button delete" aria-label={`删除方案${plan.name}`} title="删除方案" onClick={() => setConfirming(true)}><Trash2 size={14} /></button></>}</div>;
}
