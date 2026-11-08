import { useState, type ReactNode } from 'react';

interface GameImageProps {
  /** Candidate URLs in order; the next one loads when the previous fails. */
  srcs: readonly string[];
  className?: string;
  /** Shown when there is no URL or every URL failed. */
  fallback?: ReactNode;
}

/** Decorative game artwork: the surrounding text always names what it shows. */
export function GameImage({ srcs, className, fallback = null }: GameImageProps) {
  const key = srcs.join('\n');
  const [failed, setFailed] = useState({ key, count: 0 });
  const count = failed.key === key ? failed.count : 0;
  const src = srcs[count];
  if (src === undefined) return <>{fallback}</>;
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      onError={() => setFailed({ key, count: count + 1 })}
    />
  );
}
