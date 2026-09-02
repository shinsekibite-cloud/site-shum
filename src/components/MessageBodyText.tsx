'use client';

import { useState } from 'react';
import { splitMessageBodyMedia } from '@/lib/message-body-media';

type Props = {
  body: string;
  className?: string;
};

/**
 * Chat text with image/gif URL → compact preview (fallback: short link).
 */
export default function MessageBodyText({ body, className }: Props) {
  const parts = splitMessageBodyMedia(body);

  return (
    <div className={className}>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return (
            <span key={i} className="msg-body-text">
              {part.value}
            </span>
          );
        }
        return <MsgImagePreview key={i} url={part.url} />;
      })}
    </div>
  );
}

function MsgImagePreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a className="msg-body-link" href={url} target="_blank" rel="noopener noreferrer">
        Изображение
      </a>
    );
  }
  return (
    <a className="msg-body-media" href={url} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </a>
  );
}
