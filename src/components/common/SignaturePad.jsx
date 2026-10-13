import React, { useRef, useState, useEffect } from 'react';
import { X, Eraser, PenLine } from 'lucide-react';

// مودال توقيع العميل باللمس/الماوس. بيرجّع صورة PNG صغيرة (data URL) مع اسم المستلم.
export function SignatureModal({ title = 'توقيع المستلم', subtitle = '', onSave, onSkip, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    setHasInk(true);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] p-5 w-full max-w-lg shadow-2xl">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-black text-lg text-slate-800 dark:text-white flex items-center gap-2"><PenLine size={18} className="text-teal-600"/> {title}</h3>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-rose-500"><X size={18}/></button>
        </div>
        <input
          className="w-full border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 mb-3 outline-none focus:border-teal-500"
          placeholder="اسم المستلم"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <canvas
          ref={canvasRef}
          width={600}
          height={220}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white touch-none cursor-crosshair"
          style={{ touchAction: 'none' }}
        />
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={clear} className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-3 rounded-xl font-bold flex items-center gap-1 text-sm"><Eraser size={15}/> مسح</button>
          <button
            type="button"
            disabled={!hasInk}
            onClick={() => onSave(canvasRef.current.toDataURL('image/png'), name.trim())}
            className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 disabled:opacity-40"
          >
            حفظ التوقيع وتأكيد التسليم
          </button>
          <button type="button" onClick={onSkip} className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:underline px-2">بدون توقيع</button>
        </div>
      </div>
    </div>
  );
}
