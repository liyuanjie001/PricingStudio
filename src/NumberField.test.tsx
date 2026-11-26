import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { NumberField } from './NumberField';

afterEach(cleanup);
function Harness() { const [value, setValue] = useState('7'); return <><NumberField id="test" field="listPrice" value={value} label="套餐原价" onCommit={setValue} onError={() => {}} /><output data-testid="value">{value}</output><button onClick={() => setValue('20')}>External</button></>; }
describe('numeric input drafts', () => {
  it('keeps the unit immediately after a content-sized input while retaining editable drafts', () => {
    const view = render(<NumberField id="inline-credits" field="credits" value="690" label="紧凑积分" suffix="积分" compact onCommit={vi.fn()} onError={vi.fn()} />);
    const input = screen.getByLabelText('紧凑积分');
    expect(input.style.getPropertyValue('--input-chars')).toBe('3');
    expect(input.nextElementSibling).toHaveTextContent('积分');
    input.focus();
    fireEvent.change(input, { target: { value: '1234567' } });
    expect(input.style.getPropertyValue('--input-chars')).toBe('7');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '' } });
    expect(input.style.getPropertyValue('--input-chars')).toBe('1');
    expect(input).toHaveValue('');
    view.unmount();
  });
  it('keeps the same input and validation slot when clearing and correcting a value', () => {
    render(<Harness />);
    const input = screen.getByLabelText('套餐原价');
    const field = input.closest('.number-field')!;
    const slot = field.querySelector('.field-error-slot');
    expect(slot).toBeInTheDocument();
    input.focus();
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByLabelText('套餐原价')).toBe(input);
    expect(input).toHaveFocus();
    expect(slot).toHaveTextContent(/\S/);
    expect(screen.getByTestId('value')).toHaveTextContent('7');
    fireEvent.change(input, { target: { value: '12.5' } });
    expect(screen.getByLabelText('套餐原价')).toBe(input);
    expect(field.querySelector('.field-error-slot')).toBe(slot);
    expect(slot).toBeEmptyDOMElement();
    expect(input).toHaveFocus();
    expect(input).toHaveValue('12.5');
  });
  it('allows clearing and resumes typing without committing an invalid number', async () => {
    const user = userEvent.setup(); render(<Harness />); const input = screen.getByLabelText('套餐原价');
    await user.clear(input); expect(input).toHaveValue(''); expect(screen.getByTestId('value')).toHaveTextContent('7');
    await user.type(input, '12.5'); expect(input).toHaveValue('12.5'); expect(screen.getByTestId('value')).toHaveTextContent('12.5');
  });
  it('preserves a trailing decimal and focus', async () => {
    const user = userEvent.setup(); render(<Harness />); const input = screen.getByLabelText('套餐原价');
    await user.clear(input); await user.type(input, '7.'); expect(input).toHaveValue('7.'); expect(input).toHaveFocus();
    await user.type(input, '25'); expect(input).toHaveValue('7.25');
  });
  it('updates unfocused fields when an external value changes', async () => {
    const user = userEvent.setup(); render(<Harness />); await user.click(screen.getByText('External')); expect(screen.getByLabelText('套餐原价')).toHaveValue('20');
  });
  it('keeps invalid text after blur and the last good value', async () => {
    const user = userEvent.setup(); render(<Harness />); const input = screen.getByLabelText('套餐原价');
    await user.clear(input); await user.type(input, '-4'); await user.tab();
    expect(input).toHaveValue('-4'); expect(input).toHaveAttribute('aria-invalid', 'true'); expect(screen.getByTestId('value')).toHaveTextContent('7');
  });
  it('reports calculation errors and clears its registration on unmount', () => {
    const report = vi.fn(); const { unmount } = render(<NumberField id="credits" field="credits" value="0" label="发放积分" onCommit={() => { throw new Error('积分过多'); }} onError={report} />);
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '999' } }); expect(screen.getByText('积分过多')).toBeInTheDocument();
    unmount(); expect(report).toHaveBeenLastCalledWith('credits', undefined);
  });
  it('clears an invalid draft when explicitly adopting a recommendation', () => {
    const report = vi.fn(); const props = { id: 'credits', field: 'credits' as const, value: '270', label: '发放积分', onCommit: vi.fn(), onError: report };
    const view = render(<NumberField {...props} resetToken={0} />);
    fireEvent.change(screen.getByLabelText('发放积分'), { target: { value: '' } });
    view.rerender(<NumberField {...props} resetToken={1} />);
    expect(screen.getByLabelText('发放积分')).toHaveValue('270'); expect(screen.getByLabelText('发放积分')).toHaveAttribute('aria-invalid', 'false');
  });
});
