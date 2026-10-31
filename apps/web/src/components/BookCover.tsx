import { useEffect, useState, type CSSProperties } from 'react';
import type { LibraryBook } from '@wisper-lib/shared-types';

export default function BookCover({ book, large = false }: { book: LibraryBook; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.id, book.coverPath, book.updatedAt]);
  return <div className={`book-cover ${large ? 'book-cover-large' : ''}`} style={{ '--cover-accent': book.accent } as CSSProperties}>
    {book.coverPath && !failed ? <img src={`/api/v1/books/${book.id}/cover?v=${encodeURIComponent(book.updatedAt)}`} alt={`Cover of ${book.title}`} loading={large ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} /> : <>
      <span className="cover-imprint">{book.isOriginal ? 'A personal edition' : book.license ? 'Open bookshelf' : 'Personal library'}</span>
      <span className="cover-ornament" aria-hidden="true">✦</span><strong>{book.title}</strong><span className="cover-author">{book.author || 'Your collection'}</span>
    </>}
    <span className="cover-sheen" aria-hidden="true" />
  </div>;
}
