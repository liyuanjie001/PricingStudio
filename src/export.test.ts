import { describe, expect, it, vi } from 'vitest';
import { Workbook } from 'exceljs';
import { buildWorkbook, exportPlan } from './export';
import { changePackageBilling, createPackage, createPlan, createTeamPackage, editPackage, editTeamPackage } from './domain';

describe('Excel export', () => {
  it('includes numeric model prices and handles unavailable videos in both editions', async () => {
    const plan = createPlan();
    plan.packages = [{ ...createPackage('模型价格', '500', '10'), manualCredits: '110' }];
    plan.team.packages = [{ ...createTeamPackage('团队模型'), seatCount: '3', fixedSeatCredits: '33' }];
    const read = new Workbook();
    await read.xlsx.load(await (await buildWorkbook(plan)).xlsx.writeBuffer());
    const sheet = read.getWorksheet('全部套餐对比')!;
    expect(sheet.getCell('O1').value).toBe('Seedance 2.5 视频单价（480P · 34积分）');
    expect(sheet.getCell('O2').value).toBe(150);
    expect(sheet.getCell('S2').value).toBe(45);
    expect(sheet.getCell('O3').value).toBe('—');
    expect(sheet.getCell('P3').value).toBe(200);
    expect(sheet.getCell('O2').numFmt).toContain('¥');
  });
  it('exports all packages in their stored mixed-edition insertion order', async () => {
    const plan = createPlan();
    plan.packageOrder = [`personal:${plan.packages[0].id}`, `team:${plan.team.packages[0].id}`,
      ...plan.packages.slice(1).map(p => `personal:${p.id}`)];
    const sheet = (await buildWorkbook(plan)).getWorksheet('全部套餐对比')!;
    expect(Array.from({ length: 5 }, (_, index) => sheet.getCell(index + 2, 1).value))
      .toEqual(['基础套餐', '团队套餐 1', '标准套餐', '专业套餐', '旗舰套餐']);
  });
  it('exports held personal credits and reduced margins after a discount edit', async () => {
    const plan = createPlan('折扣不改积分', true);
    plan.packages = [editPackage(createPackage('保留积分', '100', '0', '30'), 'discount', '10')];
    const read = new Workbook(); await read.xlsx.load(await (await buildWorkbook(plan)).xlsx.writeBuffer());
    const sheet = read.getWorksheet('套餐对比')!;
    expect(sheet.getCell('D2').value).toBe(90);
    expect(sheet.getCell('H2').value).toBe(315);
    expect(sheet.getCell('I2').value).toBe(350);
    expect(sheet.getCell('J2').value).toBe('折扣调整 · 积分保持');
    expect(sheet.getCell('K2').value).toBe(70);
    expect(sheet.getCell('L2').value).toBe(20);
    expect(sheet.getCell('M2').value).toBeCloseTo(2 / 9);
    expect(sheet.getCell('Z2').value).toBeCloseTo(90 / 31);
  });
  it('exports numeric video prices for both editions and a dash when no videos are available', async () => {
    const plan = createPlan('视频单价', true);
    plan.packages = [{ ...createPackage('视频套餐', '500', '10'), manualCredits: '110' }, { ...createPackage('无视频'), manualCredits: '0' }];
    const read = new Workbook(); await read.xlsx.load(await (await buildWorkbook(plan)).xlsx.writeBuffer());
    const personal = read.getWorksheet('套餐对比')!;
    expect(personal.getCell('Z1').value).toBe('视频单价');
    expect(personal.getCell('Z2').value).toBe(45);
    expect(personal.getCell('Z3').value).toBe('—');
    expect(personal.getCell('Z2').numFmt).toContain('¥');
    const all = read.getWorksheet('全部套餐对比')!;
    expect(all.getCell('N2').value).toBe(45);
    expect(all.getCell('N3').value).toBe('—');
    expect(all.getCell('N4').value).toBeCloseTo(400 / 66);
    expect(read.getWorksheet('团队汇总')!.getCell('T2').value).toBeCloseTo(400 / 66);
  });
  it('exports mixed cycles with their independently configured totals', async () => {
    const plan = createPlan('年付方案', true);
    plan.packages = [changePackageBilling({ ...createPackage('个人年付', '100', '10', '40'), accountCount: '1' }, 'annual')];
    const read = new Workbook(); await read.xlsx.load(await (await buildWorkbook(plan)).xlsx.writeBuffer());
    const personal = read.getWorksheet('套餐对比')!;
    expect(personal.getCell('B2').value).toBe(400);
    expect(personal.getCell('D2').value).toBe(360);
    expect(personal.getCell('I2').value).toBe(560);
    expect(personal.getCell('R2').value).toBe(104);
    expect(personal.getCell('M2').value).toBe(0.4);
    expect(personal.getCell('W2').value).toBe('年付');
    expect(personal.getCell('X2').value).toBe(400);
    expect(personal.getCell('Y2').value).toBe(560);
    const all = read.getWorksheet('全部套餐对比')!;
    expect(all.rowCount).toBe(3);
    expect(all.getCell('B2').value).toBe('个人版');
    expect(all.getCell('B3').value).toBe('团队版');
    expect(all.getCell('C2').value).toBe('年付');
    expect(all.getCell('C3').value).toBe('季付');
    expect(all.getCell('G3').value).toBe(400);
    expect(all.getCell('H3').value).toBe(740);
    expect(all.getCell('M3').value).toBe(0.5);
    expect(read.getWorksheet('团队席位')!.getCell('C2').value).toBe(370);
    expect(read.getWorksheet('团队汇总')!.getCell('I2').value).toBe(400);
  });
  it('roundtrips team seat prices and final discounted profit with shared accounts', async () => {
    const plan = createPlan('团队方案'); plan.edition = 'team';
    plan.team.packages[0] = editTeamPackage(plan.team.packages[0], 'discount', '10');
    plan.team.packages.push({ ...createTeamPackage('专业团队'), seatCount: '3', seatPrice: '500', targetMargin: '60' });
    const read = new Workbook(); await read.xlsx.load(await (await buildWorkbook(plan)).xlsx.writeBuffer());
    const seats = read.getWorksheet('团队席位')!;
    expect(seats.getCell('B2').value).toBe(2);
    expect(seats.getCell('C2').value).toBe(370);
    expect(seats.getCell('E2').value).toBe(0.5);
    expect(seats.getCell('G2').value).toBe(200);
    expect(seats.getCell('G3').value).toBe(500);
    const summary = read.getWorksheet('团队汇总')!;
    expect(summary.getCell('F2').value).toBe(0.1);
    expect(summary.getCell('I2').value).toBe(360);
    expect(summary.getCell('K2').value).toBe(52);
    expect(summary.getCell('L2').value).toBe(200);
    expect(summary.getCell('M2').value).toBe(160);
    expect(summary.getCell('N2').value).toBeCloseTo(4 / 9);
    expect(summary.getCell('P2').value).toBe(0.5);
    expect(summary.getCell('Q2').value).toBe(180);
    expect(summary.getCell('R2').value).toBe(128);
    expect(summary.getCell('S2').value).toBe(-20);
    expect(summary.getCell('N2').numFmt).toBe('0.00%');
    expect(summary.getCell('A3').value).toBe('专业团队');
    expect(summary.getCell('I3').value).toBe(1500);
  });
  it('exports independent whole-video counts for suggested and issued credits', async () => {
    const plan = createPlan('视频方案', true);
    const p = editPackage(createPackage('视频套餐', '500', '0', '60'), 'accountCount', '2');
    plan.packages = [editPackage(p, 'credits', '110')];
    const read = new Workbook(); await read.xlsx.load(await (await buildWorkbook(plan)).xlsx.writeBuffer());
    const sheet = read.getWorksheet('套餐对比')!;
    expect(sheet.getCell('U2').value).toBe(67);
    expect(sheet.getCell('V2').value).toBe(10);
    expect(sheet.getCell('V2').numFmt).toBe('#,##0');
    expect(read.getWorksheet('方案设置')!.getCell('B12').value).toBe(11);
  });
  it('exports account costs and remaining credit budgets as formatted numbers', async () => {
    const plan = createPlan('账号方案', true);
    plan.packages = [editPackage(createPackage('含账号', '100', '10', '40'), 'accountCount', '1')];
    const bytes = await (await buildWorkbook(plan)).xlsx.writeBuffer();
    const read = new Workbook(); await read.xlsx.load(bytes);
    const sheet = read.getWorksheet('套餐对比')!;
    expect(read.getWorksheet('方案设置')!.getCell('B10').value).toBe(26);
    expect(sheet.getCell('P2').value).toBe(1);
    expect(sheet.getCell('Q2').value).toBe(26);
    expect(sheet.getCell('R2').value).toBe(26);
    expect(sheet.getCell('S2').value).toBe(28);
    expect(sheet.getCell('T2').value).toBe(28);
    expect(sheet.getCell('H2').value).toBe(140);
    expect(sheet.getCell('K2').value).toBe(54);
    expect(sheet.getCell('P2').numFmt).toBe('#,##0');
    expect(sheet.getCell('R2').numFmt).toContain('¥');
  });
  it('roundtrips numeric budgets and manual allocations with the scheme rate', async () => {
    const plan = createPlan('验证方案', true);
    plan.packages = [editPackage(createPackage('示例', '100', '10', '40'), 'credits', '300')];
    plan.packages[0].note = '测试备注';
    const book = await buildWorkbook(plan), bytes = await book.xlsx.writeBuffer();
    const read = new Workbook(); await read.xlsx.load(bytes);
    expect(read.worksheets.map(s => s.name)).toEqual(['方案设置', '套餐对比', '团队席位', '团队汇总', '全部套餐对比']);
    expect(read.getWorksheet('方案设置')!.getCell('B4').value).toBe(0.2);
    const sheet = read.getWorksheet('套餐对比')!;
    expect(sheet.getCell('F2').value).toBe(54); expect(sheet.getCell('H2').value).toBe(270); expect(sheet.getCell('I2').value).toBe(300);
    expect(sheet.getCell('J2').value).toBe('手动调整'); expect(sheet.getCell('K2').value).toBe(60); expect(sheet.getCell('L2').value).toBe(30);
    expect(sheet.getCell('M2').value).toBeCloseTo(1 / 3); expect(sheet.getCell('N2').value).toBe(-6); expect(sheet.getCell('O2').value).toBe('测试备注');
    expect(sheet.getCell('I2').numFmt).toBe('#,##0'); expect(sheet.getCell('F2').numFmt).toContain('¥');
  });
  it('exports zero revenue, losses and an empty plan', async () => {
    const plan = createPlan('零收入', true); plan.packages = [{ ...createPackage('免费', '0'), manualCredits: '50' }];
    const book = await buildWorkbook(plan); expect(book.getWorksheet('套餐对比')!.getCell('M2').value).toBe('—'); expect(book.getWorksheet('套餐对比')!.getCell('L2').value).toBe(-10);
    const empty = await buildWorkbook(createPlan('空白', true)); expect(empty.getWorksheet('套餐对比')!.rowCount).toBe(1);
  });
  it('creates a downloadable XLSX blob with a safe file name', async () => {
    const create = vi.fn((_blob: Blob | MediaSource) => 'blob:pricing-studio-test');
    const revoke = vi.fn();
    const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toContain('Pricing-Studio_测试_方案_'); expect(this.href).toBe('blob:pricing-studio-test');
    });
    try {
      await exportPlan(createPlan('测试/方案'));
      expect(create).toHaveBeenCalledOnce(); expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
      expect(click).toHaveBeenCalledOnce(); expect(document.querySelector('a[download]')).toBeNull();
      await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:pricing-studio-test'), { timeout: 2000 });
    } finally { click.mockRestore(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
  });
});
