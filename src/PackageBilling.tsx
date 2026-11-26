import type { BillingCycle } from './domain';

export function PackageBilling({ cycle, onChange, onDuplicate }: {
  cycle: BillingCycle; onChange: (cycle: BillingCycle) => void; onDuplicate?: (cycle: BillingCycle) => void;
}) {
  const other = cycle === 'annual' ? 'quarterly' : 'annual';
  return <div className="package-billing">
    <label className="annual-toggle"><input type="checkbox" checked={cycle === 'annual'} onChange={event => onChange(event.target.checked ? 'annual' : 'quarterly')} />按年购买</label>
    <span className="field-hint">{cycle === 'annual' ? '本套餐为年付，直接编辑全年配置' : '本套餐为季付，直接编辑季度配置'}</span>
    {onDuplicate && <button className="text-button" onClick={() => onDuplicate(other)}>另建{other === 'annual' ? '年付' : '季付'}套餐</button>}
  </div>;
}
