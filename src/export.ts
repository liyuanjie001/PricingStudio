import { ACCOUNT_UNIT_COST, CREDITS_PER_VIDEO, analyze, analyzeTeam, orderedPackages } from './domain';
import type { Plan } from './domain';
import { analyzeModelVideos, VIDEO_MODELS } from './model-videos';

export async function buildWorkbook(plan: Plan) {
  const { Workbook } = await import('exceljs');
  const book = new Workbook();
  book.creator = 'Pricing Studio'; book.created = new Date();
  const settings = book.addWorksheet('方案设置');
  settings.addRows([
    ['Pricing Studio · 套餐定价与积分', plan.name],
    ['计算单位', '售出一份套餐'], ['货币', 'CNY（人民币）'],
    ['每积分成本', Number(plan.creditUnitCost)], ['导出时间', new Date().toLocaleString('zh-CN')],
    ['成本预算', '实收金额 × (1 − 目标毛利率)'], ['建议积分', 'max(0, 成本预算 − 账号成本) ÷ 每积分成本，向下取整'],
    ['实际毛利率', '(实收金额 − 账号成本 − 发放积分 × 每积分成本) ÷ 实收金额'],
    ['零收入', '实际毛利率显示 —，实际亏损正常记录'],
    ['每账号成本', Number(ACCOUNT_UNIT_COST)], ['账号成本', '账号数量 × 每账号成本'],
    ['每视频积分', CREDITS_PER_VIDEO], ['视频个数', '对应积分 ÷ 每视频积分，向下取整'],
    ['团队每席积分', '按价格及目标计算每席积分；修改折扣或增减席位保持每席积分不变，实际毛利率重新计算'],
    ['团队实收', '每席原价 × 套餐席位数 × (1 − 套餐优惠百分比)，各套餐独立计算'],
    ['团队实际毛利率', '(团队实收 − 全部积分成本 − 团队账号总数 × 26) ÷ 团队实收'],
    ['购买周期', '逐套餐独立设置'],
    ['周期规则', '年付和季付独立配置；金额与积分为套餐完整周期，账号每季26元、每年104元'],
    ['年付视频数', '按套餐周期、每席积分除以 11 向下取整，再乘席位数'],
    ['视频单价', '实收金额 ÷ 总视频个数；没有视频时显示 —'],
    ['折扣调整规则', '个人和团队修改折扣均保留已配置积分及成本，仅改变实收金额、利润、实际毛利率和视频单价'],
    ['模型视频单价', '按各模型的积分消耗计算完整视频数，再用套餐实收金额除以视频数；团队按每席取整后汇总，各模型独立测算'],
    ...VIDEO_MODELS.map(model => [`${model.name} · 480P`, `${model.creditsPerVideo} 积分 / 个`]),
  ]);
  settings.getColumn(1).width = 29; settings.getColumn(2).width = 78;
  settings.getCell('B4').numFmt = '¥0.00########';
  settings.getCell('B10').numFmt = '¥0.00';
  const details = book.addWorksheet('套餐对比', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  details.addRow(['套餐', '原价', '优惠百分比', '实收金额', '目标毛利率', '成本预算', '目标利润', '建议积分', '发放积分', '积分模式', '实际成本', '实际利润', '实际毛利率', '预算结余', '备注', '账号数量', '每账号成本（本周期）', '账号成本', '积分预算', '积分成本', '建议积分视频数', '实际发放视频数', '购买周期', '周期原价', '周期发放积分', '视频单价']);
  for (const p of plan.packages) {
    const a = analyze(p, plan.creditUnitCost);
    details.addRow([p.name, a.listPrice, Number(p.discount) / 100, a.salePrice, Number(p.targetMargin) / 100,
      a.budget, a.targetProfit, a.suggestedCredits, a.credits, a.manual ? '手动调整' : p.discountCredits !== undefined ? '折扣调整 · 积分保持' : '自动跟随', a.actualCost,
      a.profit, a.margin === null ? '—' : a.margin / 100, a.budgetRemaining, p.note,
      Number(p.accountCount), Number(ACCOUNT_UNIT_COST) * (p.billingCycle === 'annual' ? 4 : 1), a.accountCost, a.creditBudget, a.creditCost, a.suggestedVideos, a.videoCount, p.billingCycle === 'annual' ? '年付' : '季付', a.listPrice, a.credits, a.videoUnitPrice ?? '—']);
  }
  details.autoFilter = { from: 'A1', to: 'Z1' };
  details.columns.forEach((column, index) => {
    column.width = index === 0 ? 23 : index === 14 ? 42 : 19;
    if ([2, 4, 12].includes(index)) column.numFmt = '0.00%';
    else if ([1, 3, 5, 6, 10, 11, 13, 16, 17, 18, 19, 23, 25].includes(index)) column.numFmt = '¥#,##0.00;[Red]-¥#,##0.00';
    else if ([7, 8, 15, 20, 21, 24].includes(index)) column.numFmt = '#,##0';
  });
  const seats = book.addWorksheet('团队席位', { views: [{ state: 'frozen', ySplit: 1 }] });
  seats.addRow(['套餐', '席位数', '每席积分（本周期）', '每席视频个数（本周期）', '团队目标毛利率（含账号和折扣）', '每席积分成本（本周期）', '每席原价（本周期，输入）', '每席实际利润（本周期，含账号和折扣）']);
  const summary = book.addWorksheet('团队汇总');
  summary.addRow(['套餐', '席位数', '总积分', '总视频数', '账号数', '优惠比例', '套餐原价', '优惠金额', '折后总价', '积分总成本', '账号成本', '套餐总成本', '总利润', '实际毛利率', '购买周期', '目标毛利率', '成本预算', '积分预算', '预算剩余', '视频单价']);
  for (const p of plan.team.packages) {
    const a = analyzeTeam(p, plan.creditUnitCost);
    seats.addRow([p.name, a.seatCount, a.seatCredits, a.seatVideoCount, Number(p.targetMargin) / 100, a.seatCost, a.seatPrice, a.seatProfit]);
    summary.addRow([p.name, a.seatCount, a.credits, a.videoCount, Number(p.accountCount), Number(p.discount) / 100,
      a.listPrice, a.discountAmount, a.salePrice, a.creditCost, a.accountCost, a.actualCost, a.profit, a.margin === null ? '—' : a.margin / 100, p.billingCycle === 'annual' ? '年付' : '季付', Number(p.targetMargin) / 100, a.budget, a.creditBudget, a.budgetRemaining, a.videoUnitPrice ?? '—']);
  }
  seats.autoFilter = { from: 'A1', to: 'H1' };
  seats.columns.forEach((column, index) => { column.width = 25; if (index > 0) column.numFmt = index === 4 ? '0.00%' : index >= 5 ? '¥#,##0.00;[Red]-¥#,##0.00' : '#,##0'; });
  summary.autoFilter = { from: 'A1', to: 'T1' };
  summary.columns.forEach((column, index) => { column.width = index === 0 ? 27 : 20; if (index > 0 && index < 14) column.numFmt = [5, 13].includes(index) ? '0.00%' : index >= 6 ? '¥#,##0.00;[Red]-¥#,##0.00' : '#,##0'; });
  summary.getColumn(16).numFmt = '0.00%';
  for (const index of [17, 18, 19, 20]) summary.getColumn(index).numFmt = '¥#,##0.00;[Red]-¥#,##0.00';
  const all = book.addWorksheet('全部套餐对比', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  all.addRow(['套餐', '版本', '周期', '席位数', '原价', '优惠比例', '实收金额', '总积分', '总视频数', '账号数', '总成本', '总利润', '实际毛利率', '视频单价', ...VIDEO_MODELS.map(model => `${model.name} 视频单价（480P · ${model.creditsPerVideo}积分）`)]);
  for (const entry of orderedPackages(plan)) {
      const p = entry.p, kind = entry.kind === 'personal' ? '个人版' : '团队版';
      const a = 'seatCount' in p ? analyzeTeam(p, plan.creditUnitCost) : analyze(p, plan.creditUnitCost);
      all.addRow([p.name, kind, p.billingCycle === 'annual' ? '年付' : '季付', 'seatCount' in a ? a.seatCount : '—', a.listPrice, Number(p.discount) / 100, a.salePrice, a.credits, a.videoCount, Number(p.accountCount), a.actualCost, a.profit, a.margin === null ? '—' : a.margin / 100, a.videoUnitPrice ?? '—', ...analyzeModelVideos(a).map(model => model.unitPrice ?? '—')]);
  }
  all.autoFilter = { from: 'A1', to: 'S1' };
  all.columns.forEach((column, index) => { column.width = index === 0 || index >= 14 ? 27 : 19; if ([4, 6, 10, 11, 13].includes(index) || index >= 14) column.numFmt = '¥#,##0.00;[Red]-¥#,##0.00'; else if ([5, 12].includes(index)) column.numFmt = '0.00%'; else if ([3, 7, 8, 9].includes(index)) column.numFmt = '#,##0'; });
  for (const sheet of book.worksheets) {
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3566DB' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; cell.alignment = { vertical: 'middle' };
    });
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      row.height = 25;
      row.eachCell(cell => {
        cell.font = { name: 'Microsoft YaHei', size: 10 }; cell.alignment = { vertical: 'middle' };
        if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FB' } };
      });
    });
  }
  return book;
}

export async function exportPlan(plan: Plan) {
  const book = await buildWorkbook(plan);
  const bytes = await book.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;
  link.download = `Pricing-Studio_${plan.name.replace(/[<>:"/\\|?*]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
