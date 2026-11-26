import { useEffect, useRef, useState } from 'react';
import { Copy, Minus, Plus, Trash2, Users } from 'lucide-react';
import { ACCOUNT_UNIT_COST, CREDITS_PER_VIDEO, analyzeTeam, editTeamPackage, replaceTeamPackage, uid, changePackageBilling, setTeamMargin } from './domain';
import type { TeamPackage, TeamState } from './domain';
import { NumberField } from './NumberField';
import { PackageBilling } from './PackageBilling';

const money = (value: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value);
const integer = (value: number) => value.toLocaleString('zh-CN');
type Field = 'seatPrice' | 'targetMargin' | 'seatCount' | 'accountCount' | 'discount';
interface Props { team: TeamState; unitCost: string; isDraft?: boolean; onChange: (team: TeamState) => void; onError: (id: string, error?: string) => void }

export function TeamStudio({ team, unitCost, isDraft = false, onChange, onError }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [countReset, setCountReset] = useState(0);
  const p = team.packages.find(p => p.id === team.selectedId) ?? team.packages[0];
  const billingCycle = p.billingCycle;
  const a = analyzeTeam(p, unitCost);
  function setBilling(cycle: TeamPackage['billingCycle'], duplicate = false) {
    try {
      const converted = changePackageBilling(p, cycle, unitCost);
      if (duplicate) {
        const next = { ...converted, id: uid(), name: p.name + (cycle === 'annual' ? ' · 年付' : ' · 季付') };
        onChange({ ...team, selectedId: next.id, packages: [...team.packages, next] });
      } else onChange(replaceTeamPackage(team, converted));
      setActionError('');
    } catch (error) { setActionError((error as Error).message); }
  }
  function edit(field: Field, value: string) { onChange(replaceTeamPackage(team, field === 'targetMargin' ? setTeamMargin(p, value, unitCost) : editTeamPackage(p, field, value, unitCost))); }
  function step(delta: number) {
    try { edit('seatCount', String(Number(p.seatCount) + delta)); setCountReset(n => n + 1); setActionError(''); }
    catch (error) { setActionError((error as Error).message); }
  }
  function copy() {
    const next = { ...p, id: uid(), name: p.name + ' · 副本' };
    try { analyzeTeam(next, unitCost); onChange({ ...team, selectedId: next.id, packages: [...team.packages, next] }); setActionError(''); }
    catch (error) { setActionError((error as Error).message); }
  }
  function remove() {
    if (team.packages.length <= 1) return;
    const packages = team.packages.filter(value => value.id !== p.id);
    onChange({ ...team, packages, selectedId: packages[0].id }); setConfirming(null);
  }
  function field(key: Field, label: string, suffix: string) {
    return <NumberField id={'team-' + p.id + '-' + key} field={key === 'targetMargin' ? 'margin' : key} fractionDigits={key === 'targetMargin' ? 2 : undefined} label={label} value={key === 'targetMargin' ? a.margin : p[key]} suffix={suffix} onError={onError}
      resetToken={key === 'seatCount' ? countReset : undefined} onCommit={value => edit(key, value)} />;
  }
  const profitWidth = Math.max(0, Math.min(100, a.margin ?? 0));
  return <div>
    {team.migrationNotice && <div className="notice"><span>{team.migrationNotice}</span><button className="text-button" onClick={() => onChange({ ...team, migrationNotice: undefined })}>知道了</button></div>}
    {actionError && <div className="alert" role="alert">{actionError}</div>}
    <div className="team-workspace" key={p.id}>
      <section className="card team-editor" aria-label="团队套餐设置">
        <div className="card-heading"><div className="step"><Users size={16} /></div><div><h2>按价格配置每个席位</h2><p>{billingCycle === 'annual' ? '全年定价' : '每季定价'} → 成本预算 → 自动计算积分</p></div></div>
        <div className="team-config-body">
          <TeamName key={p.id} p={p} onChange={next => onChange(replaceTeamPackage(team, next))} onError={onError} />
          <PackageBilling cycle={billingCycle} onChange={cycle => setBilling(cycle)} onDuplicate={isDraft ? undefined : cycle => setBilling(cycle, true)} />
          <div className="team-config-grid">
            {field('seatPrice', '每席原价', billingCycle === 'annual' ? '元 / 年' : '元 / 季')}
            {field('targetMargin', '团队毛利率', '%')}
          </div>
          <div className="team-unit-price"><div><span>每席可发积分（{billingCycle === 'annual' ? '全年' : '每季'}）</span><strong data-testid="seat-credits">{integer(a.seatCredits)}<small>积分 / 席</small></strong></div><div><span>每席积分成本</span><b data-testid="seat-cost">{money(a.seatCost)}</b><small>可生成 {integer(a.seatVideoCount)} 个视频</small></div></div>
          <div className="team-count-row"><div className="team-count-field">{field('seatCount', '套餐席位数', '席')}</div><div className="seat-counter"><button className="icon-button" aria-label="减少一个席位" disabled={a.seatCount <= 2} onClick={() => step(-1)}><Minus size={16} /></button><button className="icon-button" aria-label="增加一个席位" onClick={() => step(1)}><Plus size={16} /></button></div></div>
          <p className="field-hint">最低 2 席。增减席位时，每席价格与积分保持不变，只更新总量、成本和实际毛利率。</p>
          <div className="team-seat-total"><span data-testid="seat-count">{integer(a.seatCount)} 个席位</span><span>合计 <strong data-testid="team-credits">{integer(a.credits)}</strong> 积分 · {integer(a.videoCount)} 个视频</span></div>
          <div className="team-explanation"><p>毛利率显示当前收入和成本的计算结果，也可直接修改来重新配置积分。修改折扣、增减席位保持每席积分不变。</p></div>
          {!isDraft && <div className="team-package-actions"><button className="button small" onClick={copy}><Copy size={13} />复制团队套餐</button>{confirming === p.id ? <><button className="button small danger" onClick={remove}>确认删除套餐</button><button className="text-button" onClick={() => setConfirming(null)}>取消</button></> : <button className="button small danger" disabled={team.packages.length <= 1} title={team.packages.length <= 1 ? '至少保留一个团队套餐' : '删除当前套餐'} onClick={() => setConfirming(p.id)}><Trash2 size={13} />删除团队套餐</button>}</div>}
        </div>
      </section>
      <section className="card team-summary" aria-label="团队套餐汇总">
        <div className="card-heading"><div className="step result-step">2</div><div><h2>当前套餐的总价与利润</h2><p>{billingCycle === 'annual' ? '年付套餐 · 全年配置' : '季度汇总'} · 不叠加其他套餐</p></div><span className="live-badge"><i />实时</span></div>
        <div className="team-summary-body">
          <div className="team-settings-grid"><div>{field('accountCount', '团队账号总数', '个')}<p>¥{Number(ACCOUNT_UNIT_COST) * (billingCycle === 'annual' ? 4 : 1)} / 个 / {billingCycle === 'annual' ? '年' : '季'}，共 {money(a.accountCost)}</p></div><div>{field('discount', '团队套餐优惠', '%')}<p>优惠 10% 即九折；仅影响毛利，不改变积分</p></div></div>
          <div className="team-total-price"><span>套餐折后总价（{billingCycle === 'annual' ? '全年' : '每季'}）</span><strong data-testid="team-sale-price">{money(a.salePrice)}</strong><small>{money(a.seatPrice)} / 席 × {integer(a.seatCount)} 席 − 优惠 {money(a.discountAmount)}</small></div>
          <dl className="team-cost-lines"><div><dt>总成本</dt><dd data-testid="team-budget">{money(a.actualCost)}</dd></div><div><dt>积分成本</dt><dd data-testid="team-credit-budget">{money(a.creditCost)}</dd></div><div><dt>套餐原价</dt><dd data-testid="team-list-price">{money(a.listPrice)}</dd></div><div><dt>全部席位积分成本</dt><dd data-testid="team-credit-cost">{money(a.creditCost)}</dd></div><div><dt>账号成本（{billingCycle === 'annual' ? '四季合计' : '本季'}）</dt><dd data-testid="team-account-cost">{money(a.accountCost)}</dd></div><div className="team-total-cost"><dt>套餐总成本</dt><dd data-testid="team-actual-cost">{money(a.actualCost)}</dd></div></dl>
          <div className="team-profit-grid"><div><span>套餐总利润</span><strong className={a.loss ? 'text-red' : 'text-green'} data-testid="team-profit">{money(a.profit)}</strong></div><div><span>视频单价</span><strong>{a.videoUnitPrice === null ? '—' : money(a.videoUnitPrice)}</strong></div></div>
          <div className={'composition-bar ' + (a.loss ? 'loss' : '')} role="img" aria-label={'套餐总成本 ' + money(a.actualCost) + '，总利润 ' + money(a.profit)}><span style={{ width: (a.loss || a.salePrice === 0 ? 100 : 100 - profitWidth) + '%' }} /><span style={{ width: (a.loss ? 0 : profitWidth) + '%' }} /></div>
          <p className={'team-profit-status ' + (a.loss ? 'text-red' : '')} role="status">{a.loss ? '当前团队套餐已亏损，总成本超过收入。' : a.salePrice === 0 ? '暂无收入，毛利率显示 —。' : '毛利率按当前实收与总成本计算。'}</p>
          <p className="result-footnote">调整毛利率重新配置积分；折扣不改变积分，增减席位保持每席积分不变。视频数 = 本周期每席积分 ÷ {CREDITS_PER_VIDEO} 向下取整 × 席位数。</p>
        </div>
      </section>
    </div>

  </div>;
}

function TeamName({ p, onChange, onError }: { p: TeamPackage; onChange: (p: TeamPackage) => void; onError: Props['onError'] }) {
  const [draft, setDraft] = useState(p.name);
  const id = 'team-' + p.id + '-name', report = useRef(onError); report.current = onError;
  useEffect(() => () => report.current(id, undefined), [id]);
  return <div className="name-field"><label htmlFor={id}>团队套餐名称</label><input className="text-input" id={id} maxLength={50} value={draft} aria-invalid={!draft.trim()} onChange={event => {
    const name = event.target.value; setDraft(name); onError(id, name.trim() ? undefined : '请填写团队套餐名称');
    if (name.trim()) onChange({ ...p, name });
  }} />{!draft.trim() && <span className="field-error">请填写团队套餐名称</span>}</div>;
}
