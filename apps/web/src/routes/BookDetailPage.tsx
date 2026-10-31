import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { LibraryBook } from '@wisper-lib/shared-types';
import { api } from '@/lib/apiClient';
import BookCover from '@/components/BookCover';
import PreviewPlayer from '@/components/PreviewPlayer';

export default function BookDetailPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ['book', id], queryFn: ({signal}) => api.get<{data:LibraryBook}>(`/books/${id}`,{signal}), enabled: !!id });
  if (query.isPending) return <div className="route-loading" role="status">Opening this book…</div>;
  if (query.error || !query.data) return <div className="empty-state" role="alert"><h1>This book could not be opened</h1><p>{query.error?.message}</p><Link className="button button-primary" to="/library">Return to library</Link></div>;
  const book=query.data.data;
  return <section className="book-detail-page"><Link className="button button-quiet" to="/library">← Back to library</Link><div className="book-stage"><div className="stage-art"><BookCover book={book} large /></div><div className="stage-copy"><p className="eyebrow">{book.isOriginal?'Your manuscript':'Your personal edition'}</p><h1>{book.title}</h1><p className="stage-author">{book.author}</p><p className="stage-description">{book.description}</p><div className="stage-actions"><Link className="button button-primary" to={`/reader/${book.id}`}>Open book ↗</Link><Link className="button button-quiet" to={`/notes?bookId=${book.id}`}>Book notes</Link><Link className="button button-quiet" to={`/reviews?bookId=${book.id}`}>Write a review</Link>{book.isOriginal&&<Link className="button button-quiet" to={`/write/${book.id}`}>Writing desk</Link>}</div>{book.sourceUrl&&<p className="fine-print">Selected sample edition · <a href={book.sourceUrl} target="_blank" rel="noreferrer">Original source</a> · {book.license}</p>}</div></div><PreviewPlayer book={book}/></section>;
}
