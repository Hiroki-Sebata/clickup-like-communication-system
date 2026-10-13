/**
 * "Someone else changed this." Shows both versions side by side and lets you pick,
 * field by field. Nothing is saved until you press the button.
 */
import { useState } from 'react';
import { FIELD_LABELS, type FieldConflict, type Resolution } from '../lib/conflict';

export function ConflictDialog({
  conflicts,
  theirAuthor,
  onCancel,
  onResolve,
}: {
  conflicts: FieldConflict[];
  theirAuthor: string;
  onCancel: () => void;
  onResolve: (choices: Record<string, Resolution>) => void;
}) {
  // Default to keeping the other person's version: the safe choice is never to
  // overwrite work you have not read yet.
  const [choices, setChoices] = useState<Record<string, Resolution>>(() =>
    Object.fromEntries(conflicts.map((c) => [c.field, 'theirs' as Resolution])),
  );

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <div className="glass-solid dialog" role="dialog" aria-modal="true" aria-label="Changes clash">
        <h2 style={{ marginTop: 0 }}>This task changed while you had it open</h2>
        <p className="muted">
          {theirAuthor ? <>Someone saved a different version. </> : null}
          Pick which to keep for each field. Anything not listed here is saved as normal.
        </p>

        {conflicts.map((c) => (
          <fieldset
            key={c.field}
            style={{
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-button)',
              padding: 12,
              marginBottom: 11,
            }}
          >
            <legend style={{ fontWeight: 700, fontSize: 12.5, padding: '0 6px' }}>
              {FIELD_LABELS[c.field]}
            </legend>

            <Option
              name={c.field}
              checked={choices[c.field] === 'theirs'}
              onChange={() => setChoices((s) => ({ ...s, [c.field]: 'theirs' }))}
              heading="Keep theirs (on GitHub now)"
              value={c.theirs}
            />
            <Option
              name={c.field}
              checked={choices[c.field] === 'mine'}
              onChange={() => setChoices((s) => ({ ...s, [c.field]: 'mine' }))}
              heading="Use mine (overwrite theirs)"
              value={c.mine}
            />
            <p className="faint" style={{ margin: '6px 0 0' }}>
              It was <q>{c.base || 'empty'}</q> when you opened it.
            </p>
          </fieldset>
        ))}

        <div className="row">
          <span className="spacer" />
          <button className="btn" onClick={onCancel}>
            Cancel, change nothing
          </button>
          <button className="btn btn-primary" onClick={() => onResolve(choices)}>
            Save with these choices
          </button>
        </div>
      </div>
    </>
  );
}

function Option({
  name,
  checked,
  onChange,
  heading,
  value,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  heading: string;
  value: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 9,
        alignItems: 'flex-start',
        padding: 8,
        borderRadius: 'var(--radius-small)',
        background: checked ? 'var(--accent-soft)' : 'transparent',
        cursor: 'pointer',
        marginBottom: 5,
        fontWeight: 400,
        color: 'var(--text)',
      }}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        style={{ width: 'auto', marginTop: 3 }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: 12.5 }}>{heading}</strong>
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {value || <em className="faint">empty</em>}
        </span>
      </span>
    </label>
  );
}
