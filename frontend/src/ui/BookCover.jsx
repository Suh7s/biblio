import React from 'react';

// A stable fallback for catalogue records without a usable cover image.
export function BookCover({ book, large = false }) {
  const [failedUrl, setFailedUrl] = React.useState(null);
  const color = [...(book.title || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % 5;
  if (book.coverImage && /^https?:\/\//i.test(book.coverImage) && failedUrl !== book.coverImage) {
    return <img src={book.coverImage} alt={large ? `Cover of ${book.title}` : ''} loading={large ? 'eager' : 'lazy'} onError={() => setFailedUrl(book.coverImage)} />;
  }
  return <div className={`cover-placeholder cover-tone-${color}${large ? ' large' : ''}`}>
    <span>BIBLIO COLLECTION<span className="cover-rule" /></span>
    <strong>{book.title}</strong>
    <span className="cover-bottom"><small>{book.authors?.[0] || 'Library edition'}</small><i>b.</i></span>
  </div>;
}
