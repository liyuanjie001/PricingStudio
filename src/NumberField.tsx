import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { validateNumber } from './domain';
import type { NumericField } from './domain';

interface Props {
  id: string; field: NumericField; value: string | number | null; label?: string;
  fractionDigits?: number;
  prefix?: string; suffix?: string; compact?: boolean; readOnly?: boolean;
  onCommit: (value: string) => void; onError: (id: string, error?: string) => void;
  onStart?: () => void; onEnd?: () => void;
  resetToken?: number;
}
const display = (value: string | number | null, fractionDigits = 6) => {
  if (value === null) return '';
  const number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toFixed(fractionDigits))) : String(value);
};
export function NumberField({id,field,value,label,prefix,suffix,compact,readOnly,onCommit,onError,onStart,onEnd,resetToken,fractionDigits}: Props) {
  const [text,setText]=useState(()=>display(value, fractionDigits));
  const [error,setError]=useState<string>();
  const focused=useRef(false), invalid=useRef(false), report=useRef(onError);
  report.current=onError;
  useEffect(()=>{if(!focused.current&&!invalid.current)setText(display(value, fractionDigits));},[value, fractionDigits]);
  useEffect(()=>()=>report.current(id,undefined),[id]);
  const lastReset=useRef(resetToken);
  useEffect(()=>{
    if(lastReset.current===resetToken)return;
    lastReset.current=resetToken;invalid.current=false;setError(undefined);setText(display(value, fractionDigits));report.current(id,undefined);
  },[resetToken,value,id,fractionDigits]);
  function change(raw:string) {
    setText(raw);
    let issue=validateNumber(field,raw);
    if(!issue)try{onCommit(raw);}catch(e){issue=(e as Error).message;}
    invalid.current=!!issue;setError(issue);onError(id,issue);
  }
  return <div className={`number-field ${compact?'compact':''} ${error?'has-error':''}`}>
    {label&&<label htmlFor={id}>{label}</label>}
    <div className={`input-wrap ${readOnly?'readonly':''}`}>
      {prefix&&<span className="input-prefix">{prefix}</span>}
      <input id={id} aria-label={label||id} aria-invalid={!!error} aria-describedby={error?`${id}-error`:undefined}
        style={{ '--input-chars': Math.max(1, text.length) } as CSSProperties}
        placeholder={value === null ? '—' : undefined}
        inputMode={field === 'accountCount' || field === 'credits' || field === 'seatCount' ? 'numeric' : 'decimal'} autoComplete="off" value={text} readOnly={readOnly}
        onFocus={()=>{focused.current=true;onStart?.();}}
        onBlur={()=>{focused.current=false;onEnd?.();if(!invalid.current)setText(display(value, fractionDigits));}}
        onChange={e=>change(e.target.value)} />
      {suffix&&<span className="input-suffix">{suffix}</span>}
    </div>
    <span className="field-error-slot" aria-live="polite">{error&&<span className="field-error" id={`${id}-error`}>{error}</span>}</span>
  </div>;
}
