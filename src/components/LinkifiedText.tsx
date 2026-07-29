import { Fragment } from 'react';
import { parseHttpLinks } from '@/lib/linkified-text';

export default function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {parseHttpLinks(text).map((segment, index) => (
        segment.type === 'link' ? (
          <a
            key={`${segment.href}-${index}`}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline hover:text-blue-800"
          >
            {segment.text}
          </a>
        ) : (
          <Fragment key={`text-${index}`}>{segment.text}</Fragment>
        )
      ))}
    </>
  );
}
