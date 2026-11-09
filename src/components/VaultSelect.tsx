import * as Select from '@radix-ui/react-select';
import { useRef, useState, type RefObject } from 'react';
import './vault-select.css';

type Option = { value: string; label: string; disabled?: boolean };
type Group = { label: string; options: readonly Option[] };

interface VaultSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly (Option | Group)[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
  ref?: RefObject<HTMLButtonElement | null>;
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={up ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const itemValue = (value: string) => `item:${value}`;

function SelectOption({ option }: { option: Option }) {
  return (
    <Select.Item className="vault-select-option" value={itemValue(option.value)} disabled={option.disabled}>
      <Select.ItemText>{option.label}</Select.ItemText>
      <Select.ItemIndicator className="vault-select-check">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Select.ItemIndicator>
    </Select.Item>
  );
}

export function VaultSelect({ value, onValueChange, options, placeholder, disabled, id, 'aria-label': ariaLabel, className, ref }: VaultSelectProps) {
  const fallbackRef = useRef<HTMLButtonElement>(null);
  const trigger = ref ?? fallbackRef;
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);

  return (
    <Select.Root
      value={placeholder && value === '' ? '' : itemValue(value)}
      onValueChange={(selected) => onValueChange(selected.slice('item:'.length))}
      onOpenChange={(open) => { if (open) setDialog(trigger.current?.closest('dialog') ?? null); }}
      disabled={disabled}
    >
      <Select.Trigger
        ref={trigger}
        id={id}
        aria-label={ariaLabel}
        className={`select vault-select-trigger${className ? ` ${className}` : ''}`}
      >
        <span className="vault-select-value"><Select.Value placeholder={placeholder} /></span>
        <Select.Icon className="vault-select-chevron"><Chevron /></Select.Icon>
      </Select.Trigger>
      <Select.Portal container={dialog ?? undefined}>
        <Select.Content
          className="vault-select-menu"
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          collisionBoundary={dialog ?? undefined}
        >
          <Select.ScrollUpButton className="vault-select-scroll"><Chevron up /></Select.ScrollUpButton>
          <Select.Viewport className="vault-select-viewport">
            {options.map((item) => 'options' in item ? (
              <Select.Group className="vault-select-group" key={item.label}>
                <Select.Label className="vault-select-group-label">{item.label}</Select.Label>
                {item.options.map((option) => <SelectOption key={option.value} option={option} />)}
              </Select.Group>
            ) : <SelectOption key={item.value} option={item} />)}
          </Select.Viewport>
          <Select.ScrollDownButton className="vault-select-scroll"><Chevron /></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
