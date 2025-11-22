'use client';

import { useState } from 'react';
import clsx from 'clsx';

interface CopyableTextProps {
  value?: string | null;
  label?: string;
  truncateAt?: number;
  className?: string;
}

export function CopyableText({
  value,
  label = 'value',
  truncateAt = 24,
  className,
}: CopyableTextProps) {
  const [copied, setCopied] = useState(false);

  if (!value) {
    return <span className={clsx('text-gray-500', className)}>—</span>;
  }

  const truncated =
    value.length > truncateAt ? `${value.slice(0, truncateAt)}…` : value;

  function handleCopy() {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Click to copy ${label}`}
      className={clsx(
        'font-mono text-left truncate hover:text-accent focus:outline-none',
        className,
      )}
    >
      <span>{truncated}</span>
      {copied && (
        <span className="ml-2 text-xs uppercase tracking-wide text-accent">
          copied
        </span>
      )}
    </button>
  );
}


