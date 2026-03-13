import { useEffect, useRef, useState } from 'react';

interface Option {
    value: string;
    label: string;
}

interface Props {
    value: string;
    options: Option[];
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    onChange: (value: string) => void;
}

export function CustomSelect({
    value,
    options,
    disabled = false,
    placeholder,
    className = '',
    onChange,
}: Props) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [open]);

    const selected = options.find(option => option.value === value);

    return (
        <div
            ref={rootRef}
            className={`custom-select-wrapper${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
        >
            <button
                type="button"
                className="custom-select-trigger"
                onClick={() => !disabled && setOpen(current => !current)}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
            >
                <span>{selected?.label ?? placeholder ?? ''}</span>
                <span className="custom-select-caret" aria-hidden="true">▾</span>
            </button>
            {open && !disabled && (
                <ul className="custom-select-list" role="listbox">
                    {options.map(option => (
                        <li
                            key={option.value}
                            role="option"
                            aria-selected={option.value === value}
                            className={`custom-select-option${option.value === value ? ' is-selected' : ''}`}
                            onClick={() => {
                                onChange(option.value);
                                setOpen(false);
                            }}
                        >
                            {option.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
